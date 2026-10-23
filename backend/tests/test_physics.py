import numpy as np
import pytest
from scipy.integrate import quad
from scipy.linalg import eigh

from isolator.catalog.repository import apply_product, catalog
from isolator.domain.geometry import G, rotation
from isolator.schemas.project import Project
from isolator.solvers.analysis import analyze, combine_status
from isolator.solvers.linear import LinearModel, interpolate_psd
from isolator.solvers.shock import (
    Cancelled,
    Profile,
    catalog_law,
    shock_preload,
    solve_shock,
)


def symmetric():
    p = Project()
    p.system.cg_mm = [0.0, 0.0, 0.0]
    p.system.inertia_kg_m2 = [1.0, 1.0, 1.0]
    for m in p.mounts:
        m.stiffness_n_mm = [50.0, 50.0, 50.0]
    return p


def test_catalog_preserved():
    data = catalog()
    assert len(data.products) == 175
    assert sum(x.family == "lord" for x in data.products) == 126
    assert sum(x.family == "soc" for x in data.products) == 49
    assert all(x.source and x.retrieved_at and x.id for x in data.products)
    assert any(x.issue for x in data.products)


def test_rotation_convention():
    R = rotation([23.0, 17.0, 61.0])
    assert np.allclose(R.T @ R, np.eye(3))
    assert np.linalg.det(R) == pytest.approx(1.0)
    assert rotation([0.0, 0.0, 90.0]) @ [1.0, 0.0, 0.0] == pytest.approx(
        [0.0, 1.0, 0.0], abs=1e-14
    )


def test_static_uses_alpha_and_single_force_direction():
    p = symmetric()
    p.system.static_direction = [1.0, 0.0, 0.0]
    p.system.extra_acceleration_g = 2.0
    model = LinearModel(p)
    static = model.static()
    expected = p.system.mass_kg * G * 3 * p.system.dynamic_static_ratio / 200000 * 1000
    assert static.cg_displacement_mm == pytest.approx([expected, 0.0, 0.0], abs=1e-12)
    assert np.sum(
        [s.R @ np.array(r.reaction_n) for s, r in zip(model.supports, static.mounts)],
        axis=0,
    ) == pytest.approx([-40 * G * 3, 0.0, 0.0], abs=1e-10)


def test_modes_and_complex_harmonic_match_sdof():
    p = symmetric()
    model = LinearModel(p)
    natural = np.sqrt(200000 / 40) / (2 * np.pi)
    assert min(abs(model.frequencies - natural)) < 1e-12
    f = np.array([0.1, natural, 40.0, 100.0])
    _, _, con, _, local = model.transfer(f)
    ratio = f / natural
    analytical = (1 + 2j * p.system.damping * ratio) / (
        1 - ratio**2 + 2j * p.system.damping * ratio
    )
    assert con[:, 2] == pytest.approx(analytical, rel=1e-12)
    assert np.angle(con[1, 2]) < 0
    assert local[:, 0, 2] == pytest.approx(
        -1
        / (
            (2 * np.pi * natural) ** 2
            - (2 * np.pi * f) ** 2
            + 2j * p.system.damping * (2 * np.pi * natural) * (2 * np.pi * f)
        ),
        rel=1e-12,
    )


def test_coupled_mass_not_added_twice_and_full_damping():
    p = symmetric()
    p.structure.kind = "flexible"
    p.structure.frequency_hz = 25.0
    p.structure.automatic_connection = False
    p.structure.connection_mm = [40.0, 30.0, 20.0]
    model = LinearModel(p)
    assert model.M[0, 0] == 40.0
    assert model.M[6, 6] == 4.0
    assert np.count_nonzero(abs(model.M[:6, 6]) > 1e-12) >= 3
    assert np.max(abs(model.phi.T @ model.M @ model.phi - np.eye(7))) < 1e-12
    assert (
        np.max(
            abs(
                model.phi.T @ model.C @ model.phi
                - np.diag(np.diag(model.phi.T @ model.C @ model.phi))
            )
        )
        > 0.01
    )
    f = 21.0
    q = model.transfer([f])[0][:, 0]
    assert (
        model.K - (2 * np.pi * f) ** 2 * model.M + 1j * 2 * np.pi * f * model.C
    ) @ q == pytest.approx(-model.g, abs=1e-10)


def test_invalid_remaining_mass_and_singular_layout_fail():
    p = symmetric()
    p.structure.kind = "flexible"
    p.structure.mass_percent = 99.0
    p.structure.automatic_connection = False
    p.structure.connection_mm = [5000.0, 0.0, 0.0]
    with pytest.raises(ValueError, match="Kalan gövde"):
        LinearModel(p)
    p = symmetric()
    for m in p.mounts:
        m.position_mm = [0.0, 0.0, 0.0]
    with pytest.raises(ValueError):
        LinearModel(p)


