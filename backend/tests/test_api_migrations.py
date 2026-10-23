import copy
import time
import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError
from isolator.api.main import app
from isolator.schemas.project import Project
from isolator.schemas.migrations import migrate, parse_psd

client = TestClient(app)


def legacy(version):
    p = Project()
    return dict(
        schema=f"isolation-layout-v{version}",
        mounts=[
            dict(
                x=m.position_mm[0],
                y=m.position_mm[1],
                z=m.position_mm[2],
                roll=0.0,
                pitch=0.0,
                yaw=0.0,
                k1=60.0,
                k2=60.0,
                k3=90.0,
                model="Kullanıcı",
            )
            for m in p.mounts
        ],
        rig=dict(
            cx=0.0, cy=0.0, cz=100.0, ix=0.6, iy=1.0, iz=1.2, sx=0.0, sy=0.0, sz=0.0
        ),
        system=dict(m=40.0, alpha=1.4, zeta=0.125),
        structure=dict(
            flexible=True,
            fn=250.0,
            zeta=0.02,
            gain=99.0,
            massPercent=10.0,
            autoConnection=True,
        ),
        direction="0,0,1",
        vector=[0.0, 0.0, 1.0],
        psd="5 0.01\n500 0.04",
        shape="half",
        shockSettings=dict(law="bilinear", pre=5, post=15),
    )


@pytest.mark.parametrize("version", [1, 2, 3, 4])
def test_explicit_migration_versions(version):
    result = migrate(legacy(version))
    assert result.project.schema_version == "isolation-project-v5"
    assert result.project.structure.kind == ("flexible" if version == 4 else "rigid")
    assert result.project.shock.compensation_percent == 15
    assert any("ortak %15" in s for s in result.notices)
    assert "gain" not in result.project.structure.model_dump()


def test_bad_import_atomic_and_strict_numeric_validation():
    d = legacy(4)
    before = copy.deepcopy(d)
    d["mounts"][-1]["k3"] = -1.0
    response = client.post("/api/projects/migrate", json=d)
    assert response.status_code == 422
    assert before["mounts"][0] == d["mounts"][0]
    p = Project().model_dump()
    p["system"]["mass_kg"] = "40"
    assert client.post("/api/projects/validate", json=p).status_code == 422
    p = Project().model_dump()
    p["system"]["inertia_kg_m2"] = [1.0, 1.0, 4.0]
    assert client.post("/api/projects/validate", json=p).status_code == 422
    p = Project().model_dump()
    p["random"]["points"][1]["frequency_hz"] = 1.0
    assert client.post("/api/projects/validate", json=p).status_code == 422


def test_psd_locale_errors_and_no_ambiguous_splitting():
    assert parse_psd("5;0,01\n10;0,02")[0]["density_g2_hz"] == 0.01
    assert parse_psd("5\t0.01\n10\t0.02")[1]["frequency_hz"] == 10.0
    with pytest.raises(ValueError, match="satır 1"):
        parse_psd("5,0,01\n10,0,02")
    with pytest.raises(ValueError, match="satır 2"):
        parse_psd("10 .01\n5 .02")


def test_catalog_consent_and_manual_override():
    p = Project().model_dump()
    payload = {
        "project": p,
        "product_id": "C6H-1010",
        "mount_ids": ["I1"],
        "estimate_accepted": False,
    }
    assert client.post("/api/catalog/apply", json=payload).status_code == 422
    payload["estimate_accepted"] = True
    applied = client.post("/api/catalog/apply", json=payload)
    assert applied.status_code == 200
    modified = applied.json()
    modified["mounts"][0]["stiffness_n_mm"][0] *= 2
    assert client.post("/api/projects/validate", json=modified).status_code == 422
    modified["mounts"][0]["source"] = "user"
    assert client.post("/api/projects/validate", json=modified).status_code == 200


def test_jobs_snapshot_cache_cancel_and_failure():
    p = Project().model_dump()
    p["shock"]["enabled"] = False
    response = client.post("/api/jobs", json=p)
    assert response.status_code == 202
    job = response.json()
    for _ in range(150):
        job = client.get("/api/jobs/" + job["id"]).json()
        if job["status"] not in ["queued", "running"]:
            break
        time.sleep(0.02)
    assert job["status"] == "completed"
    assert job["snapshot_id"] == job["result"]["snapshot_id"]
    assert job["result"]["snapshot"]["system"]["mass_kg"] == 40.0
    cached = client.post("/api/jobs", json=p).json()
    assert cached["status"] == "completed"
    assert cached["result"]["snapshot_id"] == job["snapshot_id"]
    p["system"]["mass_kg"] = 41.0
    other = client.post("/api/jobs", json=p).json()
    assert other["snapshot_id"] != job["snapshot_id"]
    cancelled = client.post("/api/jobs/" + other["id"] + "/cancel", json={}).json()
    assert cancelled["status"] in ["cancelled", "completed"]
    assert client.get("/api/jobs/no-such-job").status_code == 404


@pytest.mark.parametrize("product_id", ["AM-004-6", "C6H-1010"])
def test_legacy_catalog_assignment_preserves_active_model(product_id):
    from isolator.catalog.repository import apply_product

    p = apply_product(
        Project(), product_id, ["I1", "I2", "I3", "I4"], product_id.startswith("C")
    )
    data = legacy(4)
    for old, m in zip(data["mounts"], p.mounts):
        old.update(
            model=product_id,
            proxy=m.estimate_accepted,
            k1=m.stiffness_n_mm[0],
            k2=m.stiffness_n_mm[1],
            k3=m.stiffness_n_mm[2],
        )
    result = migrate(data)
    assert result.project.mounts[0].source == (
        "derived" if product_id.startswith("C") else "catalog"
    )
    assert result.project.mounts[0].estimate_accepted == product_id.startswith("C")


def test_rotated_socitec_draft_recovers_without_silent_stiffness_change():
    from isolator.catalog.repository import apply_product

    p = apply_product(Project(), "C6H-1010", ["I1", "I2", "I3", "I4"], True)
    before = list(p.mounts[0].stiffness_n_mm)
    p.mounts[0].angles_deg = [180.0, 0.0, 0.0]
    recovered = client.post("/api/projects/migrate", json=p.model_dump())
    assert recovered.status_code == 200
    assert recovered.json()["project"]["mounts"][0]["stiffness_n_mm"] == before
