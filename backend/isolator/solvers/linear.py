from dataclasses import dataclass

import numpy as np
from scipy.linalg import cho_factor, cho_solve, eigh, solve

from isolator.domain.geometry import G, b_matrix, rotation, unit
from isolator.schemas.project import Project
from isolator.schemas.results import (
    HarmonicResult,
    Mode,
    PSDResult,
    Response,
    StaticMount,
    StaticResult,
)


def positive(matrix, name):
    if not np.all(np.isfinite(matrix)) or not np.allclose(
        matrix, matrix.T, atol=1e-9, rtol=1e-11
    ):
        raise ValueError(f"{name}: sonlu ve simetrik matris gerekli.")
    try:
        return cho_factor(matrix, lower=True, check_finite=True)
    except np.linalg.LinAlgError as exc:
        raise ValueError(
            f"{name}: pozitif tanımlı değil; yerleşim/kütle/ataleti kontrol edin."
        ) from exc


@dataclass
class Support:
    B: np.ndarray
    R: np.ndarray
    T: np.ndarray
    stiffness: np.ndarray


class LinearModel:
    """UI/HTTP independent float64 model; public boundaries are project units."""

    def __init__(self, p: Project):
        self.project = p
        s = p.system
        self.direction = unit(p.direction)
        self.cg = np.asarray(s.cg_mm, dtype=np.float64) / 1000
        self.M6 = np.diag([s.mass_kg] * 3 + s.inertia_kg_m2)
        self.K6 = np.zeros((6, 6), dtype=np.float64)
        self.supports = []
        for m in p.mounts:
            B = b_matrix(np.asarray(m.position_mm) / 1000 - self.cg)
            R = rotation(m.angles_deg)
            T = R.T @ B
            k = np.asarray(m.stiffness_n_mm, dtype=np.float64) * 1000
            self.K6 += T.T @ np.diag(k) @ T
            self.supports.append(Support(B, R, T, k))
        positive(self.M6, "Kütle matrisi")
        positive(self.K6, "Destek katılığı")
        lam6, phi6 = eigh(self.K6, self.M6, check_finite=True)
        if lam6[0] <= lam6[-1] * 1e-10:
            raise ValueError(
                "Yerleşim tekil veya kötü koşullu; destek konumları/katılıklarını kontrol edin."
            )
        self.C6 = (
            self.M6 @ phi6 @ np.diag(2 * s.damping * np.sqrt(lam6)) @ phi6.T @ self.M6
        )
        point = (
            np.mean([m.position_mm for m in p.mounts], axis=0)
            if p.structure.automatic_connection
            else np.asarray(p.structure.connection_mm)
        )
        self.connection_mm = point
        self.Bc = b_matrix(point / 1000 - self.cg)
        self.flexible = p.structure.kind == "flexible"
        self.n = 7 if self.flexible else 6
        self.M = np.zeros((self.n, self.n))
        self.K = self.M.copy()
        self.C = self.M.copy()
        self.M[:6, :6], self.K[:6, :6], self.C[:6, :6] = self.M6, self.K6, self.C6
        if self.flexible:
            me = s.mass_kg * p.structure.mass_percent / 100
            b = self.direction @ self.Bc
            positive(self.M6 - me * np.outer(b, b), "Kalan gövde kütlesi")
            self.M[:6, 6] = self.M[6, :6] = me * b
            self.M[6, 6] = me
            omega = 2 * np.pi * p.structure.frequency_hz
            self.K[6, 6] = me * omega**2
            self.C[6, 6] = 2 * p.structure.damping * me * omega
        self.mass_factor = positive(self.M, "Bağlı kütle matrisi")
        self.lambdas, self.phi = eigh(self.K, self.M, check_finite=True)
        self.frequencies = np.sqrt(self.lambdas) / (2 * np.pi)
        self.condition = float(self.lambdas[-1] / self.lambdas[0])
        if self.condition > 1e10:
            raise ValueError(
                "Bağlı sistem kötü koşullu; sayısal güvenilirlik sağlanamadı."
            )
        # Full C is retained for every solve; diagonal modal zeta is diagnostic only.
        self.modal_damping = np.diag(self.phi.T @ self.C @ self.phi) / (
            2 * np.sqrt(self.lambdas)
        )
        gamma = np.r_[self.direction, np.zeros(self.n - 3)]
        self.g = self.M @ gamma
        self.local_map = np.vstack([x.T for x in self.supports])

    def modes(self):
        return [
            Mode(
                frequency_hz=float(f),
                damping=float(z),
                participation_percent=float(
                    100 * (v @ self.g) ** 2 / self.project.system.mass_kg
                ),
                shape=v.tolist(),
            )
            for f, z, v in zip(self.frequencies, self.modal_damping, self.phi.T)
        ]

    def static(self):
        p = self.project
        force = np.r_[
            unit(p.system.static_direction)
            * p.system.mass_kg
            * G
            * (1 + p.system.extra_acceleration_g),
            np.zeros(3),
        ]
        q = solve(self.K6, force * p.system.dynamic_static_ratio, assume_a="pos")
        local = [s.T @ q for s in self.supports]
        return StaticResult(
            cg_displacement_mm=(q[:3] * 1000).tolist(),
            cg_rotation_mrad=(q[3:] * 1000).tolist(),
            mounts=[
                StaticMount(
                    mount_id=m.id,
                    local_displacement_mm=(u * 1000).tolist(),
                    reaction_n=(
                        -s.stiffness * u / p.system.dynamic_static_ratio
                    ).tolist(),
                )
                for m, s, u in zip(p.mounts, self.supports, local)
            ],
        )

    def transfer(self, frequencies):
        """Complex relative coordinates per unit base acceleration (m/s²)."""
        w = 2 * np.pi * np.atleast_1d(frequencies)
        D = (
            self.K[None, :, :]
            - w[:, None, None] ** 2 * self.M
            + 1j * w[:, None, None] * self.C
        )
        q = np.linalg.solve(D, np.broadcast_to(-self.g, (len(w), self.n))[..., None])[
            ..., 0
        ].T
        if not np.all(np.isfinite(q)):
            raise ValueError("Kompleks çözüm sonlu değil.")
        local = (self.local_map @ q[:6]).T.reshape(len(w), -1, 3)
        connection_relative = self.Bc @ q[:6]
        connection = self.direction[:, None] - w**2 * connection_relative
        cg = self.direction[:, None] - w**2 * q[:3]
        sensor = (
            connection - w**2 * self.direction[:, None] * q[6]
            if self.flexible
            else None
        )
        return q, cg.T, connection.T, None if sensor is None else sensor.T, local

    def frequency_grid(self, lo, hi, density=None, include=()):
        density = density or self.project.numerics.psd_resolution
        n = min(20000, max(80, int(np.ceil(np.log(hi / lo) * density))))
        grid = [np.geomspace(lo, hi, n), np.asarray(include)]
        for fn, z in zip(self.frequencies, self.modal_damping):
            offsets = np.r_[np.linspace(-10, 10, 181), np.linspace(-1, 1, 101)]
            grid.append(fn * (1 + offsets * max(0.0001, z)))
        data = np.unique(np.concatenate(grid))
        return data[(data >= lo) & (data <= hi)]

    def harmonic(self):
        h = self.project.harmonic
        _, cg, con, sensor, local = self.transfer([h.frequency_hz])
        response = Response(
            cg_g=(np.abs(cg[0]) * h.amplitude_g).tolist(),
            connection_g=(np.abs(con[0]) * h.amplitude_g).tolist(),
            sensor_g=(np.abs(sensor[0]) * h.amplitude_g).tolist()
            if sensor is not None
            else None,
            local_mm=(np.abs(local[0]) * h.amplitude_g * G * 1000).tolist(),
        )
        lo = min(h.frequency_hz, self.frequencies[0]) / 8
        hi = max(h.frequency_hz * 3, self.frequencies[-1] * 4)
        freqs = self.frequency_grid(lo, hi, density=80, include=[h.frequency_hz])
        _, _, c, sen, _ = self.transfer(freqs)
        spectrum = np.column_stack(
            (
                freqs,
                np.abs(c @ self.direction),
                *([np.abs(sen @ self.direction)] if sen is not None else []),
            )
        )
        return HarmonicResult(
            response=response,
            connection_transmissibility=float(abs(con[0] @ self.direction)),
            sensor_transmissibility=float(abs(sensor[0] @ self.direction))
            if sensor is not None
            else None,
            phase_deg=np.rad2deg(np.angle(con[0])).tolist(),
            spectrum=spectrum.tolist(),
        )

    def psd(self):
        p = self.project
        f = np.array([x.frequency_hz for x in p.random.points])
        s = np.array([x.density_g2_hz for x in p.random.points])
        freqs = self.frequency_grid(f[0], f[-1], include=f)
        density = interpolate_psd(freqs, f, s)
        _, cg, con, sensor, local = self.transfer(freqs)

        def rms(h, motion=False):
            square = abs(h) ** 2  # Complex contributions have already been summed.
            weight = density.reshape((len(density),) + (1,) * (h.ndim - 1))
            return np.sqrt(np.trapezoid(square * weight, freqs, axis=0)) * (
                G * 1000 if motion else 1
            )

        response = Response(
            cg_g=rms(cg).tolist(),
            connection_g=rms(con).tolist(),
            sensor_g=rms(sensor).tolist() if sensor is not None else None,
            local_mm=rms(local, True).tolist(),
        )
        spec = np.column_stack(
            (
                freqs,
                density,
                np.sum(abs(con) ** 2, axis=1) * density,
                *(
                    [np.sum(abs(sensor) ** 2, axis=1) * density]
                    if sensor is not None
                    else []
                ),
            )
        )
        return PSDResult(
            input_g_rms=float(np.sqrt(np.trapezoid(density, freqs))),
            response=response,
            sigma=p.random.sigma,
            spectrum=spec.tolist(),
            integration_points=len(freqs),
        )


def interpolate_psd(frequencies, points_f, points_s):
    f = np.asarray(frequencies)
    out = np.zeros_like(f, dtype=np.float64)
    mask = (f >= points_f[0]) & (f <= points_f[-1])
    out[mask] = np.exp(np.interp(np.log(f[mask]), np.log(points_f), np.log(points_s)))
    return out
