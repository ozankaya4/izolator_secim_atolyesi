from typing import Annotated, Literal

import numpy as np
from pydantic import BaseModel, ConfigDict, Field, model_validator

Number = Annotated[float, Field(allow_inf_nan=False, ge=-1e9, le=1e9)]
Positive = Annotated[float, Field(gt=0, le=1e9, allow_inf_nan=False)]
Vector = Annotated[list[Number], Field(min_length=3, max_length=3)]
Stiffness = Annotated[list[Positive], Field(min_length=3, max_length=3)]


class Model(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True, validate_default=True)


class Mount(Model):
    id: str = Field(min_length=1, max_length=80)
    position_mm: Vector
    angles_deg: Vector = [0.0, 0.0, 0.0]
    stiffness_n_mm: Stiffness = [60.0, 60.0, 90.0]
    product_id: str | None = None
    source: Literal["user", "catalog", "derived"] = "user"
    estimate_accepted: bool = False
    catalog_branch: Literal["comp", "tens"] | None = None


class Structure(Model):
    kind: Literal["rigid", "flexible"] = "rigid"
    frequency_hz: Positive = 250.0
    damping: float = Field(default=0.02, ge=0.001, le=1, allow_inf_nan=False)
    mass_percent: float = Field(default=10.0, ge=0.01, le=99.0, allow_inf_nan=False)
    automatic_connection: bool = True
    connection_mm: Vector = [0.0, 0.0, 0.0]


class System(Model):
    mass_kg: float = Field(default=40.0, gt=0, le=100000.0, allow_inf_nan=False)
    cg_mm: Vector = [0.0, 0.0, 100.0]
    inertia_kg_m2: Stiffness = [0.6, 1.0, 1.2]
    static_direction: Vector = [0.0, 0.0, -1.0]
    extra_acceleration_g: float = Field(
        default=0.0, ge=0, le=100.0, allow_inf_nan=False
    )
    damping: float = Field(default=0.125, ge=0.002, le=1.0, allow_inf_nan=False)
    dynamic_static_ratio: float = Field(
        default=1.4, ge=0.1, le=10.0, allow_inf_nan=False
    )

    @model_validator(mode="after")
    def physical_inertia(self):
        a = self.inertia_kg_m2
        if 2 * max(a) > sum(a) * (1 + 1e-12):
            raise ValueError("Asal ataletler üçgen eşitsizliğine uymalı.")
        if np.linalg.norm(self.static_direction) < 1e-10:
            raise ValueError("Sürekli yük yönü sıfır olamaz.")
        return self


class Harmonic(Model):
    enabled: bool = True
    frequency_hz: float = Field(default=50.0, gt=0, le=100000.0, allow_inf_nan=False)
    amplitude_g: float = Field(default=2.5, ge=0, le=10000.0, allow_inf_nan=False)


class PSDPoint(Model):
    frequency_hz: Positive
    density_g2_hz: Positive


class RandomLoad(Model):
    enabled: bool = True
    points: list[PSDPoint] = Field(
        default_factory=lambda: [
            PSDPoint(frequency_hz=f, density_g2_hz=s)
            for f, s in [(5.0, 0.01), (20.0, 0.04), (200.0, 0.04), (500.0, 0.01)]
        ],
        min_length=2,
        max_length=500,
    )
    sigma: float = Field(default=3.0, ge=1, le=6, allow_inf_nan=False)

    @model_validator(mode="after")
    def increasing(self):
        if any(
            b.frequency_hz <= a.frequency_hz
            for a, b in zip(self.points, self.points[1:])
        ):
            raise ValueError(
                "PSD frekansları kesin artan olmalı; yinelenen satır kabul edilmez."
            )
        return self


class Shock(Model):
    enabled: bool = True
    amplitude_g: float = Field(default=20.0, ge=0, le=100000.0, allow_inf_nan=False)
    duration_ms: float = Field(default=11.0, ge=0.01, le=10000.0, allow_inf_nan=False)
    shape: Literal["half", "saw", "triangle"] = "half"
    compensation_percent: Literal[0, 5, 10, 15, 20] = 0


class Limits(Model):
    harmonic_acceleration_g: Positive = 10.0
    harmonic_transmissibility: Positive = 0.2
    psd_acceleration_g_rms: Positive = 3.0
    shock_acceleration_g: Positive = 10.0
    local_motion_mm: Positive = 15.0


class Numerics(Model):
    rtol: float = Field(default=1e-7, ge=1e-10, le=1e-4, allow_inf_nan=False)
    atol: float = Field(default=1e-9, ge=1e-12, le=1e-6, allow_inf_nan=False)
    psd_resolution: int = Field(default=400, ge=150, le=1200)


class Project(Model):
    schema_version: Literal["isolation-project-v5"] = "isolation-project-v5"
    name: str = Field(default="Yeni izolasyon projesi", min_length=1, max_length=120)
    system: System = Field(default_factory=System)
    structure: Structure = Field(default_factory=Structure)
    mounts: list[Mount] = Field(
        default_factory=lambda: [
            Mount(id=f"I{i + 1}", position_mm=[float(x), float(y), 0.0])
            for i, (x, y) in enumerate(
                [(-150, -100), (150, -100), (150, 100), (-150, 100)]
            )
        ],
        min_length=2,
        max_length=20,
    )
    direction: Vector = [0.0, 0.0, 1.0]
    harmonic: Harmonic = Field(default_factory=Harmonic)
    random: RandomLoad = Field(default_factory=RandomLoad)
    shock: Shock = Field(default_factory=Shock)
    limits: Limits = Field(default_factory=Limits)
    numerics: Numerics = Field(default_factory=Numerics)

    @model_validator(mode="after")
    def unique_mounts_and_direction(self):
        if len(set(m.id for m in self.mounts)) != len(self.mounts):
            raise ValueError("İzolatör kimlikleri benzersiz olmalı.")
        if np.linalg.norm(self.direction) < 1e-10:
            raise ValueError("Ortak tahrik yönü sıfır olamaz.")
        return self
