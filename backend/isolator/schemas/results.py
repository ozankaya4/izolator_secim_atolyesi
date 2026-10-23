from typing import Literal
from pydantic import Field
from .project import Model, Project
from isolator.catalog.repository import Product

Status = Literal["within", "exceeded", "verify", "failed", "not_run"]


class Check(Model):
    id: str
    group: Literal["static", "harmonic", "psd", "shock"]
    status: Status
    title: str
    measured: float | None = None
    limit: float | None = None
    unit: str = ""
    mount_id: str | None = None
    axis: str | None = None
    detail: str = ""


class Mode(Model):
    frequency_hz: float
    damping: float
    participation_percent: float
    shape: list[float]


class StaticMount(Model):
    mount_id: str
    local_displacement_mm: list[float]
    reaction_n: list[float]


class StaticResult(Model):
    cg_displacement_mm: list[float]
    cg_rotation_mrad: list[float]
    mounts: list[StaticMount]


class Response(Model):
    cg_g: list[float]
    connection_g: list[float]
    sensor_g: list[float] | None = None
    local_mm: list[list[float]]


class HarmonicResult(Model):
    response: Response
    connection_transmissibility: float
    sensor_transmissibility: float | None = None
    phase_deg: list[float]
    # [Hz, connection T, sensor T (flexible only)]
    spectrum: list[list[float]]


class PSDResult(Model):
    input_g_rms: float
    response: Response
    sigma: float
    # [Hz, input g²/Hz, connection XYZ sum g²/Hz, sensor XYZ sum]
    spectrum: list[list[float]]
    integration_points: int


class ShockMount(Model):
    mount_id: str
    nonlinear: bool
    angle_deg: float
    reason: str
    compression_n_mm: float | None = None
    tension_n_mm: float | None = None
    preload_mm: list[float]
    total_min_mm: list[float]
    total_max_mm: list[float]
    projection_min_mm: float
    projection_max_mm: float


class ShockRun(Model):
    response: Response
    connection_relative_mm: list[float]
    sensor_relative_mm: list[float] | None = None
    mounts: list[ShockMount]
    # [ms from main start, input g, connection g, sensor g, connection mm, sensor mm]
    samples: list[list[float]]
    end_ms: float
    main_start_ms: float
    net_velocity_m_s: float
    final_displacement_m: float
    accepted_steps: int
    peak_evaluations: int
    tail_envelope: float


class ShockResult(Model):
    compensated: ShockRun
    pure: ShockRun | None = None
    velocity_window_m_s: float
    nominal_velocity_m_s: float
    velocity_ratio: float | None = None
    scope: str


class AnalysisResult(Model):
    snapshot_id: str
    snapshot: Project
    created_at: str
    solver_version: str
    catalog_revision: str
    catalog_sha256: str
    catalog_products: list[Product]
    duration_seconds: float
    modes: list[Mode]
    static: StaticResult
    harmonic: HarmonicResult | None = None
    psd: PSDResult | None = None
    shock: ShockResult | None = None
    checks: list[Check]
    overall: Status
    warnings: list[str]
    assumptions: list[str]
    condition_number: float


class JobRead(Model):
    id: str
    snapshot_id: str
    stage: str
    status: Literal["queued", "running", "completed", "cancelled", "failed"]
    result: AnalysisResult | None = None
    error: str | None = None


class MigrationResult(Model):
    project: Project
    notices: list[str] = Field(default_factory=list)
