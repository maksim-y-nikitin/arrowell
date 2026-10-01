"""Multi-Station Analysis (MSA) calibration engine.

Provides two-stage optimization (LRA-CMA global exploration + TRF local refinement)
for downhole MWD triaxial accelerometer and magnetometer sensor error estimation,
regularized against standard ISCWSA tool error models and geomagnetic reference specs.
"""

import math
from dataclasses import dataclass
from typing import Callable, Optional, Tuple, Union

import numpy as np
from cmaes import CMA
from scipy.optimize import least_squares

from ..geomag.specs import GEOMAG_ERROR_MODELS, GeomagneticUncertaintySpec, ModelFamily
from ..sensors.models import SensorCalibrationParams, apply_sensor_correction
from ..trajectory.uncertainty import CORE_ISCWSA_MODELS

DEG_TO_RAD = np.pi / 180.0


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
    hit_boundary: bool
    param_uncertainties_1sigma: Optional[np.ndarray] = None


def analyze_toolface_coverage(raw_dni: np.ndarray) -> Tuple[float, bool]:
    """Evaluate angular dispersion of Gravity Toolface (GTF) across survey stations.

    Detects slide-drilling intervals where motor orientation remains static,
    leading to mathematical unobservability of cross-axial magnetometer biases.
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


def _get_iscwsa_prior_sigmas(
    g_ref: float,
    iscwsa_model_name: str = "ISCWSA_MWD_REV4",
    geomag_model: Union[str, ModelFamily] = ModelFamily.WMM,
    enable_misalignment: bool = True,
    enable_ref_corrections: bool = True,
) -> np.ndarray:
    """Extract strict 1-sigma tolerances from ISCWSA catalog and Geomag specs.

    Raises:
        KeyError: If the requested ISCWSA model or a required error term is missing.
    """
    g_scale = 1.0 / 9.80665 if g_ref < 5.0 else 1.0

    model_key = str(iscwsa_model_name).upper()
    if model_key not in CORE_ISCWSA_MODELS:
        raise KeyError(
            f"ISCWSA model '{model_key}' not found in loaded catalog. "
            f"Available models: {list(CORE_ISCWSA_MODELS.keys())}"
        )

    terms = {t.mnemonic: t.magnitude_1sigma for t in CORE_ISCWSA_MODELS[model_key]}

    # Strict extraction from catalog: KeyError raised if required term is absent
    sigma_ab = terms["ABXY-TI1S"] * g_scale
    sigma_as = terms["ASXY-TI1S"]
    sigma_mb_xy = terms["MBXY-TI1S"]
    sigma_ms = terms["MSXY-TI1S"]
    sigma_align = terms["XYM1"]
    sigma_mb_z = terms["AMIL"] * 10.0

    # Resolve geomagnetic model specifications
    if isinstance(geomag_model, str):
        geomag_family = ModelFamily(geomag_model.upper())
    else:
        geomag_family = geomag_model

    geo_spec: GeomagneticUncertaintySpec = GEOMAG_ERROR_MODELS.get(
        geomag_family, GEOMAG_ERROR_MODELS[ModelFamily.WMM]
    )

    sigma_dg = geo_spec.gre * g_scale
    sigma_db = geo_spec.bre
    sigma_ddip = float(math.degrees(geo_spec.dre)) if geo_spec.dre > 0.0 else 0.10

    return np.array([
        sigma_ab, sigma_ab, sigma_ab,
        sigma_as, sigma_as, sigma_as,
        sigma_mb_xy, sigma_mb_xy, sigma_mb_z,
        sigma_ms, sigma_ms, sigma_ms,
        sigma_align if enable_misalignment else 1e-6,
        sigma_align if enable_misalignment else 1e-6,
        sigma_align if enable_misalignment else 1e-6,
        sigma_dg if enable_ref_corrections else 1e-6,
        sigma_db if enable_ref_corrections else 1e-6,
        sigma_ddip if enable_ref_corrections else 1e-6,
    ], dtype=np.float64)


def _get_soft_physical_bounds(
    g_ref: float,
    is_cross_mag_solvable: bool,
    enable_misalignment: bool,
    enable_ref_corrections: bool,
) -> Tuple[np.ndarray, np.ndarray]:
    """Define physical hardware sanity bounds for parameter search space."""
    g_scale = 1.0 if g_ref < 5.0 else 9.80665

    ab_lim = 0.05 * g_scale
    as_lim = 0.03

    mb_xy_lim = 500.0 if is_cross_mag_solvable else 50.0
    mb_z_lim = 5000.0
    ms_lim = 0.05

    align_lim = 2.0 * DEG_TO_RAD if enable_misalignment else 1e-6

    dg_lim = 0.01 * g_scale if enable_ref_corrections else 1e-6
    db_lim = 1500.0 if enable_ref_corrections else 1e-6
    ddip_lim = 3.0 if enable_ref_corrections else 1e-6

    lower = np.array([
        -ab_lim, -ab_lim, -ab_lim,
        -as_lim, -as_lim, -as_lim,
        -mb_xy_lim, -mb_xy_lim, -mb_z_lim,
        -ms_lim, -ms_lim, -ms_lim,
        -align_lim, -align_lim, -align_lim,
        -dg_lim, -db_lim, -ddip_lim,
    ], dtype=np.float64)

    return lower, -lower


def _compute_normalized_msa_residuals(
    u: np.ndarray,
    prior_sigmas: np.ndarray,
    raw_dni: np.ndarray,
    g_ref: float,
    b_ref: float,
    dip_ref_deg: float,
    sigma_g: float,
    sigma_b: float,
    sigma_dip: float,
) -> np.ndarray:
    """Compute normalized observation residuals and Bayesian MAP prior penalties."""
    p = u * prior_sigmas

    sensor_params = p[:15]
    delta_g_val = p[15]
    delta_b_val = p[16]
    delta_dip_val = p[17]

    cor = apply_sensor_correction(raw_dni, sensor_params)
    gx, gy, gz = cor[:, 0], cor[:, 1], cor[:, 2]
    bx, by, bz = cor[:, 3], cor[:, 4], cor[:, 5]

    g_tot = np.hypot(np.hypot(gx, gy), gz)
    b_tot = np.hypot(np.hypot(bx, by), bz)

    safe_gb = np.where((g_tot * b_tot) == 0.0, 1.0, g_tot * b_tot)
    dot_gb = (gx * bx + gy * by + gz * bz) / safe_gb
    dip_deg = np.degrees(np.arcsin(np.clip(dot_gb, -1.0, 1.0)))

    eff_g = g_ref - delta_g_val
    eff_b = b_ref - delta_b_val
    eff_dip = dip_ref_deg - delta_dip_val

    res_g = (g_tot - eff_g) / sigma_g
    res_b = (b_tot - eff_b) / sigma_b
    res_dip = (dip_deg - eff_dip) / sigma_dip

    res_prior = u

    return np.concatenate([res_g, res_b, res_dip, res_prior])


class _LraCmaOptimizer:
    """Adapter wrapping cmaes.CMA with Learning Rate Adaptation (LRA)."""

    def __init__(
        self,
        x0: np.ndarray,
        sigma0: float,
        lower_bounds: np.ndarray,
        upper_bounds: np.ndarray,
        max_iter: int = 100,
        lr_adapt: bool = True,
        seed: int = 42,
    ):
        self.max_iter = max_iter
        self.bounds = np.column_stack([lower_bounds, upper_bounds])

        self.optimizer = CMA(
            mean=x0,
            sigma=sigma0,
            bounds=self.bounds,
            lr_adapt=lr_adapt,
            seed=seed,
        )

    def optimize(self, loss_fn: Callable[[np.ndarray], float]) -> Tuple[np.ndarray, float, int]:
        best_x = self.optimizer.mean.copy()
        best_cost = np.inf
        counteval = 0

        for gen in range(self.max_iter):
            solutions = []
            for _ in range(self.optimizer.population_size):
                cand = self.optimizer.ask()
                cost = loss_fn(cand)
                solutions.append((cand, cost))
                counteval += 1

                if cost < best_cost:
                    best_cost = float(cost)
                    best_x = cand.copy()

            self.optimizer.tell(solutions)

            if self.optimizer.should_stop():
                break

        return best_x, best_cost, counteval


def run_msa_optimization(
    raw_dni: np.ndarray,
    g_ref: float = 1.0,
    b_ref: float = 52000.0,
    dip_ref_deg: float = 72.0,
    iscwsa_model_name: str = "ISCWSA_MWD_REV4",
    geomag_model: Union[str, ModelFamily] = ModelFamily.WMM,
    enable_misalignment: bool = True,
    enable_ref_corrections: bool = True,
    cma_generations: int = 100,
    max_iter: Optional[int] = None,
    seed: int = 42,
    **kwargs,
) -> MsaResult:
    """Execute two-stage hybrid MSA calibration (LRA-CMA -> TRF)."""
    if max_iter is not None:
        cma_generations = max_iter

    n_surveys = raw_dni.shape[0]
    if n_surveys < 4:
        raise ValueError("At least 4 survey stations are required for MSA convergence.")

    coverage_deg, cross_mag_solvable = analyze_toolface_coverage(raw_dni)

    sigma_g = 0.003 if g_ref < 5.0 else 0.03
    sigma_b = 80.0
    sigma_dip = 0.15

    sigmas_prior = _get_iscwsa_prior_sigmas(
        g_ref=g_ref,
        iscwsa_model_name=iscwsa_model_name,
        geomag_model=geomag_model,
        enable_misalignment=enable_misalignment,
        enable_ref_corrections=enable_ref_corrections,
    )
    p_lower, p_upper = _get_soft_physical_bounds(
        g_ref=g_ref,
        is_cross_mag_solvable=cross_mag_solvable,
        enable_misalignment=enable_misalignment,
        enable_ref_corrections=enable_ref_corrections,
    )

    u_lower = p_lower / sigmas_prior
    u_upper = p_upper / sigmas_prior

    def scalar_cma_objective(u_vec: np.ndarray) -> float:
        res = _compute_normalized_msa_residuals(
            u=u_vec,
            prior_sigmas=sigmas_prior,
            raw_dni=raw_dni,
            g_ref=g_ref,
            b_ref=b_ref,
            dip_ref_deg=dip_ref_deg,
            sigma_g=sigma_g,
            sigma_b=sigma_b,
            sigma_dip=sigma_dip,
        )
        return float(np.sum(res**2))

    # Stage 1: Global basin identification via Learning Rate Adaptation CMA-ES
    cma = _LraCmaOptimizer(
        x0=np.zeros(18, dtype=np.float64),
        sigma0=1.0,
        lower_bounds=u_lower,
        upper_bounds=u_upper,
        max_iter=cma_generations,
        lr_adapt=True,
        seed=seed,
    )
    u_cma_best, _, cma_evals = cma.optimize(scalar_cma_objective)

    u_trf_init = np.clip(u_cma_best, u_lower + 1e-5, u_upper - 1e-5)

    # Stage 2: Local gradient refinement via Trust Region Reflective (TRF)
    trf_res = least_squares(
        fun=_compute_normalized_msa_residuals,
        x0=u_trf_init,
        bounds=(u_lower, u_upper),
        method="trf",
        ftol=1e-7,
        xtol=1e-7,
        gtol=1e-7,
        max_nfev=300,
        args=(
            sigmas_prior,
            raw_dni,
            g_ref,
            b_ref,
            dip_ref_deg,
            sigma_g,
            sigma_b,
            sigma_dip,
        ),
    )

    u_best = trf_res.x
    cost = float(np.sum(trf_res.fun**2))
    total_evals = cma_evals + int(trf_res.nfev)
    is_success = bool(trf_res.success or (cost < 50.0))

    p_best = u_best * sigmas_prior

    at_lower = np.isclose(u_best, u_lower, rtol=1e-3, atol=1e-3)
    at_upper = np.isclose(u_best, u_upper, rtol=1e-3, atol=1e-3)
    hit_boundary = bool(np.any(at_lower | at_upper))

    # Compute posterior uncertainty from Gauss-Newton covariance approximation
    param_uncertainties = None
    try:
        jtj = trf_res.jac.T @ trf_res.jac
        cov_u = np.linalg.inv(jtj)
        cov_p = np.outer(sigmas_prior, sigmas_prior) * cov_u
        param_uncertainties = np.sqrt(np.maximum(0.0, np.diag(cov_p)))
    except np.linalg.LinAlgError:
        pass

    best_sensor_params = SensorCalibrationParams.from_array(p_best[:15])
    best_ref_corrections = ReferenceFieldCorrections(
        delta_g=round(float(p_best[15]), 5),
        delta_b=round(float(p_best[16]), 1),
        delta_dip=round(float(p_best[17]), 3),
    )
    corrected_surveys = apply_sensor_correction(raw_dni, p_best[:15])

    return MsaResult(
        success=is_success,
        params=best_sensor_params,
        ref_corrections=best_ref_corrections,
        cost=cost,
        iterations=total_evals,
        corrected_surveys=corrected_surveys,
        toolface_coverage_deg=round(coverage_deg, 1),
        is_cross_mag_solvable=cross_mag_solvable,
        hit_boundary=hit_boundary,
        param_uncertainties_1sigma=param_uncertainties,
    )