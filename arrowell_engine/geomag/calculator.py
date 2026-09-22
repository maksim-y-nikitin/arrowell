"""Spherical harmonic field calculator for WMM/IGRF models.

Computes magnetic components (X, Y, Z, Total Field B, Dip, Declination)
using Associated Legendre polynomials and numerically stable recursive
Schmidt quasi-normalization.

Supports both single-station scalar calculation and fully vectorized
batch calculation for complete wellbore trajectories.
"""

import math
from dataclasses import dataclass
from datetime import date
from pathlib import Path
from typing import Sequence, Union

import numpy as np

from .cof_parser import WmmCoefficientLoader, WmmModelCoefficients


@dataclass(slots=True, frozen=True)
class MagneticElements:
    total_field_nt: float   # B_total (F) in nanoTesla
    horizontal_nt: float    # H intensity (nT)
    dip_deg: float          # Inclination / Dip angle (deg)
    declination_deg: float  # Magnetic Declination (deg)
    x_north_nt: float       # Northerly intensity (nT)
    y_east_nt: float        # Easterly intensity (nT)
    z_down_nt: float        # Vertical downward intensity (nT)


@dataclass(slots=True, frozen=True)
class BatchMagneticElements:
    total_field_nt: np.ndarray   # Shape: (K,)
    horizontal_nt: np.ndarray    # Shape: (K,)
    dip_deg: np.ndarray          # Shape: (K,)
    declination_deg: np.ndarray  # Shape: (K,)
    x_north_nt: np.ndarray       # Shape: (K,)
    y_east_nt: np.ndarray        # Shape: (K,)
    z_down_nt: np.ndarray        # Shape: (K,)


def to_decimal_year(survey_date: date) -> float:
    """Convert standard datetime.date object to decimal years."""
    year_start = date(survey_date.year, 1, 1)
    year_end = date(survey_date.year + 1, 1, 1)
    year_fraction = (survey_date - year_start).days / (year_end - year_start).days
    return survey_date.year + year_fraction


