import hashlib
import json
import time
from datetime import datetime, timezone

import numpy as np

from isolator import __version__
from isolator.catalog.repository import (
    catalog,
    catalog_fingerprint,
    product,
    validate_assignments,
)
from isolator.schemas.project import Project
from isolator.schemas.results import AnalysisResult, Check
from .linear import LinearModel
from .shock import Cancelled, shock


def snapshot_id(project: Project):
    data = {
        "project": project.model_dump(),
        "catalog_sha256": catalog_fingerprint(),
        "solver_version": __version__,
    }
    return hashlib.sha256(
        json.dumps(
            data,
            sort_keys=True,
            separators=(",", ":"),
            ensure_ascii=False,
            allow_nan=False,
        ).encode()
    ).hexdigest()


def combine_status(statuses):
    for status in ["failed", "exceeded", "verify", "not_run"]:
        if status in statuses:
            return status
    return "within" if statuses else "not_run"


def analyze(
    project: Project, stage=lambda _: None, cancelled=lambda: False
) -> AnalysisResult:
    started = time.perf_counter()
    p = project.model_copy(deep=True)
    validate_assignments(p)
    checks = []
    warnings = []

    def progress(name):
        if cancelled():
            raise Cancelled()
        stage(name)

    def check(group, title, measured, limit, unit, mount=None, axis=None, detail=""):
        c = Check(
            id=f"{group}-{len(checks)}",
            group=group,
            status="within" if measured <= limit * (1 + 1e-10) else "exceeded",
            title=title,
            measured=float(measured),
            limit=float(limit),
            unit=unit,
            mount_id=mount,
            axis=axis,
            detail=detail,
        )
        checks.append(c)

    def note(group, title, detail, status="verify", mount=None):
        checks.append(
            Check(
                id=f"{group}-{len(checks)}",
                group=group,
                status=status,
                title=title,
                detail=detail,
                mount_id=mount,
            )
        )

    progress("Matrisler ve modal çözüm")
    model = LinearModel(p)
    progress("Statik denge ve katalog kontrolleri")
    static = model.static()
    for m, row in zip(p.mounts, static.mounts):
        pr = product(m.product_id)
        f = np.array(row.reaction_n)
        if pr is None or m.source == "user":
            note(
                "static",
                "Katalog / sürekli yük",
                "Kullanıcı katılığı; kapasite ve çalışma katılığı üreticiyle doğrulanmalı.",
                mount=m.id,
            )
            continue
        if pr.issue:
            note("static", "Katalog tutarsızlığı", pr.issue, mount=m.id)
            continue
        if pr.family == "lord":
            check(
                "static",
                "Axial sürekli yük",
                abs(f[2]),
                pr.capacity,
                "N",
                m.id,
                "Yerel 3",
            )
            if f[2] < 0 or np.linalg.norm(f[:2]) > max(1.0, abs(f[2]) * 0.05):
                note(
                    "static",
                    "Karma yük / çekme",
                    "LORD karma yük etkileşimi veya çekme kapasitesi doğrulanmadı.",
                    mount=m.id,
                )
        else:
            angle = np.rad2deg(np.arctan2(np.linalg.norm(f[:2]), abs(f[2])))
            branch = (
                ("comp" if f[2] >= 0 else "tens")
                if angle <= 0.5
                else (
                    ("comp45" if f[2] >= 0 else "tens45")
                    if abs(angle - 45) <= 0.5
                    else "shear"
                    if abs(angle - 90) <= 0.5
                    else None
                )
            )
            if branch in ["comp", "tens"] and m.catalog_branch != branch:
                note(
                    "static",
                    "Katalog uygulamasından sonra yük yönü değişti",
                    "Kayıtlı k_eq referans dalı yeni yük yönüyle farklı; ürünü yeniden uygulayın. Mevcut katılıklar korunarak hesaplandı.",
                    mount=m.id,
                )
            data = pr.directions.get(branch) if branch else None
            if data and data.F:
                check(
                    "static",
                    "SOCITEC yönlü referans yük",
                    np.linalg.norm(f),
                    data.F,
                    "N",
                    m.id,
                    branch,
                )
            else:
                note(
                    "static",
                    "SOCITEC karma yük",
                    "Bu açıda doğrulanmış kapasite/etkileşim verisi yok.",
                    mount=m.id,
                )
            note(
                "static",
                "Eşdeğer katılık tahmini",
                "k_eq=(F/g)(2πf)² kabul edildi; çalışma ön yükü teğet katılığı ve radyal eşdeğerlik ayrıca doğrulanmalı.",
                mount=m.id,
            )

    def response_checks(group, response, acceleration_limit, rms=False):
        for channel, values in [
            ("CG", response.cg_g),
            ("Bağlantı", response.connection_g),
            ("Sensör", response.sensor_g),
        ]:
            if values is not None:
                for axis, value in zip("XYZ", values):
                    check(
                        group,
                        channel + " ivmesi",
                        value,
                        acceleration_limit,
                        "g RMS" if rms else "g tepe",
                        axis=axis,
                        detail="Bağlantı geometrik ortalama veya seçili referans noktasıdır; en kötü izolatör değildir.",
                    )
        for m, values in zip(p.mounts, response.local_mm):
            for axis, value in enumerate(values, 1):
                measured = value * p.random.sigma if rms else value
                check(
                    group,
                    "Yerel bağıl hareket",
                    measured,
                    p.limits.local_motion_mm,
                    "mm",
                    m.id,
                    f"Yerel {axis}",
                    f"{p.random.sigma:g}σ × RMS; mutlak maksimum garantisi değildir."
                    if rms
                    else "Statik denge çevresindeki dinamik hareket.",
                )

    harmonic = psd = shock_result = None
    stages = [
        ("harmonic", p.harmonic.enabled, "Harmonik · kompleks frekans cevabı"),
        ("psd", p.random.enabled, "PSD · rezonans çevresinde entegrasyon"),
        ("shock", p.shock.enabled, "Şok · ön yük ve zaman integrasyonu"),
    ]
    for group, enabled, name in stages:
        if not enabled:
            note(group, "Analiz kapalı", "Bu analiz hesaplanmadı.", "not_run")
            continue
        progress(name)
        try:
            if group == "harmonic":
                harmonic = model.harmonic()
                response_checks(
                    group, harmonic.response, p.limits.harmonic_acceleration_g
                )
                check(
                    group,
                    "Bağlantı yönsel geçirgenliği",
                    harmonic.connection_transmissibility,
                    p.limits.harmonic_transmissibility,
                    "T",
                    axis="Ortak tahrik",
                )
                if harmonic.sensor_transmissibility is not None:
                    check(
                        group,
                        "Sensör yönsel geçirgenliği",
                        harmonic.sensor_transmissibility,
                        p.limits.harmonic_transmissibility,
                        "T",
                        axis="Ortak tahrik",
                    )
            elif group == "psd":
                psd = model.psd()
                response_checks(
                    group, psd.response, p.limits.psd_acceleration_g_rms, True
                )
            else:
                shock_result = shock(model, cancelled, progress)
                response_checks(
                    group,
                    shock_result.compensated.response,
                    p.limits.shock_acceleration_g,
                )
                for m, row in zip(p.mounts, shock_result.compensated.mounts):
                    pr = product(m.product_id)
                    if row.nonlinear and pr:
                        from .shock import catalog_law

                        law = catalog_law(
                            m, model.supports[p.mounts.index(m)], model.direction
                        )
                        for branch, value in zip(
                            law.keys,
                            [
                                max(0, -row.projection_min_mm),
                                max(0, row.projection_max_mm),
                            ],
                        ):
                            d = pr.directions[branch]
                            check(
                                "shock",
                                "Toplam yönlü katalog deformasyonu",
                                value,
                                d.shockD,
                                "mm",
                                m.id,
                                branch,
                                "Statik ön yük dahildir; şok F/d referansı.",
                            )
                            check(
                                "shock",
                                "Yönlü katalog sekant kuvveti",
                                value * d.shockF / d.shockD,
                                d.shockF,
                                "N",
                                m.id,
                                branch,
                            )
                    if not row.nonlinear:
                        warnings.append(f"{m.id} şok: {row.reason}")
                        if pr and pr.family == "soc":
                            note(
                                "shock",
                                "Yönlü şok verisi uygulanamadı",
                                row.reason,
                                mount=m.id,
                            )
                ratio = shock_result.velocity_ratio
                if p.shock.shape != "triangle" and ratio is not None:
                    check(
                        "shock",
                        "Hız penceresi nominalden sapma",
                        abs(ratio - 1) * 100,
                        20.0,
                        "%",
                        detail=f"Δv={shock_result.velocity_window_m_s:.6g} m/s; nominal={shock_result.nominal_velocity_m_s:.6g} m/s.",
                    )
                note("shock", "Standart ön kontrolünün kapsamı", shock_result.scope)
        except Cancelled:
            raise
        except (ValueError, np.linalg.LinAlgError, RuntimeError) as exc:
            note(group, "Analiz hesaplanamadı", str(exc), "failed")
            warnings.append(f"{name}: {exc}")
    progress("Sonuç snapshot'ı hazırlanıyor")
    return AnalysisResult(
        snapshot_id=snapshot_id(p),
        snapshot=p,
        created_at=datetime.now(timezone.utc).isoformat(),
        solver_version=__version__,
        catalog_revision=catalog().revision,
        catalog_sha256=catalog_fingerprint(),
        catalog_products=[
            pr.model_copy(deep=True)
            for key in dict.fromkeys(m.product_id for m in p.mounts)
            if (pr := product(key)) is not None
        ],
        duration_seconds=time.perf_counter() - started,
        modes=model.modes(),
        static=static,
        harmonic=harmonic,
        psd=psd,
        shock=shock_result,
        checks=checks,
        overall=combine_status([c.status for c in checks]),
        warnings=warnings,
        condition_number=model.condition,
        assumptions=[
            "İç hesaplar SI / float64; g=9,80665 m/s².",
            "Ataletler CG'de global asal eksenlerde; atalet çarpımları sıfır.",
            "R=Rz(yaw) Ry(pitch) Rx(roll); yerel 3 axial, yerel 1/2 radial.",
            "Sürekli kuvvet yalnız seçili yönde m·g·(1+ek ivme); ayrı bir ağırlık eklenmez.",
            "α=k_dyn/k_static ve ζ kullanıcı kabulüdür; üretici otomatik ataması değildir.",
            "PSD tek doğrultulu ortak taban girdisi; bant dışında sıfır, log-log enterpolasyon.",
            "Sensör esnek eşdeğer kütlenin birim mod şekilli hareketidir; rijit durumda yinelenen sensör gizlenir.",
            "Esnek etkin kütle toplam kütle ve ataletin içindedir; ikinci kez eklenmez. Statik yapısal esneme raporlanmaz.",
            "Şok DOP853, süreksizliklerde bölünmüş aralıklar; tüm kabul edilen aralıklarda yoğun tepe araması. Grafik örnek azaltması tepeyi değiştirmez.",
        ],
    )
