"""Parser and runtime manager for World Magnetic Model Gauss coefficients.

Includes self-healing binary validation to automatically rebuild corrupted
or 0-byte .npz archives from bundled system coefficients.
"""

import importlib.util
from dataclasses import dataclass
from pathlib import Path
from typing import Union

import numpy as np


@dataclass(slots=True, frozen=True)
class WmmModelCoefficients:
    epoch: float
    model_name: str
    n_max: int
    g: np.ndarray       # Main field g_n^m (nT)
    h: np.ndarray       # Main field h_n^m (nT)
    g_dot: np.ndarray   # Secular variation g_dot_n^m (nT / year)
    h_dot: np.ndarray   # Secular variation h_dot_n^m (nT / year)


def _rebuild_from_pygeomag(target_npz_path: Path) -> bool:
    """Auto-reconstruct .npz archive from local pygeomag package if available."""
    spec = importlib.util.find_spec("pygeomag")
    if not spec or not spec.origin:
        return False

    pkg_root = Path(spec.origin).resolve().parent
    candidates = list(pkg_root.glob("**/WMM*2025*.COF")) + list(pkg_root.glob("**/WMM.COF"))
    if not candidates:
        return False

    cof_path = candidates[0]
    records = []
    epoch = 2025.0
    model_name = "WMM2025"

    with open(cof_path, "r", encoding="utf-8") as f:
        header = f.readline().strip().split()
        if header:
            epoch = float(header[0])
            if len(header) > 1:
                model_name = header[1]

        for line in f:
            parts = line.strip().split()
            if not parts or parts[0].startswith("9999"):
                break
            if len(parts) >= 6:
                n, m = int(parts[0]), int(parts[1])
                g, h = float(parts[2]), float(parts[3])
                g_dot, h_dot = float(parts[4]), float(parts[5])
                records.append([n, m, g, h, g_dot, h_dot])

    coeff_array = np.array(records, dtype=np.float64)
    n_max = int(np.max(coeff_array[:, 0]))

    g_mat = np.zeros((n_max + 1, n_max + 1), dtype=np.float64)
    h_mat = np.zeros((n_max + 1, n_max + 1), dtype=np.float64)
    g_dot_mat = np.zeros((n_max + 1, n_max + 1), dtype=np.float64)
    h_dot_mat = np.zeros((n_max + 1, n_max + 1), dtype=np.float64)

    for row in coeff_array:
        n_idx, m_idx = int(row[0]), int(row[1])
        g_mat[n_idx, m_idx] = row[2]
        h_mat[n_idx, m_idx] = row[3]
        g_dot_mat[n_idx, m_idx] = row[4]
        h_dot_mat[n_idx, m_idx] = row[5]

    target_npz_path.parent.mkdir(parents=True, exist_ok=True)
    np.savez_compressed(
        target_npz_path,
        epoch=epoch,
        model_name=model_name,
        n_max=n_max,
        coefficients=coeff_array,
        g=g_mat,
        h=h_mat,
        g_dot=g_dot_mat,
        h_dot=h_dot_mat,
    )
    return True


class WmmCoefficientLoader:
    """Loads and computes time-adjusted spherical harmonic coefficients."""

    @staticmethod
    def load_from_npz(binary_path: Union[str, Path]) -> WmmModelCoefficients:
        """Load pre-compiled binary model, auto-healing 0-byte or corrupted files."""
        path = Path(binary_path)

        # Self-healing: if file is 0 bytes or missing, rebuild immediately
        if not path.exists() or path.stat().st_size < 100:
            rebuilt = _rebuild_from_pygeomag(path)
            if not rebuilt and (not path.exists() or path.stat().st_size == 0):
                raise FileNotFoundError(f"Corrupted or empty model binary at {path}")

        try:
            data = np.load(path)
        except Exception:
            _rebuild_from_pygeomag(path)
            data = np.load(path)

        epoch = float(data["epoch"])
        model_name = str(data["model_name"])
        n_max = int(data["n_max"])

        if "g" in data:
            g = data["g"]
            h = data["h"]
            g_dot = data["g_dot"]
            h_dot = data["h_dot"]
        else:
            coeffs = data["coefficients"]
            g = np.zeros((n_max + 1, n_max + 1), dtype=np.float64)
            h = np.zeros((n_max + 1, n_max + 1), dtype=np.float64)
            g_dot = np.zeros((n_max + 1, n_max + 1), dtype=np.float64)
            h_dot = np.zeros((n_max + 1, n_max + 1), dtype=np.float64)

            for row in coeffs:
                n, m = int(row[0]), int(row[1])
                g[n, m] = row[2]
                h[n, m] = row[3]
                g_dot[n, m] = row[4]
                h_dot[n, m] = row[5]

        return WmmModelCoefficients(
            epoch=epoch,
            model_name=model_name,
            n_max=n_max,
            g=g,
            h=h,
            g_dot=g_dot,
            h_dot=h_dot,
        )

    @staticmethod
    def evaluate_coefficients_at_date(
        model: WmmModelCoefficients,
        decimal_year: float,
    ) -> tuple[np.ndarray, np.ndarray]:
        """Interpolate Gauss coefficients to target survey date."""
        dt = decimal_year - model.epoch
        g_t = model.g + dt * model.g_dot
        h_t = model.h + dt * model.h_dot
        return g_t, h_t