from dataclasses import dataclass
from itertools import pairwise

import numpy as np
from scipy.integrate import quad, solve_ivp
from scipy.linalg import cho_solve, solve
from scipy.optimize import minimize_scalar, root

from isolator.catalog.repository import product
from isolator.domain.geometry import G, unit
from isolator.schemas.results import Response, ShockMount, ShockResult, ShockRun


class Cancelled(Exception):
    pass


@dataclass
class Profile:
    amplitude: float
    duration: float
    shape: str
    percent: int

    def __post_init__(self):
        a, tau, c = self.amplitude, self.duration, 2 / np.pi
        self.area = a * tau * (c if self.shape == "half" else 0.5)
        centroid = tau * (2 / 3 if self.shape == "saw" else 0.5)
        self.pre = self.post = 0.0
        p = self.percent / 100
        if p and a:
            lo, hi = 0.0, 1.0
            for _ in range(80):
                r = (lo + hi) / 2
                value = (
                    r * r * self.area / (2 * c * a * p)
                    + centroid
                    - (1 - r) * tau
                    - (1 - r) ** 2 * self.area / (2 * c * a * p)
                )
                if value > 0:
                    hi = r
                else:
                    lo = r
            r = (lo + hi) / 2
            self.pre = r * self.area / (c * a * p)
            self.post = (1 - r) * self.area / (c * a * p)
        self.end = self.pre + tau + self.post
        self.main_end = self.pre + tau
        self.net_velocity = self.area - c * a * p * (self.pre + self.post)
        moment = (
            self.area * (self.pre + centroid)
            - c * a * p * self.pre * self.pre / 2
            - c * a * p * self.post * (self.main_end + self.post / 2)
        )
        self.final_displacement = self.end * self.net_velocity - moment
        self.breaks = sorted(
            {0.0, self.pre, self.pre + tau / 2, self.main_end, self.end}
        )

    def pulse(self, t):
        t = np.asarray(t)
        x = (t - self.pre) / self.duration
        main = (
            np.sin(np.pi * x)
            if self.shape == "half"
            else x
            if self.shape == "saw"
            else 1 - np.abs(2 * x - 1)
        )
        result = np.where((x >= 0) & (x < 1), self.amplitude * main, 0.0)
        if self.pre:
            result = np.where(
                (t >= 0) & (t < self.pre),
                -self.amplitude * self.percent / 100 * np.sin(np.pi * t / self.pre),
                result,
            )
        if self.post:
            result = np.where(
                (t >= self.main_end) & (t < self.end),
                -self.amplitude
                * self.percent
                / 100
                * np.sin(np.pi * (t - self.main_end) / self.post),
                result,
            )
        return result


@dataclass
class Law:
    base: np.ndarray
    e: np.ndarray
    angle: float
    reason: str
    kc: float | None = None
    kt: float | None = None
    keys: tuple[str, str] | None = None

    @property
    def nonlinear(self):
        return self.kc is not None

    def stiffness(self, projection):
        if not self.nonlinear:
            return np.diag(self.base)
        P = np.eye(3) - np.outer(self.e, self.e)
        return P @ np.diag(self.base) @ P + (
            self.kc if projection < 0 else self.kt
        ) * np.outer(self.e, self.e)

    def force(self, u):
        if not self.nonlinear:
            return self.base[:, None] * u if u.ndim == 2 else self.base * u
        projection = self.e @ u
        k = np.where(projection < 0, self.kc, self.kt)
        P = np.eye(3) - np.outer(self.e, self.e)
        return P @ np.diag(self.base) @ P @ u + (
            self.e[:, None] * (k * projection)
            if u.ndim == 2
            else self.e * k * projection
        )


