"""MWD triaxial sensor transformation and earth field metrics.

Translates raw accelerometer (Gx, Gy, Gz) and magnetometer (Bx, By, Bz)
readings into directional surveys (Inc, Azim, GTF) and physical field quantities
(G_total, B_total, Magnetic Dip).

Includes singularity protection and industry-standard regularizations for
vertical wellbore intervals (Inc -> 0 deg).
"""

from dataclasses import dataclass
from typing import Optional, Union

import numpy as np


@dataclass(slots=True, frozen=True)
class SensorSurveyMetrics:
    g_total: np.ndarray           # Total gravity (normalized ~1.0 g or m/s^2)
    b_total: np.ndarray           # Total magnetic field (nT)
    dip_deg: np.ndarray           # Magnetic dip angle (deg)
    inc_deg: np.ndarray           # Wellbore inclination (deg)
    azim_mag_deg: np.ndarray      # Magnetic azimuth (deg)
    gtf_deg: np.ndarray           # Gravity toolface angle (deg)
    is_vertical: np.ndarray       # True where Inc < vertical threshold
    is_azimuth_valid: np.ndarray  # True where azimuth is mathematically meaningful
    is_gtf_valid: np.ndarray      # True where GTF is stable (Inc >= 2.0 deg)


def compute_survey_metrics(
    gx: Union[float, np.ndarray],
    gy: Union[float, np.ndarray],
    gz: Union[float, np.ndarray],
    bx: Union[float, np.ndarray],
    by: Union[float, np.ndarray],
    bz: Union[float, np.ndarray],
    vertical_inc_threshold_deg: float = 0.1,
    vertical_azimuth_lock: Optional[float] = 0.0,
) -> SensorSurveyMetrics:
    """Calculate survey angles and geomagnetic field invariants from raw sensors.

    Args:
        gx: Accelerometer X-axis raw measurement.
        gy: Accelerometer Y-axis raw measurement.
        gz: Accelerometer Z-axis raw measurement.
        bx: Magnetometer X-axis raw measurement (nT).
        by: Magnetometer Y-axis raw measurement (nT).
        bz: Magnetometer Z-axis raw measurement (nT).
        vertical_inc_threshold_deg: Inclination below which the wellbore is
            treated as vertical (default 0.1 deg, standard MWD practice).
        vertical_azimuth_lock: Constant azimuth assigned to vertical stations
            to prevent noise oscillations. If None, raw atan2 result is kept.

    Returns:
        SensorSurveyMetrics with calculated angles and validity masks.
    """
    _gx = np.atleast_1d(np.asarray(gx, dtype=np.float64))
    _gy = np.atleast_1d(np.asarray(gy, dtype=np.float64))
    _gz = np.atleast_1d(np.asarray(gz, dtype=np.float64))
    _bx = np.atleast_1d(np.asarray(bx, dtype=np.float64))
    _by = np.atleast_1d(np.asarray(by, dtype=np.float64))
    _bz = np.atleast_1d(np.asarray(bz, dtype=np.float64))

    g_xy = np.hypot(_gx, _gy)
    g_total = np.sqrt(_gx**2 + _gy**2 + _gz**2)
    b_total = np.sqrt(_bx**2 + _by**2 + _bz**2)

    # Protect against zero division
    safe_g = np.where(g_total == 0.0, 1.0, g_total)
    safe_b = np.where(b_total == 0.0, 1.0, b_total)

    # Magnetic Dip: sin(Dip) = (G . B) / (|G| * |B|)
    dot_gb = (_gx * _bx + _gy * _by + _gz * _bz) / (safe_g * safe_b)
    dot_gb = np.clip(dot_gb, -1.0, 1.0)
    dip_rad = np.arcsin(dot_gb)

    # Inclination: atan2(sqrt(Gx^2 + Gy^2), Gz)
    inc_rad = np.arctan2(g_xy, _gz)
    inc_deg = np.degrees(inc_rad)

    # Gravity Toolface (GTF): roll angle about tool axis
    gtf_rad = np.arctan2(-_gx, -_gy)
    gtf_deg = np.degrees(gtf_rad) % 360.0

    # Horizontal magnetic field projection for magnetic azimuth
    ew = (_gx * _by - _gy * _bx) * g_total
    ns = _bz * (_gx**2 + _gy**2) - _gz * (_gx * _bx + _gy * _by)
    raw_azim_rad = np.arctan2(ew, ns)
    azim_mag_deg = np.degrees(raw_azim_rad) % 360.0

    # -------------------------------------------------------------
    # REGULARIZATION AT VERTICAL (Inc -> 0 deg)
    # -------------------------------------------------------------
    is_vertical = inc_deg < vertical_inc_threshold_deg
    is_azimuth_valid = ~is_vertical
    is_gtf_valid = inc_deg >= 2.0  # Industry standard: GTF is unstable below 2 deg

    if vertical_azimuth_lock is not None:
        azim_mag_deg = np.where(is_vertical, vertical_azimuth_lock % 360.0, azim_mag_deg)

    return SensorSurveyMetrics(
        g_total=g_total,
        b_total=b_total,
        dip_deg=np.degrees(dip_rad),
        inc_deg=inc_deg,
        azim_mag_deg=azim_mag_deg,
        gtf_deg=gtf_deg,
        is_vertical=is_vertical,
        is_azimuth_valid=is_azimuth_valid,
        is_gtf_valid=is_gtf_valid,
    )