import json
from pathlib import Path
import numpy as np
import pytest
from isolator.schemas.project import Project
from isolator.solvers.linear import LinearModel
from isolator.solvers.shock import solve_shock

fixtures = json.loads(Path(__file__).with_name("legacy-fixtures.json").read_text())


@pytest.mark.parametrize("fixture", fixtures, ids=[x["name"] for x in fixtures])
def test_last_legacy_behavior_preserved(fixture):
    p = Project.model_validate(fixture["project"])
    old = fixture["legacy"]
    m = LinearModel(p)
    assert [x.frequency_hz for x in m.modes()] == pytest.approx(old["modes"], rel=1e-9)
    stat = m.static()
    assert stat.cg_displacement_mm == pytest.approx(
        np.array(old["static"][:3]) * 1000, abs=1e-9
    )
    h = m.harmonic()
    psd = m.psd()
    s = solve_shock(m, p.shock.compensation_percent)
    assert h.response.connection_g == pytest.approx(
        old["harmonic"]["connection"], rel=1e-8, abs=1e-10
    )
    assert psd.response.connection_g == pytest.approx(
        old["psd"]["connection"], rel=1e-4, abs=1e-10
    )
    assert s.response.connection_g == pytest.approx(
        old["shock"]["connection"], rel=1e-4, abs=1e-9
    )
    assert s.response.local_mm == pytest.approx(
        np.array(old["shock"]["local"]), rel=1e-4, abs=1e-9
    )
    if m.flexible:
        assert s.response.sensor_g == pytest.approx(
            old["shock"]["sensor"], rel=1e-4, abs=1e-9
        )
