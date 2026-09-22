"""ISCWSA Wellbore Position Uncertainty and Anti-Collision Engine.

Implements the standard industry error propagation model (SPE 67616 / ISCWSA / OWSG):
  1. Analytical evaluation of ISCWSA weighting functions (depth, sensors, alignment, geomagnetic).
  2. Strict propagation according to error modes:
     - Random (R): independent between stations
     - Systematic (S): vectorially accumulated along run/BHA
     - Global (G): field-wide systematic accumulation
  3. Covariance matrix synthesis in NEV (North-East-Vertical) frame.
  4. 3D Ellipsoid of Uncertainty (EOU) eigen-decomposition.
  5. 3D Anti-Collision Clearance & Separation Factor (SF) calculation.
"""

import math
from dataclasses import dataclass
from typing import Dict, List

import numpy as np

from ..geomag.downloader import CORE_ISCWSA_MODELS, IscwsaErrorTerm, ErrorPropagationMode


@dataclass(slots=True, frozen=True)
class EllipsoidOfUncertainty:
    station_idx: int
    md_m: float
    covariance_nev: np.ndarray       # 3x3 covariance matrix in meters^2 (N, E, TVD)
    semi_major_m: float              # 3D Maximum semi-axis (k * sqrt(lambda_1))
    semi_intermediate_m: float       # 3D Intermediate semi-axis (k * sqrt(lambda_2))
    semi_minor_m: float              # 3D Minimum semi-axis (k * sqrt(lambda_3))
    eigenvectors: np.ndarray         # 3x3 modal matrix of principal axes
    horiz_semi_major_m: float        # Horizontal projection semi-major axis
    horiz_semi_minor_m: float        # Horizontal projection semi-minor axis
    horiz_azimuth_deg: float         # Orientation of horizontal ellipse (deg)
    vertical_1sigma_m: float         # 1-sigma uncertainty in TVD (m)


@dataclass(slots=True, frozen=True)
class SeparationFactorResult:
    center_distance_m: float         # Center-to-center 3D distance (m)
    clearance_distance_m: float      # Distance between wellbore surfaces (m)
    sigma_subject_m: float           # Subject well projected 1-sigma error along line of centers
    sigma_offset_m: float            # Offset well projected 1-sigma error along line of centers
    combined_uncertainty_m: float    # Total expanded uncertainty envelope (k * (sigma_S + sigma_O))
    separation_factor: float         # Calculated SF
    is_violation: bool               # True if SF < 1.0 (collision threshold)
    warning_level: str               # "CRITICAL", "WARNING", "SAFE"


class IscwsaWeightingEvaluator:
    """Analytical evaluation of error sensitivity vector: w = [dMD, dInc, dAz]^T."""

    @staticmethod
    def evaluate(
        wfunc: str,
        md: float,
        tvd: float,
        inc_rad: float,
        az_mag_rad: float,
        b_total_nt: float,
        dip_rad: float,
        g_val: float = 9.80665,
    ) -> np.ndarray:
        """Calculate [dMD, dInc, dAz] response for a unit error parameter."""
        dp = np.zeros(3, dtype=np.float64)

        sin_i = math.sin(inc_rad)
        cos_i = math.cos(inc_rad)
        sin_i_safe = sin_i if abs(sin_i) > 1e-4 else math.copysign(1e-4, sin_i if sin_i != 0.0 else 1.0)
        tan_i_safe = math.tan(inc_rad) if abs(math.tan(inc_rad)) > 1e-4 else 1e-4

        sin_a = math.sin(az_mag_rad)
        cos_a = math.cos(az_mag_rad)
        tan_dip = math.tan(dip_rad)
        b_cos_dip = b_total_nt * math.cos(dip_rad)

        if wfunc == "DREF":
            dp[0] = 1.0
        elif wfunc == "DSF":
            dp[0] = md
        elif wfunc == "DST":
            dp[0] = md * tvd

        elif wfunc == "ABXY-TI1":
            dp[1] = -cos_i / g_val
            dp[2] = (tan_dip * cos_i * sin_a) / g_val
        elif wfunc == "ABXY-TI2":
            dp[2] = (1.0 / tan_i_safe - tan_dip * cos_a) / g_val
        elif wfunc == "ABZ":
            dp[1] = -sin_i / g_val
            dp[2] = (tan_dip * sin_i * sin_a) / g_val
        elif wfunc == "ASXY-TI1":
            dp[1] = (sin_i * cos_i) / math.sqrt(2.0)
            dp[2] = (-tan_dip * sin_i * cos_i * sin_a) / math.sqrt(2.0)
        elif wfunc == "ASXY-TI2":
            dp[1] = (sin_i * cos_i) / 2.0
            dp[2] = (-tan_dip * sin_i * cos_i * sin_a) / 2.0
        elif wfunc == "ASXY-TI3":
            dp[2] = (tan_dip * sin_i * cos_a - cos_i) / 2.0
        elif wfunc == "ASZ":
            dp[1] = -sin_i * cos_i
            dp[2] = tan_dip * sin_i * cos_i * sin_a

        elif wfunc == "MBXY-TI1":
            dp[2] = -cos_i * sin_a / b_cos_dip
        elif wfunc == "MBXY-TI2":
            dp[2] = cos_a / b_cos_dip
        elif wfunc == "MBZ":
            dp[2] = -sin_i * sin_a / b_cos_dip
        elif wfunc == "MSXY-TI1":
            dp[2] = sin_i * sin_a * (tan_dip * cos_i + sin_i * cos_a) / math.sqrt(2.0)
        elif wfunc == "MSXY-TI2":
            dp[2] = sin_a * (tan_dip * sin_i * cos_i - (cos_i**2) * cos_a - cos_a) / 2.0
        elif wfunc == "MSXY-TI3":
            dp[2] = (cos_i * math.cos(2.0 * az_mag_rad) - tan_dip * sin_i * cos_a) / 2.0
        elif wfunc == "MSZ":
            dp[2] = -(sin_i * cos_a + tan_dip * cos_i) * sin_i * sin_a

        elif wfunc == "AMIL":
            dp[2] = sin_i * sin_a / b_cos_dip

        elif wfunc == "SAG":
            dp[1] = sin_i

        elif wfunc == "XYM1":
            dp[1] = abs(sin_i)
        elif wfunc == "XYM2":
            dp[2] = -1.0
        elif wfunc == "XYM3":
            dp[1] = abs(cos_i) * cos_a
            dp[2] = -(abs(cos_i) * sin_a) / sin_i_safe
        elif wfunc == "XYM4":
            dp[1] = abs(cos_i) * sin_a
            dp[2] = (abs(cos_i) * cos_a) / sin_i_safe

        elif wfunc == "AZ":  # DECG / DECR
            dp[2] = 1.0
        elif wfunc == "DBH":  # DBHG / DBHR
            dp[2] = 1.0 / b_cos_dip

        return dp


