import math
import re

import numpy as np

from isolator.catalog.repository import apply_product, product, validate_assignments
from .project import Project
from .results import MigrationResult


def parse_psd(text: str):
    points = []
    for line_no, line in enumerate(text.strip().splitlines(), 1):
        if not line.strip():
            continue
        if ";" in line:
            cells = line.split(";")
        else:
            cells = line.split()
            # Legacy comma-separated rows are accepted only when a decimal point
            # makes the delimiter unambiguous. "5,1" alone is ambiguous.
            if len(cells) == 1 and line.count(",") == 1 and "." in line:
                cells = line.split(",")
        if len(cells) != 2:
            raise ValueError(
                f"PSD satır {line_no}: iki sütun bekleniyor. Ondalık virgülde sütun ayırıcı olarak noktalı virgül veya sekme kullanın."
            )
        values = []
        for col, cell in enumerate(cells, 1):
            if not re.fullmatch(
                r"[+]?(?:\d+(?:[.,]\d*)?|[.,]\d+)(?:[eE][+-]?\d+)?", cell.strip()
            ):
                raise ValueError(f"PSD satır {line_no}, sütun {col}: geçersiz sayı.")
            value = float(cell.strip().replace(",", "."))
            if not math.isfinite(value) or value <= 0:
                raise ValueError(
                    f"PSD satır {line_no}, sütun {col}: pozitif sonlu değer gerekli."
                )
            values.append(value)
        if points and values[0] <= points[-1]["frequency_hz"]:
            raise ValueError(
                f"PSD satır {line_no}, sütun 1: frekans önceki satırdan büyük olmalı."
            )
        points.append(dict(frequency_hz=values[0], density_g2_hz=values[1]))
    if len(points) < 2:
        raise ValueError("PSD en az iki satır içermeli.")
    return points


