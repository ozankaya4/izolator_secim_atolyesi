import json
import hashlib
from functools import lru_cache
from pathlib import Path
from typing import Literal

import numpy as np
from pydantic import Field

from isolator.domain.geometry import G, rotation, unit
from isolator.schemas.project import Model, Mount, Project


class DirectionData(Model):
    F: float | None = None
    d: float | None = None
    shockF: float | None = None
    shockD: float | None = None
    doubleAmplitude: float | None = None
    fn: float | None = None


class Product(Model):
    id: str
    name: str
    series: str
    family: Literal["lord", "soc"]
    compound: str | None = None
    fn: float | None = None
    axial: float | None = None
    radial: float | None = None
    capacity: float | None = None
    photo: str
    source: str
    issue: str | None = None
    source_page: int | None = None
    retrieved_at: str
    directions: dict[str, DirectionData] | None = None
    height: float | None = None
    width: float | None = None
    mass: float | None = None


class Catalog(Model):
    schema_version: str
    revision: str
    units: dict[str, str]
    provenance: str
    products: list[Product]


@lru_cache
def _catalog_snapshot():
    raw = Path(__file__).with_name("catalog-v1.json").read_bytes()
    return Catalog.model_validate_json(raw), hashlib.sha256(raw).hexdigest()


def catalog() -> Catalog:
    return _catalog_snapshot()[0]


def catalog_fingerprint() -> str:
    return _catalog_snapshot()[1]


def product(product_id: str | None) -> Product | None:
    return next((p for p in catalog().products if p.id == product_id), None)


def catalog_stiffness(p: Product, branch: str | None):
    if p.family == "lord":
        return [p.radial, p.radial, p.axial]
    if branch not in ["comp", "tens"]:
        raise ValueError(
            "SOCITEC türetilmiş katılığın referans basma/çekme dalı gerekli."
        )

    def eq(key):
        data = p.directions[key]
        if not data.F or not data.fn:
            raise ValueError("Katalog yönünde F/f verisi eksik.")
        return data.F / G * (2 * np.pi * data.fn) ** 2 / 1000

    return [eq("shear"), eq("shear"), eq(branch)]


def apply_product(
    project: Project, product_id: str, mount_ids: list[str], accepted: bool
) -> Project:
    p = product(product_id)
    if not p:
        raise ValueError("Katalog ürünü bulunamadı.")
    if p.issue:
        raise ValueError(p.issue + " Otomatik aktarım kapalı.")
    if not mount_ids or not set(mount_ids).issubset({m.id for m in project.mounts}):
        raise ValueError("Geçerli izolatör seçin.")
    if p.family == "soc" and not accepted:
        raise ValueError("SOCITEC eşdeğer katılık tahmini açıkça kabul edilmeli.")
    out = project.model_copy(deep=True)
    for m in out.mounts:
        if m.id not in mount_ids:
            continue
        branch = (
            "comp"
            if (rotation(m.angles_deg).T @ unit(project.system.static_direction))[2]
            <= 0
            else "tens"
        )
        m.stiffness_n_mm = catalog_stiffness(p, branch)
        m.product_id = p.id
        m.source = "catalog" if p.family == "lord" else "derived"
        m.estimate_accepted = accepted if p.family == "soc" else False
        m.catalog_branch = branch if p.family == "soc" else None
    return Project.model_validate(out.model_dump())


def validate_assignments(project: Project):
    for m in project.mounts:
        p = product(m.product_id)
        if m.product_id is not None and p is None:
            raise ValueError(f"{m.id}: bilinmeyen katalog kimliği.")
        if m.source != "user":
            if not p or p.issue:
                raise ValueError(f"{m.id}: katalog ataması doğrulanamadı.")
            if p.family == "soc" and (m.source != "derived" or not m.estimate_accepted):
                raise ValueError(f"{m.id}: SOCITEC tahmin kabulü eksik.")
            if p.family == "lord" and m.source != "catalog":
                raise ValueError(f"{m.id}: LORD veri kaynağı hatalı.")
            # Prevent a JSON file from falsely labelling edited values as catalog data.
            expected = catalog_stiffness(p, m.catalog_branch)
            if not np.allclose(m.stiffness_n_mm, expected, rtol=1e-10, atol=1e-10):
                raise ValueError(
                    f"{m.id}: katılık kayıtlı katalog referansıyla uyuşmuyor; ürünü yeniden uygulayın veya kaynağı kullanıcı yapın."
                )
