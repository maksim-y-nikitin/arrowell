"""High-performance Multi-Station Analysis (MSA) calibration engine."""

from dataclasses import dataclass
from typing import Tuple

import numpy as np
from scipy.optimize import differential_evolution, least_squares

from ..sensors.models import apply_sensor_correction, SensorCalibrationParams


@dataclass(slots=True, frozen=True)
class ReferenceFieldCorrections:
    delta_g: float
    delta_b: float
    delta_dip: float


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
    """
    Evaluate toolface distribution to prevent ill-conditioned cross-sensor calibration.

    Args:
        raw_dni: Raw sensor measurement matrix of shape (N, 6).

    Returns:
        Tuple containing total toolface coverage in degrees and a solvability boolean flag.
    """
    gx = raw_dni[:, 0]
    gy = raw_dni[:, 1]
    gtf_deg = np.degrees(np.arctan2(-gx, -gy)) % 360.0

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


def _compute_msa_residuals(
    p: np.ndarray,
    raw_dni: np.ndarray,
    g_ref: float,
    b_ref: float,
    dip_ref_deg: float,
    sigma_g: float,
    sigma_b: float,
    sigma_dip: float,
) -> np.ndarray:
    """
    Compute residual errors and Bayesian regularization penalties for non-linear least squares.

    Args:
        p: 18-element parameter vector containing 15 sensor terms and 3 reference field deltas.
        raw_dni: Raw sensor measurement array of shape (N, 6).
        g_ref: Reference total gravity magnitude.
        b_ref: Reference total magnetic field magnitude in nanoTesla.
        dip_ref_deg: Reference magnetic dip angle in degrees.
        sigma_g: Expected standard deviation of gravity measurements.
        sigma_b: Expected standard deviation of magnetic measurements.
        sigma_dip: Expected standard deviation of dip angle measurements.

    Returns:
        1D array of normalized measurement residuals and prior penalties.
    """
    sensor_params = p[:15]
    delta_g_val = p[15]
    delta_b_val = p[16]
    delta_dip_val = p[17]

    cor = apply_sensor_correction(raw_dni, sensor_params)
    gx, gy, gz = cor[:, 0], cor[:, 1], cor[:, 2]
    bx, by, bz = cor[:, 3], cor[:, 4], cor[:, 5]

    g_tot = np.sqrt(gx**2 + gy**2 + gz**2)
    b_tot = np.sqrt(bx**2 + by**2 + bz**2)

    safe_gb = np.where((g_tot * b_tot) == 0.0, 1.0, g_tot * b_tot)
    dot_gb = (gx * bx + gy * by + gz * bz) / safe_gb
    dip_deg = np.degrees(np.arcsin(np.clip(dot_gb, -1.0, 1.0)))

    eff_g = g_ref - delta_g_val
    eff_b = b_ref - delta_b_val
    eff_dip = dip_ref_deg - delta_dip_val

    res_g = (g_tot - eff_g) / sigma_g
    res_b = (b_tot - eff_b) / sigma_b
    res_dip = (dip_deg - eff_dip) / sigma_dip

    priors = np.array([
        p[0] / 0.005,
        p[1] / 0.005,
        p[2] / 0.005,
        p[3] / 0.001,
        p[4] / 0.001,
        p[5] / 0.001,
        p[6] / 50.0,
        p[7] / 50.0,
        p[8] / 1500.0,
        p[9] / 0.002,
        p[10] / 0.002,
        p[11] / 0.002,
        p[12] / 0.002,
        p[13] / 0.002,
        p[14] / 0.002,
        delta_g_val / 0.002,
        delta_b_val / 50.0,
        delta_dip_val / 0.10,
    ], dtype=np.float64)

    return np.concatenate([res_g, res_b, res_dip, priors])


def _compute_msa_scalar_loss(
    p: np.ndarray,
    raw_dni: np.ndarray,
    g_ref: float,
    b_ref: float,
    dip_ref_deg: float,
    sigma_g: float,
    sigma_b: float,
    sigma_dip: float,
) -> float:
    """
    Compute scalar loss objective for global optimization algorithms.

    Args:
        p: 18-element parameter vector.
        raw_dni: Raw sensor measurement array of shape (N, 6).
        g_ref: Reference total gravity magnitude.
        b_ref: Reference magnetic field magnitude in nanoTesla.
        dip_ref_deg: Reference magnetic dip angle in degrees.
        sigma_g: Standard deviation of gravity measurements.
        sigma_b: Standard deviation of magnetic measurements.
        sigma_dip: Standard deviation of dip angle measurements.

    Returns:
        Scalar sum of squared residuals.
    """
    res = _compute_msa_residuals(
        p=p,
        raw_dni=raw_dni,
        g_ref=g_ref,
        b_ref=b_ref,
        dip_ref_deg=dip_ref_deg,
        sigma_g=sigma_g,
        sigma_b=sigma_b,
        sigma_dip=sigma_dip,
    )
    return float(np.sum(res**2))


