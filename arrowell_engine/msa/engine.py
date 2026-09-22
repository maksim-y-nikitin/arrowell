"""High-performance Multi-Station Analysis (MSA) calibration engine.

Features:
  - Top-level picklable objective class for robust execution
  - Toolface distribution conditioning (prevents overfitting during motor sliding)
  - Full 18-parameter model (15 sensor calibration + 3 reference field residual corrections)
  - SciPy Differential Evolution with L-BFGS-B polishing
"""

from dataclasses import dataclass
from typing import Tuple

import numpy as np
from scipy.optimize import differential_evolution

from ..sensors.models import apply_sensor_correction, SensorCalibrationParams
from ..sensors.transforms import compute_survey_metrics


@dataclass(slots=True, frozen=True)
class ReferenceFieldCorrections:
    delta_g: float     # Gravity reference offset (g)
    delta_b: float     # Magnetic total field reference offset (nT)
    delta_dip: float   # Magnetic dip angle reference offset (deg)


@dataclass(slots=True, frozen=True)
class MsaResult:
    success: bool
    params: SensorCalibrationParams
    ref_corrections: ReferenceFieldCorrections
    cost: float
    iterations: int
    corrected_surveys: np.ndarray
    toolface_coverage_deg: float
    is_cross_mag_solvable: bool


def analyze_toolface_coverage(raw_dni: np.ndarray) -> Tuple[float, bool]:
    """Evaluate toolface distribution to prevent ill-conditioned cross-sensor calibration."""
    gx = raw_dni[:, 0]
    gy = raw_dni[:, 1]
    gtf_rad = np.arctan2(-gx, -gy)
    gtf_deg = np.degrees(gtf_rad) % 360.0

    if len(gtf_deg) < 2:
        return 0.0, False

    sorted_gtf = np.sort(gtf_deg)
    gaps = np.empty_like(sorted_gtf)
    gaps[:-1] = sorted_gtf[1:] - sorted_gtf[:-1]
    gaps[-1] = (sorted_gtf[0] + 360.0) - sorted_gtf[-1]

    max_gap = float(np.max(gaps))
    coverage = 360.0 - max_gap
    is_solvable = max_gap <= 100.0
    return coverage, is_solvable


class _MsaObjective:
    """Top-level picklable objective function for SciPy Differential Evolution."""

    def __init__(
        self,
        raw_dni: np.ndarray,
        g_ref: float,
        b_ref: float,
        dip_ref_deg: float,
        sigma_g: float,
        sigma_b: float,
        sigma_dip: float,
    ):
        self.raw_dni = raw_dni
        self.g_ref = g_ref
        self.b_ref = b_ref
        self.dip_ref_deg = dip_ref_deg
        self.sigma_g = sigma_g
        self.sigma_b = sigma_b
        self.sigma_dip = sigma_dip

    def __call__(self, p: np.ndarray) -> float:
        sensor_params = p[:15]
        delta_g_val = p[15]
        delta_b_val = p[16]
        delta_dip_val = p[17]

        cor = apply_sensor_correction(self.raw_dni, sensor_params)
        metrics = compute_survey_metrics(
            cor[:, 0], cor[:, 1], cor[:, 2],
            cor[:, 3], cor[:, 4], cor[:, 5],
        )

        effective_g_ref = self.g_ref - delta_g_val
        effective_b_ref = self.b_ref - delta_b_val
        effective_dip_ref = self.dip_ref_deg - delta_dip_val

        res_g = (metrics.g_total - effective_g_ref) / self.sigma_g
        res_b = (metrics.b_total - effective_b_ref) / self.sigma_b
        res_dip = (metrics.dip_deg - effective_dip_ref) / self.sigma_dip

        mle_loss = float(np.sum(res_g**2 + res_b**2 + res_dip**2))

        prior_penalty = float(
            (p[8] / 2000.0)**2 +
            np.sum((p[0:3] / 0.01)**2) +
            np.sum((p[3:6] / 0.003)**2) +
            (delta_g_val / 0.005)**2 +
            (delta_b_val / 100.0)**2 +
            (delta_dip_val / 0.20)**2
        )
        return mle_loss + prior_penalty


def run_msa_optimization(
    raw_dni: np.ndarray,
    g_ref: float = 1.0,
    b_ref: float = 52000.0,
    dip_ref_deg: float = 72.0,
    enable_misalignment: bool = True,
    enable_ref_corrections: bool = True,
    max_iter: int = 150,
    popsize: int = 15,
) -> MsaResult:
    """Solve for optimal sensor and reference corrections."""
    n_surveys = raw_dni.shape[0]
    if n_surveys < 4:
        raise ValueError("At least 4 survey stations are required for MSA convergence.")

    coverage_deg, cross_mag_solvable = analyze_toolface_coverage(raw_dni)

    sigma_g = 0.003
    sigma_b = 80.0
    sigma_dip = 0.15

    mbx_bound = (-400.0, 400.0) if cross_mag_solvable else (-35.0, 35.0)
    mby_bound = (-400.0, 400.0) if cross_mag_solvable else (-35.0, 35.0)

    bounds = [
        (-0.02, 0.02), (-0.02, 0.02), (-0.02, 0.02),
        (-0.005, 0.005), (-0.005, 0.005), (-0.005, 0.005),
        mbx_bound, mby_bound,
        (-5000.0, 5000.0),
        (-0.01, 0.01), (-0.01, 0.01), (-0.01, 0.01),
    ]

    if enable_misalignment:
        bounds.extend([(-0.015, 0.015), (-0.015, 0.015), (-0.015, 0.015)])
    else:
        bounds.extend([(0.0, 0.0), (0.0, 0.0), (0.0, 0.0)])

    if enable_ref_corrections:
        bounds.extend([
            (-0.01, 0.01),
            (-250.0, 250.0),
            (-0.40, 0.40),
        ])
    else:
        bounds.extend([(0.0, 0.0), (0.0, 0.0), (0.0, 0.0)])

    objective = _MsaObjective(
        raw_dni=raw_dni,
        g_ref=g_ref,
        b_ref=b_ref,
        dip_ref_deg=dip_ref_deg,
        sigma_g=sigma_g,
        sigma_b=sigma_b,
        sigma_dip=sigma_dip,
    )

    opt_res = differential_evolution(
        func=objective,
        bounds=bounds,
        strategy="best1bin",
        maxiter=max_iter,
        popsize=popsize,
        tol=1e-5,
        mutation=(0.4, 0.9),
        recombination=0.8,
        workers=1,
        updating="immediate",
        polish=True,
    )

    best_sensor_params = SensorCalibrationParams.from_array(opt_res.x[:15])
    best_ref_corrections = ReferenceFieldCorrections(
        delta_g=round(float(opt_res.x[15].item()), 4),
        delta_b=round(float(opt_res.x[16].item()), 1),
        delta_dip=round(float(opt_res.x[17].item()), 2),
    )
    corrected_surveys = apply_sensor_correction(raw_dni, opt_res.x[:15])

    return MsaResult(
        success=bool(opt_res.success),
        params=best_sensor_params,
        ref_corrections=best_ref_corrections,
        cost=float(opt_res.fun),
        iterations=int(opt_res.nit),
        corrected_surveys=corrected_surveys,
        toolface_coverage_deg=round(coverage_deg, 1),
        is_cross_mag_solvable=cross_mag_solvable,
    )