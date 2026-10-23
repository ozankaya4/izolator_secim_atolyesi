import logging
import threading
import time
import uuid
from collections import OrderedDict
from concurrent.futures import ThreadPoolExecutor
from contextlib import asynccontextmanager
from typing import Annotated, Any

from fastapi import Body, FastAPI, HTTPException
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from pydantic import Field, ValidationError

from isolator import __version__
from isolator.catalog.repository import (
    Catalog,
    apply_product,
    catalog,
    validate_assignments,
)
from isolator.schemas.migrations import migrate
from isolator.schemas.project import Model, Project
from isolator.schemas.results import JobRead, MigrationResult
from isolator.solvers.analysis import analyze, snapshot_id
from isolator.solvers.shock import Cancelled

from .security import JsonBounds

log = logging.getLogger(__name__)
executor = ThreadPoolExecutor(max_workers=1, thread_name_prefix="solver")
jobs: OrderedDict[str, dict] = OrderedDict()
cache: OrderedDict[str, Any] = OrderedDict()
lock = threading.RLock()
work_slots = threading.BoundedSemaphore(4)
MAX_JOB_SECONDS = 45


@asynccontextmanager
async def lifespan(app):
    yield
    with lock:
        for job in jobs.values():
            job["cancel"].set()


app = FastAPI(title="İzolatör Seçim Atölyesi", version=__version__, lifespan=lifespan)
app.add_middleware(JsonBounds)


@app.exception_handler(RequestValidationError)
async def validation_error(_request, exc):
    # FastAPI's default error includes input; NaN also breaks JSON serialization.
    return JSONResponse(
        status_code=422,
        content={
            "detail": [
                {
                    "field": ".".join(str(part)[:160] for part in error["loc"]),
                    "message": error["msg"][:500],
                }
                for error in exc.errors()[:30]
            ]
        },
    )


class ApplyRequest(Model):
    project: Project
    product_id: str = Field(max_length=80)
    mount_ids: list[str] = Field(min_length=1, max_length=20)
    estimate_accepted: bool = False


def user_error(exc):
    if isinstance(exc, ValidationError):
        return [
            {"field": ".".join(str(x) for x in e["loc"]), "message": e["msg"]}
            for e in exc.errors()
        ]
    return str(exc)


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok", "version": __version__}


@app.get("/api/catalog", response_model=Catalog)
def get_catalog():
    return catalog()


@app.get("/api/projects/default", response_model=Project)
def default_project():
    return Project()


@app.post("/api/projects/validate", response_model=Project)
def validate_project(project: Project):
    try:
        validate_assignments(project)
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc
    return project


@app.post("/api/projects/migrate", response_model=MigrationResult)
def migrate_project(data: Annotated[dict[str, Any], Body()]):
    try:
        return migrate(data)
    except (ValueError, KeyError, TypeError) as exc:
        raise HTTPException(422, user_error(exc)) from exc


@app.post("/api/catalog/apply", response_model=Project)
def apply(request: ApplyRequest):
    try:
        return apply_product(
            request.project,
            request.product_id,
            request.mount_ids,
            request.estimate_accepted,
        )
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc


def run_job(job_id, project):
    try:
        _run_job(job_id, project)
    finally:
        # Cancellation does not free a slot until its queued work item is consumed.
        work_slots.release()


def _run_job(job_id, project):
    with lock:
        job = jobs.get(job_id)
        if job is None or job["cancel"].is_set():
            return
        job["read"].status = "running"

    def stage(value):
        with lock:
            job["read"].stage = value

    started = time.monotonic()

    def cancelled():
        return job["cancel"].is_set() or time.monotonic() - started > MAX_JOB_SECONDS

    try:
        result = analyze(project, stage, cancelled)
        with lock:
            if cancelled():
                raise Cancelled()
            job["read"].result = result
            job["read"].status = "completed"
            job["read"].stage = "Tamamlandı"
            # Cache is input-hash bound; no stale draft is consulted.
            cache[result.snapshot_id] = result
            while len(cache) > 3:
                cache.popitem(last=False)
    except Cancelled:
        with lock:
            timed_out = (
                not job["cancel"].is_set()
                and time.monotonic() - started > MAX_JOB_SECONDS
            )
            job["read"].status = "failed" if timed_out else "cancelled"
            job["read"].stage = "Süre sınırı aşıldı" if timed_out else "İptal edildi"
            if timed_out:
                job[
                    "read"
                ].error = "Hesaplama 45 saniyelik iş sınırını aştı. Girdileri ve sayısal ayarları gözden geçirin."
    except Exception as exc:
        log.exception("Analysis job failed")
        with lock:
            job["read"].status = "failed"
            job["read"].error = (
                str(exc)
                if isinstance(exc, (ValueError, RuntimeError))
                else "Beklenmeyen hesaplama hatası; API günlüğünü inceleyin."
            )
            job["read"].stage = "Hesaplanamadı"


@app.post("/api/jobs", response_model=JobRead, status_code=202)
def start_job(project: Project):
    try:
        validate_assignments(project)
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc
    with lock:
        key, job_id = snapshot_id(project), str(uuid.uuid4())
        for old_id in list(jobs):
            if len(jobs) < 12:
                break
            if jobs[old_id]["read"].status not in ["queued", "running"]:
                del jobs[old_id]
        cached = cache.get(key)
        if not cached and not work_slots.acquire(blocking=False):
            raise HTTPException(
                429,
                "Hesap kuyruğu dolu; iptal edilen işler temizlendikten sonra yeniden deneyin.",
                headers={"Retry-After": "3"},
            )
        read = JobRead(
            id=job_id,
            snapshot_id=key,
            stage="Önbellekteki aynı snapshot" if cached else "Sırada",
            status="completed" if cached else "queued",
            result=cached,
        )
        jobs[job_id] = {
            "read": read,
            "cancel": threading.Event(),
            "created": time.monotonic(),
        }
        if not cached:
            try:
                executor.submit(run_job, job_id, project.model_copy(deep=True))
            except Exception:
                work_slots.release()
                del jobs[job_id]
                raise
        return read.model_copy(deep=True)


@app.get("/api/jobs/{job_id}", response_model=JobRead)
def get_job(job_id: str):
    with lock:
        if job_id not in jobs:
            raise HTTPException(404, "Hesap işi bulunamadı.")
        return jobs[job_id]["read"].model_copy(deep=True)


@app.post("/api/jobs/{job_id}/cancel", response_model=JobRead)
def cancel_job(job_id: str):
    with lock:
        if job_id not in jobs:
            raise HTTPException(404, "Hesap işi bulunamadı.")
        job = jobs[job_id]
        if job["read"].status in ["queued", "running"]:
            job["cancel"].set()
            job["read"].status = "cancelled"
            job["read"].stage = "İptal edildi"
        return job["read"].model_copy(deep=True)