def run_msa_optimization(
    raw_dni: np.ndarray,
    g_ref: float = 1.0,
    b_ref: float = 52000.0,
    dip_ref_deg: float = 72.0,
    enable_misalignment: bool = True,
    enable_ref_corrections: bool = True,
    method: str = "trf",
    max_iter: int = 50,
    popsize: int = 15,
) -> MsaResult:
    """
    Solve for sensor calibration and reference field offsets using selectable optimization algorithm.

    Args:
        raw_dni: Raw sensor measurement matrix of shape (N, 6).
        g_ref: Reference total gravity magnitude.
        b_ref: Reference magnetic field magnitude in nanoTesla.
        dip_ref_deg: Reference magnetic dip angle in degrees.
        enable_misalignment: Whether to estimate sensor cross-axis misalignment angles.
        enable_ref_corrections: Whether to estimate local reference field residuals.
        method: Optimization algorithm name ('trf' for Trust Region Reflective, 'de' for Differential Evolution).
        max_iter: Maximum iterations or generation limit.
        popsize: Population multiplier used when method is 'de'.

    Returns:
        MsaResult structure with calibrated parameters, corrected surveys, and metrics.
    """
    n_surveys = raw_dni.shape[0]
    if n_surveys < 4:
        raise ValueError("At least 4 survey stations are required for MSA convergence.")

    coverage_deg, cross_mag_solvable = analyze_toolface_coverage(raw_dni)

    sigma_g = 0.003
    sigma_b = 80.0
    sigma_dip = 0.15

    mbx_limit = 400.0 if cross_mag_solvable else 35.0
    mby_limit = 400.0 if cross_mag_solvable else 35.0

    lower_bounds = [
        -0.02, -0.02, -0.02,
        -0.005, -0.005, -0.005,
        -mbx_limit, -mby_limit,
        -5000.0,
        -0.01, -0.01, -0.01,
    ]
    upper_bounds = [
        0.02, 0.02, 0.02,
        0.005, 0.005, 0.005,
        mbx_limit, mby_limit,
        5000.0,
        0.01, 0.01, 0.01,
    ]

    if enable_misalignment:
        lower_bounds.extend([-0.015, -0.015, -0.015])
        upper_bounds.extend([0.015, 0.015, 0.015])
    else:
        lower_bounds.extend([-1e-7, -1e-7, -1e-7])
        upper_bounds.extend([1e-7, 1e-7, 1e-7])

    if enable_ref_corrections:
        lower_bounds.extend([-0.01, -250.0, -0.40])
        upper_bounds.extend([0.01, 250.0, 0.40])
    else:
        lower_bounds.extend([-1e-7, -1e-7, -1e-7])
        upper_bounds.extend([1e-7, 1e-7, 1e-7])

    solver_key = str(method).lower().strip()

    if solver_key in ("de", "differential_evolution"):
        de_bounds = list(zip(lower_bounds, upper_bounds))
        opt_res = differential_evolution(
            func=_compute_msa_scalar_loss,
            bounds=de_bounds,
            strategy="best1bin",
            maxiter=max_iter,
            popsize=popsize,
            tol=1e-3,
            mutation=(0.4, 0.9),
            recombination=0.8,
            seed=42,
            polish=True,
            args=(raw_dni, g_ref, b_ref, dip_ref_deg, sigma_g, sigma_b, sigma_dip),
        )
        best_x = opt_res.x
        cost = float(opt_res.fun)
        iterations = int(opt_res.nit)
        is_success = bool(opt_res.success or (cost < 50.0))
    else:
        bounds = (np.array(lower_bounds, dtype=np.float64), np.array(upper_bounds, dtype=np.float64))
        p0 = np.zeros(18, dtype=np.float64)

        opt_res = least_squares(
            fun=_compute_msa_residuals,
            x0=p0,
            bounds=bounds,
            method="trf",
            ftol=1e-5,
            xtol=1e-5,
            gtol=1e-5,
            max_nfev=max_iter * 20,
            args=(raw_dni, g_ref, b_ref, dip_ref_deg, sigma_g, sigma_b, sigma_dip),
        )
        best_x = opt_res.x
        cost = float(np.sum(opt_res.fun**2))
        iterations = int(opt_res.nfev)
        is_success = bool(opt_res.success or (cost < 50.0))

    best_sensor_params = SensorCalibrationParams.from_array(best_x[:15])
    best_ref_corrections = ReferenceFieldCorrections(
        delta_g=round(float(best_x[15]), 4),
        delta_b=round(float(best_x[16]), 1),
        delta_dip=round(float(best_x[17]), 2),
    )
    corrected_surveys = apply_sensor_correction(raw_dni, best_x[:15])

    return MsaResult(
        success=is_success,
        params=best_sensor_params,
        ref_corrections=best_ref_corrections,
        cost=cost,
        iterations=iterations,
        corrected_surveys=corrected_surveys,
        toolface_coverage_deg=round(coverage_deg, 1),
        is_cross_mag_solvable=cross_mag_solvable,
    )