class GeomagneticModelEngine:
    """Evaluates magnetic field vectors based on standard spherical harmonics."""

    # WGS-84 reference ellipsoid constants
    A_WGS84 = 6378.137          # Semi-major axis in km
    B_WGS84 = 6356.7523142      # Semi-minor axis in km
    RE = 6371.2                 # Mean geomagnetic reference radius in km

    def __init__(self, model_file: Union[str, Path]):
        self.model: WmmModelCoefficients = WmmCoefficientLoader.load_from_npz(model_file)
        self._s_matrix = self._precompute_schmidt_quasi_norm(self.model.n_max)

    @staticmethod
    def _precompute_schmidt_quasi_norm(n_max: int) -> np.ndarray:
        """Precompute recursive Schmidt quasi-normalization matrix (zero factorials)."""
        s = np.zeros((n_max + 1, n_max + 1), dtype=np.float64)
        s[0, 0] = 1.0
        for n in range(1, n_max + 1):
            s[n, 0] = s[n - 1, 0] * float(2 * n - 1) / float(n)
            for m in range(1, n + 1):
                c = 2.0 if m == 1 else 1.0
                s[n, m] = s[n, m - 1] * math.sqrt(float(n - m + 1) * c / float(n + m))
        return s

    def calculate_batch(
        self,
        latitudes_deg: Union[Sequence[float], np.ndarray],
        longitudes_deg: Union[Sequence[float], np.ndarray],
        altitudes_meters: Union[Sequence[float], np.ndarray],
        survey_date: date,
    ) -> BatchMagneticElements:
        """Vectorized computation of geomagnetic field vectors for multiple 3D stations.

        Args:
            latitudes_deg: Array of geodetic latitudes in degrees.
            longitudes_deg: Array of geodetic longitudes in degrees.
            altitudes_meters: Array of altitudes above MSL/ellipsoid in meters.
            survey_date: Survey date for secular variation interpolation.

        Returns:
            BatchMagneticElements containing 1D NumPy arrays of calculated components.
        """
        lats = np.atleast_1d(np.asarray(latitudes_deg, dtype=np.float64))
        lons = np.atleast_1d(np.asarray(longitudes_deg, dtype=np.float64))
        alts = np.atleast_1d(np.asarray(altitudes_meters, dtype=np.float64))
        k_stations = len(lats)

        decimal_year = to_decimal_year(survey_date)
        g_t, h_t = WmmCoefficientLoader.evaluate_coefficients_at_date(self.model, decimal_year)

        lat_rad = np.radians(lats)
        lon_rad = np.radians(lons)
        alt_km = alts / 1000.0

        # Transform Geodetic to Spherical Coordinates (WGS-84) vectorized over K
        sin_lat = np.sin(lat_rad)
        cos_lat = np.cos(lat_rad)
        e2 = 1.0 - (self.B_WGS84 / self.A_WGS84) ** 2
        rc = self.A_WGS84 / np.sqrt(1.0 - e2 * sin_lat**2)
        xp = (rc + alt_km) * cos_lat
        zp = (rc * (1.0 - e2) + alt_km) * sin_lat
        r = np.sqrt(xp**2 + zp**2)
        theta = np.arctan2(xp, zp)  # Spherical co-latitude (rad)

        cos_theta = np.cos(theta)
        sin_theta = np.sin(theta)

        n_max = self.model.n_max

        # Vectorized Associated Legendre Polynomials: shape (n_max + 1, n_max + 1, K)
        p = np.zeros((n_max + 1, n_max + 1, k_stations), dtype=np.float64)
        dp = np.zeros((n_max + 1, n_max + 1, k_stations), dtype=np.float64)

        p[0, 0, :] = 1.0
        dp[0, 0, :] = 0.0

        for n in range(1, n_max + 1):
            for m in range(0, n + 1):
                if n == m:
                    p[n, m] = sin_theta * p[n - 1, m - 1]
                    dp[n, m] = sin_theta * dp[n - 1, m - 1] + cos_theta * p[n - 1, m - 1]
                elif n == 1 and m == 0:
                    p[n, m] = cos_theta * p[n - 1, m]
                    dp[n, m] = -sin_theta * p[n - 1, m]
                else:
                    if m > n - 2:
                        p[n, m] = cos_theta * p[n - 1, m]
                        dp[n, m] = cos_theta * dp[n - 1, m] - sin_theta * p[n - 1, m]
                    else:
                        k_factor = float(((n - 1)**2 - m**2)) / float((2 * n - 1) * (2 * n - 3))
                        p[n, m] = cos_theta * p[n - 1, m] - k_factor * p[n - 2, m]
                        dp[n, m] = cos_theta * dp[n - 1, m] - sin_theta * p[n - 1, m] - k_factor * dp[n - 2, m]

        # Apply precomputed Schmidt quasi-normalization via broadcasting
        for n in range(1, n_max + 1):
            for m in range(0, n + 1):
                scale = self._s_matrix[n, m]
                p[n, m] *= scale
                dp[n, m] *= scale

        # Longitudinal harmonic terms: shape (n_max + 1, K)
        m_indices = np.arange(n_max + 1)[:, np.newaxis]
        m_lon_angles = m_indices * lon_rad[np.newaxis, :]
        sin_m_lon = np.sin(m_lon_angles)
        cos_m_lon = np.cos(m_lon_angles)

        # Field summation in spherical coordinates
        b_r = np.zeros(k_stations, dtype=np.float64)
        b_theta = np.zeros(k_stations, dtype=np.float64)
        b_phi = np.zeros(k_stations, dtype=np.float64)
        ratio = self.RE / r

        safe_sin_theta = np.where(sin_theta > 1e-6, sin_theta, 1.0)

        for n in range(1, n_max + 1):
            r_pow = ratio ** (n + 2)
            for m in range(0, n + 1):
                term = g_t[n, m] * cos_m_lon[m] + h_t[n, m] * sin_m_lon[m]
                d_term = -g_t[n, m] * sin_m_lon[m] + h_t[n, m] * cos_m_lon[m]

                b_r += (n + 1) * r_pow * term * p[n, m]
                b_theta -= r_pow * term * dp[n, m]
                b_phi += np.where(sin_theta > 1e-6, (m * r_pow * d_term * p[n, m]) / safe_sin_theta, 0.0)

        # Rotate spherical (B_r, B_theta, B_phi) to geodetic (X_north, Y_east, Z_down)
        psi = theta - (np.pi / 2.0 - lat_rad)
        x_north = -b_theta * np.cos(psi) - b_r * np.sin(psi)
        y_east = b_phi
        z_down = b_theta * np.sin(psi) - b_r * np.cos(psi)

        h_horiz = np.hypot(x_north, y_east)
        f_total = np.sqrt(h_horiz**2 + z_down**2)

        raw_declination_deg = np.degrees(np.arctan2(y_east, x_north))
        declination_deg = (raw_declination_deg + 180.0) % 360.0 - 180.0
        dip_deg = np.degrees(np.arctan2(z_down, h_horiz))

        return BatchMagneticElements(
            total_field_nt=f_total,
            horizontal_nt=h_horiz,
            dip_deg=dip_deg,
            declination_deg=declination_deg,
            x_north_nt=x_north,
            y_east_nt=y_east,
            z_down_nt=z_down,
        )

    def calculate(
        self,
        latitude_deg: float,
        longitude_deg: float,
        altitude_meters: float,
        survey_date: date,
    ) -> MagneticElements:
        """Scalar calculation for single station (backward compatible)."""
        batch = self.calculate_batch(
            latitudes_deg=[latitude_deg],
            longitudes_deg=[longitude_deg],
            altitudes_meters=[altitude_meters],
            survey_date=survey_date,
        )
        return MagneticElements(
            total_field_nt=float(batch.total_field_nt[0]),
            horizontal_nt=float(batch.horizontal_nt[0]),
            dip_deg=float(batch.dip_deg[0]),
            declination_deg=float(batch.declination_deg[0]),
            x_north_nt=float(batch.x_north_nt[0]),
            y_east_nt=float(batch.y_east_nt[0]),
            z_down_nt=float(batch.z_down_nt[0]),
        )