def catalog_law(mount, support, direction):
    e = unit(support.R.T @ direction)
    if e[2] < 0:
        e = -e
    angle = float(np.rad2deg(np.arccos(np.clip(e[2], 0, 1))))
    law = Law(support.stiffness, e, angle, "Katalog ürünü atanmadı.")
    p = product(mount.product_id)
    if mount.source == "user":
        law.reason = "Kullanıcı katılığı: yönlü katalog şok modeli uygulanmadı."
        return law
    if not p or p.family != "soc" or p.issue:
        law.reason = (
            p.issue
            if p and p.issue
            else "Ayrı yönlü şok F/d verisi yok; doğrusal model."
        )
        return law
    keys = (
        ("comp", "tens")
        if abs(angle) <= 0.5
        else ("comp45", "tens45")
        if abs(angle - 45) <= 0.5
        else ("shear", "shear")
        if abs(angle - 90) <= 0.5
        else None
    )
    if keys is None:
        law.reason = "Ara açı: 0°/45°/90° ±0,5° eşlemesi yok; doğrusal geri dönüş."
        return law
    values = [p.directions.get(k) for k in keys]
    if any(
        v is None or not v.shockF or not v.shockD or v.shockF <= 0 or v.shockD <= 0
        for v in values
    ):
        law.reason = "İlgili yönün şok F/d verisi eksik; doğrusal geri dönüş."
        return law
    law.kc, law.kt = [v.shockF / v.shockD * 1000 for v in values]
    law.keys = keys
    law.reason = "Katalog F/d sekant tahmini; toplam yerel izdüşümle basma/çekme. Tam histerezis modeli değildir."
    return law


def shock_preload(model, laws):
    p = model.project
    force = (
        np.r_[
            unit(p.system.static_direction)
            * p.system.mass_kg
            * G
            * (1 + p.system.extra_acceleration_g),
            np.zeros(3),
        ]
        * p.system.dynamic_static_ratio
    )
    initial = solve(model.K6, force, assume_a="pos")
    if not any(l.nonlinear for l in laws):
        return initial

    def residual(q):
        return (
            sum(
                (s.T.T @ law.force(s.T @ q) for s, law in zip(model.supports, laws)),
                start=np.zeros(6),
            )
            - force
        )

    def jac(q):
        return sum(
            (
                s.T.T @ law.stiffness(law.e @ s.T @ q) @ s.T
                for s, law in zip(model.supports, laws)
            ),
            start=np.zeros((6, 6)),
        )

    equilibrium = root(residual, initial, jac=jac, tol=1e-11)
    if not np.all(np.isfinite(equilibrium.x)) or np.linalg.norm(
        residual(equilibrium.x)
    ) > 1e-7 * max(1.0, np.linalg.norm(force)):
        raise ValueError("Yönlü katalog statik ön yük dengesi yakınsamadı.")
    return equilibrium.x