def migrate(data: dict) -> MigrationResult:
    notices = []
    if data.get("schema_version") == "isolation-project-v5":
        p = Project.model_validate(data)
        validate_assignments(p)
        return MigrationResult(project=p)
    version = data.get("schema")
    migrations = {f"isolation-layout-v{i}": i for i in range(1, 5)}
    if version not in migrations:
        raise ValueError(
            "Desteklenmeyen dosya sürümü; v1–v4 veya isolation-project-v5 gerekli."
        )
    rig, system = data["rig"], data["system"]
    required = ["cx", "cy", "cz", "ix", "iy", "iz", "sx", "sy", "sz"]
    for key in required:
        if (
            isinstance(rig[key], bool)
            or not isinstance(rig[key], (int, float))
            or not math.isfinite(rig[key])
        ):
            raise ValueError(f"Eski dosyada geçersiz rig.{key}")
    p = Project().model_dump()
    p["name"] = data.get("name", "Aktarılan yerleşim")
    p["system"].update(
        mass_kg=system.get("m", 40.0),
        cg_mm=[rig[k] for k in ["cx", "cy", "cz"]],
        inertia_kg_m2=[rig[k] for k in ["ix", "iy", "iz"]],
        damping=system.get("zeta", 0.125),
        dynamic_static_ratio=system.get("alpha", 1.4),
        extra_acceleration_g=system.get("acc", 0.0),
    )
    load = data.get("loadDirection", "0,0,-1")
    if load not in ["0,0,-1", "0,0,1", "1,0,0", "-1,0,0", "0,1,0", "0,-1,0"]:
        raise ValueError("Eski sürekli yük yönü geçersiz.")
    p["system"]["static_direction"] = [float(x) for x in load.split(",")]
    if data["direction"] == "custom":
        p["direction"] = data["vector"]
    elif data["direction"] in ["0,0,1", "1,0,0", "0,1,0"]:
        p["direction"] = [float(x) for x in data["direction"].split(",")]
    else:
        raise ValueError("Eski tahrik yönü geçersiz.")
    p["mounts"] = []
    for i, old in enumerate(data["mounts"]):
        if "proxy" in old and type(old["proxy"]) is not bool:
            raise ValueError(f"I{i + 1}: eski proxy kabulü mantıksal değer olmalı.")
        # Explicit conversion for v1, v2, v3 and v4's shared mount schema.
        m = dict(
            id=f"I{i + 1}",
            position_mm=[old[k] for k in ["x", "y", "z"]],
            angles_deg=[old[k] for k in ["roll", "pitch", "yaw"]],
            stiffness_n_mm=[old[k] for k in ["k1", "k2", "k3"]],
            source="user",
            product_id=old.get("model") if product(old.get("model")) else None,
        )
        p["mounts"].append(m)
    p["harmonic"].update(
        frequency_hz=system.get("f", 50.0), amplitude_g=system.get("a", 2.5)
    )
    p["random"].update(
        points=parse_psd(data["psd"]) if "psd" in data else p["random"]["points"],
        sigma=system.get("sigma", 3.0),
    )
    p["shock"].update(
        amplitude_g=system.get("shock", 20.0),
        duration_ms=system.get("tau", 11.0),
        shape=data.get("shape", "half"),
    )
    p["limits"].update(
        harmonic_acceleration_g=system.get("limit", 10.0),
        harmonic_transmissibility=1 - system.get("target", 80.0) / 100,
        shock_acceleration_g=system.get("limit", 10.0),
        psd_acceleration_g_rms=system.get("rmslimit", 3.0),
        local_motion_mm=system.get("space", 15.0),
    )
    if migrations[version] == 4:
        s = data["structure"]
        if type(s["flexible"]) is not bool or type(s["autoConnection"]) is not bool:
            raise ValueError("Eski yapı seçenekleri mantıksal değer olmalı.")
        p["structure"].update(
            kind="flexible" if s["flexible"] else "rigid",
            frequency_hz=s["fn"],
            damping=s["zeta"],
            mass_percent=s.get("massPercent", 10.0),
            automatic_connection=s["autoConnection"],
        )
        notices.append(
            "Eski structGain/gain ve manuel şok katılıkları aktif fizik parametresi olarak alınmadı."
        )
    else:
        p["structure"]["automatic_connection"] = False
    p["structure"]["connection_mm"] = [rig[k] for k in ["sx", "sy", "sz"]]
    if "shockSettings" in data:
        s = data["shockSettings"]
        if s.get("law") not in ["auto", "linear", "bilinear"] or any(
            type(s[k]) is not int or s[k] not in [0, 5, 10, 15, 20]
            for k in ["pre", "post"]
        ):
            raise ValueError("Eski kompanzasyon ayarı geçersiz.")
        p["shock"]["compensation_percent"] = max(s["pre"], s["post"])
        if s["pre"] != s["post"]:
            notices.append(
                f"Ön %{s['pre']} / son %{s['post']}, ortak %{max(s['pre'], s['post'])} kompanzasyona dönüştürüldü."
            )
    result = Project.model_validate(
        p
    )  # All validation completes before caller replaces its draft.
    for mount, old in zip(result.mounts, data["mounts"]):
        pr = product(mount.product_id)
        if pr is None or pr.issue:
            continue
        if pr.family == "soc" and not old.get("proxy", False):
            notices.append(
                f"{mount.id}: eski SOCITEC tahmin kabulü yok; katılık kullanıcı verisi olarak korundu."
            )
            continue
        candidate = apply_product(result, pr.id, [mount.id], pr.family == "soc")
        matched = next(m for m in candidate.mounts if m.id == mount.id)
        if np.allclose(
            mount.stiffness_n_mm, matched.stiffness_n_mm, rtol=1e-8, atol=1e-9
        ):
            mount.source = matched.source
            mount.estimate_accepted = matched.estimate_accepted
            mount.catalog_branch = matched.catalog_branch
            if pr.family == "soc":
                notices.append(
                    f"{mount.id}: eski proxy=true tahmin kabulü ve yönlü katalog şok modeli taşındı."
                )
        else:
            notices.append(
                f"{mount.id}: katalogdan farklı katılık/yük yönü; sayılar kullanıcı verisi olarak korundu, yeniden ürün uygulayabilirsiniz."
            )
    notices.append(
        f"{version} → isolation-project-v5 migrasyonu uygulandı. Katalog atamaları kayıtlı katılıkla karşılaştırılarak taşındı; ζ ve α değiştirilmedi."
    )
    validate_assignments(result)
    return MigrationResult(project=result, notices=notices)
