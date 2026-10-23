import logging
import threading
import time
import uuid
from collections import OrderedDict
from concurrent.futures import ThreadPoolExecutor
from contextlib import asynccontextmanager
from typing import Any

from fastapi import Body, FastAPI, HTTPException
from pydantic import ValidationError

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

log = logging.getLogger(__name__)
executor = ThreadPoolExecutor(max_workers=1, thread_name_prefix="solver")
jobs: OrderedDict[str, dict] = OrderedDict()
cache: OrderedDict[str, Any] = OrderedDict()
lock = threading.RLock()


@asynccontextmanager
async def lifespan(app):
    yield
    with lock:
        for job in jobs.values():
            job["cancel"].set()


app = FastAPI(title="İzolatör Seçim Atölyesi", version=__version__, lifespan=lifespan)


class ApplyRequest(Model):
    project: Project
    product_id: str
    mount_ids: list[str]
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
def migrate_project(data: dict[str, Any] = Body(...)):
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
    with lock:
        job = jobs.get(job_id)
        if job is None or job["cancel"].is_set():
            return
        job["read"].status = "running"

    def stage(value):
        with lock:
            job["read"].stage = value

    try:
        result = analyze(project, stage, job["cancel"].is_set)
        with lock:
            if job["cancel"].is_set():
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
            job["read"].status = "cancelled"
            job["read"].stage = "İptal edildi"
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
        active = sum(j["read"].status in ["queued", "running"] for j in jobs.values())
        if active >= 4:
            raise HTTPException(
                429, "Hesap kuyruğu dolu; mevcut işi tamamlayın veya iptal edin."
            )
        key, job_id = snapshot_id(project), str(uuid.uuid4())
        for old_id in list(jobs):
            if len(jobs) < 12:
                break
            if jobs[old_id]["read"].status not in ["queued", "running"]:
                del jobs[old_id]
        cached = cache.get(key)
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
            executor.submit(run_job, job_id, project.model_copy(deep=True))
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
