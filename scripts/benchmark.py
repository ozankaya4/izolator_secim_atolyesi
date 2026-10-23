import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))
"""Same-input numerical comparison; timings exclude HTTP/startup and are not a speed claim."""
import json
import statistics
import subprocess
import time
from pathlib import Path
import numpy as np
from isolator.catalog.repository import apply_product
from isolator.schemas.project import Project
from isolator.solvers.linear import LinearModel
from isolator.solvers.shock import solve_shock

root = Path(__file__).resolve().parents[1]
scenarios = []
p = Project()
scenarios.append(("rigid", p))
p = Project()
p.structure.kind = "flexible"
p.structure.frequency_hz = 38.0
p.shock.compensation_percent = 10
scenarios.append(("flexible-compensated", p))
p = Project()
p.direction = [1.0, 0.0, 1.0]
p.system.cg_mm = [10.0, -20.0, 80.0]
for i, m in enumerate(p.mounts):
    m.angles_deg = [0.0, 45.0, i * 90.0]
p = apply_product(p, "C6H-1010", [m.id for m in p.mounts], True)
p.shock.compensation_percent = 5
scenarios.append(("socitec-directional", p))
fixtures = []
summary = []
for name, p in scenarios:
    old_times = []
    new_times = []
    for repeat in range(3):
        legacy = json.loads(
            subprocess.check_output(
                ["node", str(root / "scripts/legacy_runner.mjs")],
                input=p.model_dump_json().encode(),
            )
        )
        old_times.append(legacy["duration_ms"])
        start = time.perf_counter()
        model = LinearModel(p)
        static = model.static()
        h = model.harmonic()
        psd = model.psd()
        s = solve_shock(model, p.shock.compensation_percent)
        if p.shock.compensation_percent:
            solve_shock(model, 0)
        new_times.append((time.perf_counter() - start) * 1000)

    def rel(a, b):
        a, b = np.asarray(a), np.asarray(b)
        return float(np.max(abs(a - b) / np.maximum(abs(b), 1e-5)))

    errors = {
        "modes": rel([m.frequency_hz for m in model.modes()], legacy["modes"]),
        "harmonic": rel(h.response.connection_g, legacy["harmonic"]["connection"]),
        "psd": rel(psd.response.connection_g, legacy["psd"]["connection"]),
        "shock": rel(s.response.connection_g, legacy["shock"]["connection"]),
        "shock_local": rel(s.response.local_mm, legacy["shock"]["local"]),
    }
    fixtures.append(dict(name=name, project=p.model_dump(), legacy=legacy))
    summary.append(
        dict(
            scenario=name,
            legacy_ms_median=statistics.median(old_times),
            python_ms_median=statistics.median(new_times),
            max_relative_error=errors,
            legacy_steps=legacy["shock"]["steps"],
            python_steps=s.accepted_steps,
        )
    )
    print(name, summary[-1], flush=True)
(root / "backend/tests/legacy-fixtures.json").write_text(
    json.dumps(fixtures, ensure_ascii=False, indent=2) + "\n"
)
(root / "docs/benchmark.json").write_text(json.dumps(summary, indent=2) + "\n")