def calculate_trajectory_uncertainty(
    md: np.ndarray,
    inc_deg: np.ndarray,
    azim_deg: np.ndarray,
    tvd: np.ndarray,
    b_total_nt: float = 52000.0,
    dip_deg: float = 72.0,
    declination_deg: float = 0.0,
    model_name: str = "ISCWSA_MWD_REV4",
    expansion_k: float = 2.0,  # 2.0 = 2-sigma (95.4% 1D) | 2.7955 = 3D 95%
) -> List[EllipsoidOfUncertainty]:
    """Calculate the 3D Ellipsoid of Uncertainty (EOU) along wellbore trajectory.

    Args:
        md: Measured depth array (m).
        inc_deg: Inclination array (deg).
        azim_deg: Azimuth array (deg).
        tvd: True vertical depth array (m).
        b_total_nt: Reference geomagnetic total field (nT).
        dip_deg: Reference geomagnetic dip angle (deg).
        declination_deg: Magnetic declination (deg).
        model_name: ISCWSA tool model key.
        expansion_k: Standard ellipse coverage factor (k=2.0 for standard 2-sigma).

    Returns:
        List of EllipsoidOfUncertainty for each survey station.
    """
    station_count = len(md)
    if station_count < 2:
        raise ValueError("At least 2 stations required for error propagation.")

    terms: List[IscwsaErrorTerm] = CORE_ISCWSA_MODELS.get(
        model_name, CORE_ISCWSA_MODELS["ISCWSA_MWD_REV4"]
    )

    inc_rad = np.radians(inc_deg)
    azim_rad = np.radians(azim_deg)
    dip_rad = math.radians(dip_deg)
    dec_rad = math.radians(declination_deg)

    azim_mag_rad = azim_rad - dec_rad

    systematic_vectors: Dict[str, np.ndarray] = {
        t.mnemonic: np.zeros(3, dtype=np.float64)
        for t in terms if t.mode != ErrorPropagationMode.RANDOM
    }

    random_covariances = np.zeros((station_count, 3, 3), dtype=np.float64)
    total_covariances = np.zeros((station_count, 3, 3), dtype=np.float64)

    results: List[EllipsoidOfUncertainty] = []

    for k in range(1, station_count):
        delta_md = md[k] - md[k - 1]
        if delta_md <= 0.0:
            total_covariances[k] = total_covariances[k - 1]
            continue

        inc_m = 0.5 * (inc_rad[k] + inc_rad[k - 1])
        azim_m = 0.5 * (azim_rad[k] + azim_rad[k - 1])

        sin_im = math.sin(inc_m)
        cos_im = math.cos(inc_m)
        sin_am = math.sin(azim_m)
        cos_am = math.cos(azim_m)

        j_md = np.array([sin_im * cos_am, sin_im * sin_am, cos_im], dtype=np.float64)
        j_inc = delta_md * np.array([cos_im * cos_am, cos_im * sin_am, -sin_im], dtype=np.float64)
        j_az = delta_md * np.array([-sin_im * sin_am, sin_im * cos_am, 0.0], dtype=np.float64)

        for term in terms:
            dp = IscwsaWeightingEvaluator.evaluate(
                wfunc=term.weight_func,
                md=float(md[k]),
                tvd=float(tvd[k]),
                inc_rad=float(inc_rad[k]),
                az_mag_rad=float(azim_mag_rad[k]),
                b_total_nt=b_total_nt,
                dip_rad=dip_rad,
            )

            dr_k = (
                j_md * (dp[0] if term.weight_func in ("DREF", "DSF", "DST") else 0.0) +
                0.5 * j_inc * dp[1] +
                0.5 * j_az * dp[2]
            ) * term.magnitude_1sigma

            if term.mode == ErrorPropagationMode.RANDOM:
                random_covariances[k] += np.outer(dr_k, dr_k)
            else:
                systematic_vectors[term.mnemonic] += dr_k

        cov_k = random_covariances[k].copy()
        for vec in systematic_vectors.values():
            cov_k += np.outer(vec, vec)

        total_covariances[k] = cov_k

    total_covariances[0] = np.zeros((3, 3), dtype=np.float64)

    for k in range(station_count):
        cov = total_covariances[k]

        eigenvals, eigenvecs = np.linalg.eigh(cov)
        eigenvals = np.maximum(eigenvals, 0.0)

        idx_sort = np.argsort(eigenvals)[::-1]
        eigenvals = eigenvals[idx_sort]
        eigenvecs = eigenvecs[:, idx_sort]

        semi_a = float(expansion_k * math.sqrt(float(eigenvals[0])))
        semi_b = float(expansion_k * math.sqrt(float(eigenvals[1])))
        semi_c = float(expansion_k * math.sqrt(float(eigenvals[2])))

        cov_horiz = cov[:2, :2]
        eig_h, vec_h = np.linalg.eigh(cov_horiz)
        eig_h = np.maximum(eig_h, 0.0)

        h_major = float(expansion_k * math.sqrt(float(np.max(eig_h))))
        h_minor = float(expansion_k * math.sqrt(float(np.min(eig_h))))

        major_idx = int(np.argmax(eig_h))
        major_vec = vec_h[:, major_idx]
        horiz_az_deg = float(math.degrees(math.atan2(float(major_vec[1]), float(major_vec[0]))) % 360.0)

        results.append(
            EllipsoidOfUncertainty(
                station_idx=k,
                md_m=float(md[k]),
                covariance_nev=cov,
                semi_major_m=round(semi_a, 3),
                semi_intermediate_m=round(semi_b, 3),
                semi_minor_m=round(semi_c, 3),
                eigenvectors=eigenvecs,
                horiz_semi_major_m=round(h_major, 3),
                horiz_semi_minor_m=round(h_minor, 3),
                horiz_azimuth_deg=round(horiz_az_deg, 2),
                vertical_1sigma_m=round(float(math.sqrt(float(cov[2, 2]))), 3),
            )
        )

    return results