def solve_shock(model, percent, cancelled=lambda: False):
    p, n = model.project, model.n
    profile = Profile(
        p.shock.amplitude_g * G, p.shock.duration_ms / 1000, p.shock.shape, percent
    )
    laws = [
        catalog_law(m, s, model.direction) for m, s in zip(p.mounts, model.supports)
    ]
    q0 = shock_preload(model, laws)
    u0 = [s.T @ q0 for s in model.supports]
    f0 = [law.force(u) for law, u in zip(laws, u0)]
    nonlinear = any(l.nonlinear for l in laws)
    ratios = [1.0]
    for law in laws:
        if law.nonlinear:
            for branch in [-1.0, 1.0]:
                k = law.stiffness(branch)
                D = np.diag(1 / np.sqrt(law.base))
                ratios.extend(np.linalg.eigvalsh(D @ k @ D).tolist())
    fmin = min(model.frequencies) * np.sqrt(min(ratios))
    fmax = max(model.frequencies) * np.sqrt(max(ratios))
    decay = min(model.modal_damping) * 2 * np.pi * fmin
    tail = max(10 / fmin, 12 / decay)
    end = profile.end + tail
    max_step = 1 / (16 * fmax)
    if end / max_step > 180000:
        raise ValueError(
            "Şok çözümü sayısal iş sınırını aşıyor; düşük mod/sönüm ve yüksek katılık oranını kontrol edin."
        )
    if end > 600:
        raise ValueError(
            "Yeterli sönüm kuyruğu 600 saniyeyi aşıyor; model parametrelerini kontrol edin."
        )

    def evaluate(t, state, readout=False):
        if cancelled():
            raise Cancelled()
        q, velocity = state[:n], state[n:]
        ab = profile.pulse(t)
        restoring = model.K @ q
        if nonlinear:
            restoring[:6] = sum(
                (
                    s.T.T @ (law.force(u[:, None] + s.T @ q[:6]) - base[:, None])
                    if q.ndim == 2
                    else s.T.T @ (law.force(u + s.T @ q[:6]) - base)
                    for s, law, u, base in zip(model.supports, laws, u0, f0)
                ),
                start=np.zeros_like(q[:6]),
            )
        rhs = (
            -restoring
            - model.C @ velocity
            - (model.g[:, None] * ab if q.ndim == 2 else model.g * ab)
        )
        acc = cho_solve(model.mass_factor, rhs, check_finite=False)
        if not readout:
            return np.concatenate((velocity, acc))
        local = model.local_map @ q[:6] * 1000
        con_rel = model.Bc @ q[:6]
        con_acc = model.Bc @ acc[:6] + model.direction[:, None] * ab
        cg_acc = acc[:3] + model.direction[:, None] * ab
        sen_acc = (
            con_acc + model.direction[:, None] * acc[6] if model.flexible else con_acc
        )
        sen_rel = (
            con_rel + model.direction[:, None] * q[6] if model.flexible else con_rel
        )
        total = local + np.concatenate(u0)[:, None] * 1000
        projections = np.vstack(
            [law.e @ total[i * 3 : i * 3 + 3] for i, law in enumerate(laws)]
        )
        values = np.vstack(
            (
                cg_acc / G,
                con_acc / G,
                sen_acc / G,
                local,
                con_rel * 1000,
                sen_rel * 1000,
                total,
                projections,
            )
        )
        return values

    extrema_min = extrema_max = None
    segments = []
    state = np.zeros(2 * n)
    steps = evaluations = 0
    breaks = profile.breaks + [end]
    for left, right in pairwise(breaks):
        if right - left < 1e-14:
            continue

        # Left limit at discontinuous sawtooth terminal avoids blending pulse segments.
        def rhs(t, y, left=left, right=right):
            return evaluate(np.nextafter(right, left) if t >= right else t, y)

        segment_step = (
            min(max_step, (right - left) / 24) if left < profile.end else max_step
        )
        sol = solve_ivp(
            rhs,
            (left, right),
            state,
            method="DOP853",
            rtol=p.numerics.rtol,
            atol=p.numerics.atol,
            max_step=segment_step,
            dense_output=True,
        )
        if not sol.success:
            raise ValueError(f"Şok integrasyonu başarısız: {sol.message}")
        if not np.all(np.isfinite(sol.y)):
            raise ValueError("Şok integrasyonu sonlu olmayan sonuç verdi.")
        steps += len(sol.t) - 1
        state = sol.y[:, -1]
        # Five dense evaluations in EVERY accepted interval, across the complete tail.
        dense_t = np.unique(
            np.r_[
                (
                    sol.t[:-1, None] + np.diff(sol.t)[:, None] * np.linspace(0, 1, 6)
                ).ravel(),
                right,
            ]
        )
        values = evaluate(dense_t, sol.sol(dense_t), True)
        evaluations += len(dense_t)
        low, high = values.min(axis=1), values.max(axis=1)
        # Refine each candidate extremum with dense output, never chart samples.
        for channel in range(len(values)):
            for sign, array in [(1.0, low), (-1.0, high)]:
                index = int(np.argmin(sign * values[channel]))
                lo, hi = (
                    dense_t[max(0, index - 1)],
                    dense_t[min(len(dense_t) - 1, index + 1)],
                )
                if hi > lo:

                    def objective(t, sign=sign, sol=sol, channel=channel):
                        return (
                            sign
                            * evaluate(np.array([t]), sol.sol(np.array([t])), True)[
                                channel, 0
                            ]
                        )

                    opt = minimize_scalar(
                        objective,
                        bounds=(lo, hi),
                        method="bounded",
                        options={"xatol": 1e-11},
                    )
                    if not opt.success:
                        raise ValueError("Şok tepe araması yakınsamadı.")
                    array[channel] = (
                        min(array[channel], opt.fun)
                        if sign == 1
                        else max(array[channel], -opt.fun)
                    )
                    evaluations += opt.nfev
        extrema_min = low if extrema_min is None else np.minimum(extrema_min, low)
        extrema_max = high if extrema_max is None else np.maximum(extrema_max, high)
        segments.append((left, right, sol.sol))
    peaks = np.maximum(abs(extrema_min), abs(extrema_max))
    count = len(p.mounts)
    local_start, rel_start = 9, 9 + 3 * count
    total_start = rel_start + 6
    proj_start = total_start + 3 * count
    response = Response(
        cg_g=peaks[:3].tolist(),
        connection_g=peaks[3:6].tolist(),
        sensor_g=peaks[6:9].tolist() if model.flexible else None,
        local_mm=peaks[local_start:rel_start].reshape(count, 3).tolist(),
    )
    mount_results = [
        ShockMount(
            mount_id=m.id,
            nonlinear=law.nonlinear,
            angle_deg=law.angle,
            reason=law.reason,
            compression_n_mm=law.kc / 1000 if law.nonlinear else None,
            tension_n_mm=law.kt / 1000 if law.nonlinear else None,
            preload_mm=(u * 1000).tolist(),
            total_min_mm=extrema_min[
                total_start + 3 * i : total_start + 3 * i + 3
            ].tolist(),
            total_max_mm=extrema_max[
                total_start + 3 * i : total_start + 3 * i + 3
            ].tolist(),
            projection_min_mm=float(extrema_min[proj_start + i]),
            projection_max_mm=float(extrema_max[proj_start + i]),
        )
        for i, (m, law, u) in enumerate(zip(p.mounts, laws, u0))
    ]
    # Display data spans the full record, with extra resolution near the complete pulse.
    times = np.unique(
        np.r_[
            np.linspace(0, end, 2500),
            np.linspace(0, min(end, profile.end + 5 / fmin), 2000),
            profile.breaks,
        ]
    )
    samples = []
    for i, (left, right, solution) in enumerate(segments):
        t = times[
            (times >= left)
            & ((times < right) if i < len(segments) - 1 else (times <= right))
        ]
        if not len(t):
            continue
        v = evaluate(t, solution(t), True)
        samples.extend(
            np.column_stack(
                (
                    (t - profile.pre) * 1000,
                    profile.pulse(t) / G,
                    model.direction @ v[3:6],
                    model.direction @ v[6:9],
                    model.direction @ v[rel_start : rel_start + 3],
                    model.direction @ v[rel_start + 3 : rel_start + 6],
                )
            ).tolist()
        )
    return ShockRun(
        response=response,
        connection_relative_mm=peaks[rel_start : rel_start + 3].tolist(),
        sensor_relative_mm=peaks[rel_start + 3 : rel_start + 6].tolist()
        if model.flexible
        else None,
        mounts=mount_results,
        samples=samples,
        end_ms=(end - profile.pre) * 1000,
        main_start_ms=profile.pre * 1000,
        net_velocity_m_s=float(profile.net_velocity),
        final_displacement_m=float(profile.final_displacement),
        accepted_steps=steps,
        peak_evaluations=evaluations,
        tail_envelope=float(np.exp(-decay * tail)),
    )


def shock(model, cancelled, stage):
    p = model.project
    result = solve_shock(model, p.shock.compensation_percent, cancelled)
    reference = None
    if p.shock.compensation_percent:
        stage("Şok · bağımsız saf darbe çözümü")
        reference = solve_shock(model, 0, cancelled)
    profile = Profile(
        p.shock.amplitude_g * G,
        p.shock.duration_ms / 1000,
        p.shock.shape,
        p.shock.compensation_percent,
    )
    lo, hi = profile.pre - 0.4 * profile.duration, profile.pre + 1.1 * profile.duration
    points = [x for x in profile.breaks if lo < x < hi]
    velocity = quad(
        lambda t: float(profile.pulse(t)), lo, hi, points=points, epsabs=1e-10
    )[0]
    return ShockResult(
        compensated=result,
        pure=reference,
        velocity_window_m_s=velocity,
        nominal_velocity_m_s=profile.area,
        velocity_ratio=velocity / profile.area if profile.area else None,
        scope="Referanstaki MIL-STD-810H Method 516.8 hız penceresi ±%20 ön kontrolü. SRS, f_low ve tam tolerans zarfı hesaplanmadı; standart uygunluğu belgesi değildir. Üçgen mühendislik seçeneğidir.",
    )