def test_psd_log_interpolation_zero_outside_and_convergence():
    f = np.array([1.0, 10.0, 100.0, 1000.0])
    assert interpolate_psd(
        f, np.array([10.0, 100.0]), np.array([0.01, 1.0])
    ) == pytest.approx([0.0, 0.01, 1.0, 0.0])
    p = symmetric()
    p.system.damping = 0.005
    p.numerics.psd_resolution = 300
    a = LinearModel(p).psd()
    p.numerics.psd_resolution = 900
    b = LinearModel(p).psd()
    assert a.response.connection_g == pytest.approx(
        b.response.connection_g, rel=3e-3, abs=1e-12
    )
    assert a.response.local_mm == pytest.approx(
        np.array(b.response.local_mm), rel=3e-3, abs=1e-12
    )


@pytest.mark.parametrize("shape", ["half", "saw", "triangle"])
@pytest.mark.parametrize("percent", [5, 10, 15, 20])
def test_compensation_zero_final_velocity_and_displacement(shape, percent):
    p = Profile(20 * G, 0.011, shape, percent)
    velocity = quad(
        lambda t: float(p.pulse(t)), 0, p.end, points=p.breaks, epsabs=1e-11
    )[0]
    displacement = quad(
        lambda t: float(p.pulse(t)) * (p.end - t),
        0,
        p.end,
        points=p.breaks,
        epsabs=1e-11,
    )[0]
    assert velocity == pytest.approx(0.0, abs=1e-12)
    assert displacement == pytest.approx(0.0, abs=1e-12)
    assert p.net_velocity == pytest.approx(0.0, abs=1e-12)
    assert p.final_displacement == pytest.approx(0.0, abs=1e-12)


def test_socitec_direction_mapping_45_is_projected_not_k3():
    p = apply_product(symmetric(), "C6H-1010", ["I1", "I2", "I3", "I4"], True)
    model = LinearModel(p)
    direction = np.array([1.0, 0.0, 1.0]) / np.sqrt(2.0)
    law = catalog_law(p.mounts[0], model.supports[0], direction)
    assert law.nonlinear
    assert law.angle == pytest.approx(45.0)
    assert abs(law.stiffness(-1)[0, 2]) > 1
    assert law.e @ law.stiffness(-1) @ law.e == pytest.approx(law.kc)
    assert not catalog_law(
        p.mounts[0], model.supports[0], np.array([0.3, 0.0, 0.9539392])
    ).nonlinear
    q0 = shock_preload(
        model,
        [catalog_law(m, s, model.direction) for m, s in zip(p.mounts, model.supports)],
    )
    assert q0[2] < 0


def test_branch_selected_by_total_preload():
    p = apply_product(symmetric(), "C6H-1010", ["I1"], True)
    model = LinearModel(p)
    law = catalog_law(p.mounts[0], model.supports[0], model.direction)
    # A positive dynamic increment smaller than compression preload stays in compression.
    total = np.array([0.0, 0.0, -0.01 + 0.001])
    assert law.force(total)[2] == pytest.approx(law.kc * total[2])
    assert law.force(np.array([0.0, 0.0, 0.001]))[2] == pytest.approx(law.kt * 0.001)


def test_shock_tolerance_convergence_complete_tail_and_peaks():
    p = symmetric()
    p.shock.shape = "saw"
    p.shock.compensation_percent = 10
    a = solve_shock(LinearModel(p), 10)
    p.numerics.rtol = 1e-9
    p.numerics.atol = 1e-11
    b = solve_shock(LinearModel(p), 10)
    assert a.response.connection_g == pytest.approx(
        b.response.connection_g, rel=2e-5, abs=1e-10
    )
    assert a.response.local_mm == pytest.approx(
        np.array(b.response.local_mm), rel=2e-5, abs=1e-10
    )
    assert a.end_ms > 500
    assert a.samples[-1][0] == pytest.approx(a.end_ms)
    assert a.peak_evaluations > len(a.samples)
    assert max(abs(s[2]) for s in a.samples) <= max(a.response.connection_g) * (
        1 + 1e-8
    )
    assert a.tail_envelope < 1e-5


def test_cancel_and_unknown_controls_never_green():
    with pytest.raises(Cancelled):
        solve_shock(LinearModel(symmetric()), 0, lambda: True)
    assert combine_status(["within", "verify"]) == "verify"
    assert combine_status(["within", "failed"]) == "failed"
    assert combine_status(["within", "not_run"]) == "not_run"
    p = symmetric()
    p.shock.enabled = False
    result = analyze(p)
    assert result.overall != "within"
    assert result.snapshot is not p
    old = result.snapshot.system.mass_kg
    p.system.mass_kg = 400.0
    assert result.snapshot.system.mass_kg == old