def calculate_separation_factor(
    pos_subject_nev: np.ndarray,
    cov_subject_nev: np.ndarray,
    pos_offset_nev: np.ndarray,
    cov_offset_nev: np.ndarray,
    well_radius_subject_m: float = 0.108,
    well_radius_offset_m: float = 0.108,
    expansion_k: float = 2.0,
) -> SeparationFactorResult:
    """Calculate Anti-Collision Clearance & Separation Factor (SF).

    Formula (ISCWSA / SPE 67616):
      SF = (Center_Dist - Radii) / (k * (sigma_subject + sigma_offset))
    """
    delta_vec = pos_offset_nev - pos_subject_nev
    center_dist = float(np.linalg.norm(delta_vec))

    if center_dist < 1e-3:
        return SeparationFactorResult(
            center_distance_m=0.0,
            clearance_distance_m=0.0,
            sigma_subject_m=0.0,
            sigma_offset_m=0.0,
            combined_uncertainty_m=0.0,
            separation_factor=0.0,
            is_violation=True,
            warning_level="CRITICAL (Collision)",
        )

    u = delta_vec / center_dist

    var_s = float(u.T @ cov_subject_nev @ u)
    var_o = float(u.T @ cov_offset_nev @ u)

    sigma_s = math.sqrt(max(0.0, var_s))
    sigma_o = math.sqrt(max(0.0, var_o))

    combined_envelope = expansion_k * (sigma_s + sigma_o)
    total_radii = well_radius_subject_m + well_radius_offset_m
    clearance_dist = center_dist - total_radii

    if combined_envelope > 0.0:
        sf = clearance_dist / combined_envelope
    else:
        sf = 999.0

    if sf < 1.0:
        warning = "CRITICAL (Intersection Risk)"
    elif sf < 1.5:
        warning = "WARNING (Close Proximity)"
    else:
        warning = "SAFE"

    return SeparationFactorResult(
        center_distance_m=round(center_dist, 2),
        clearance_distance_m=round(clearance_dist, 2),
        sigma_subject_m=round(sigma_s, 3),
        sigma_offset_m=round(sigma_o, 3),
        combined_uncertainty_m=round(combined_envelope, 2),
        separation_factor=round(sf, 3),
        is_violation=sf < 1.0,
        warning_level=warning,
    )