import importlib
import threading
from collections import OrderedDict
from unittest.mock import Mock

import pytest
from fastapi.testclient import TestClient

from isolator.schemas.project import Project

api = importlib.import_module("isolator.api.main")
client = TestClient(api.app)


@pytest.mark.parametrize(
    "body",
    [
        '{"system":{"mass_kg":NaN}}',
        '{"system":{"mass_kg":1e9999}}',
        '{"name":"first","name":"second"}',
        "[" * 1100 + "0" + "]" * 1100,
    ],
)
def test_invalid_json_cannot_crash_or_echo_inputs(body):
    response = client.post(
        "/api/projects/migrate",
        content=body,
        headers={"Content-Type": "application/json"},
    )
    assert response.status_code == 422
    assert "Traceback" not in response.text
    assert response.headers["cache-control"] == "no-store"


def test_body_limit_with_and_without_content_length():
    body = b'{"padding":"' + b"x" * 262144 + b'"}'
    assert (
        client.post(
            "/api/jobs", content=body, headers={"Content-Type": "application/json"}
        ).status_code
        == 413
    )
    response = client.post(
        "/api/jobs",
        content=iter([body[:100], body[100:]]),
        headers={"Content-Type": "application/json"},
    )
    assert response.status_code == 413


def test_simple_cross_origin_form_content_type_is_rejected():
    assert (
        client.post(
            "/api/jobs", content="{}", headers={"Content-Type": "text/plain"}
        ).status_code
        == 415
    )


def test_validation_does_not_echo_customer_information():
    project = Project().model_dump()
    project["system"]["mass_kg"] = {"private-customer-note": "do not echo"}
    response = client.post("/api/projects/validate", json=project)
    assert response.status_code == 422
    assert "private-customer-note" not in response.text
    assert "mass_kg" in response.text


def test_cancelling_queued_jobs_cannot_grow_executor_queue(monkeypatch):
    # Drain any work from other API tests, then isolate the admission controls.
    api.executor.submit(lambda: None).result(timeout=15)
    submitted = Mock()
    monkeypatch.setattr(api, "executor", submitted)
    monkeypatch.setattr(api, "work_slots", threading.BoundedSemaphore(4))
    monkeypatch.setattr(api, "jobs", OrderedDict())
    monkeypatch.setattr(api, "cache", OrderedDict())
    for index in range(4):
        project = Project(name=f"bounded-{index}")
        response = client.post("/api/jobs", json=project.model_dump())
        assert response.status_code == 202
        assert (
            client.post(
                "/api/jobs/" + response.json()["id"] + "/cancel", json={}
            ).status_code
            == 200
        )
    rejected = client.post("/api/jobs", json=Project(name="overflow").model_dump())
    assert rejected.status_code == 429
    assert submitted.submit.call_count == 4


def test_project_details_are_optional_bounded_and_snapshot_serializable():
    old = Project().model_dump()
    del old["details"]
    result = client.post("/api/projects/migrate", json=old)
    assert result.status_code == 200
    assert result.json()["project"]["details"]["customer"] == ""
    old["details"] = {"notes": "x" * 4001}
    assert client.post("/api/projects/migrate", json=old).status_code == 422
    old["name"] = "   "
    assert client.post("/api/projects/migrate", json=old).status_code == 422


def test_deadline_rejects_a_late_result_instead_of_caching_it(monkeypatch):
    project = Project()
    job = {
        "cancel": threading.Event(),
        "read": api.JobRead(
            id="timeout", snapshot_id="test", status="queued", stage="Sırada"
        ),
    }
    monkeypatch.setattr(api, "jobs", {"timeout": job})
    monkeypatch.setattr(api, "cache", OrderedDict())
    clock = iter([0.0, 46.0, 46.0])
    monkeypatch.setattr(api.time, "monotonic", lambda: next(clock))
    monkeypatch.setattr(api, "analyze", lambda *args: object())
    api._run_job("timeout", project)
    assert job["read"].status == "failed"
    assert "45 saniye" in job["read"].error
    assert not api.cache
