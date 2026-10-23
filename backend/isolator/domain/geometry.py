import numpy as np

G = 9.80665


def unit(vector):
    v = np.asarray(vector, dtype=np.float64)
    norm = np.linalg.norm(v)
    if not np.isfinite(norm) or norm < 1e-10:
        raise ValueError("Yön sonlu ve sıfırdan farklı olmalı.")
    return v / norm


def rotation(angles_deg):
    roll, pitch, yaw = np.deg2rad(angles_deg)
    a, b, c = np.cos([roll, pitch, yaw])
    x, y, z = np.sin([roll, pitch, yaw])
    rx = np.array([[1.0, 0, 0], [0, a, -x], [0, x, a]])
    ry = np.array([[b, 0, y], [0, 1.0, 0], [-y, 0, b]])
    rz = np.array([[c, -z, 0], [z, c, 0], [0, 0, 1.0]])
    return rz @ ry @ rx


def b_matrix(r):
    x, y, z = r
    skew = np.array([[0.0, -z, y], [z, 0.0, -x], [-y, x, 0.0]])
    return np.column_stack((np.eye(3), -skew))
