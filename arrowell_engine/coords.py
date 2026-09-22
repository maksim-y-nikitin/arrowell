"""Geodetic coordinate transformations and grid convergence utilities.

Implements WGS-84 ellipsoid mathematics and Universal Transverse Mercator (UTM)
projections to compute Meridian Convergence for magnetic-to-grid azimuth corrections.
"""

import math
from dataclasses import dataclass


@dataclass(slots=True, frozen=True)
class UtmCoordinate:
    easting: float
    northing: float
    zone_number: int
    zone_letter: str
    grid_convergence_deg: float
    scale_factor: float


class GeodeticEngine:
    """WGS-84 ellipsoid and Transverse Mercator projection mathematics."""

    # WGS-84 reference ellipsoid parameters
    A = 6378137.0                # Semi-major axis in meters
    F = 1.0 / 298.257223563      # Flattening
    B = A * (1.0 - F)            # Semi-minor axis (~6356752.3142 m)
    E_SQ = F * (2.0 - F)         # First eccentricity squared
    E_PRIME_SQ = E_SQ / (1.0 - E_SQ)  # Second eccentricity squared
    K0 = 0.9996                  # UTM scale factor on central meridian

    @classmethod
    def calculate_meridian_convergence(cls, lat_deg: float, lon_deg: float) -> float:
        """Calculate grid convergence angle in degrees.

        Formula: Convergence = Azimuth_true - Azimuth_grid
        Positive convergence implies Grid North is East of True North.
        """
        utm_info = cls.geodetic_to_utm(lat_deg, lon_deg)
        return utm_info.grid_convergence_deg

    @classmethod
    def geodetic_to_utm(cls, lat_deg: float, lon_deg: float) -> UtmCoordinate:
        """Project latitude and longitude into UTM coordinates and convergence angle."""
        lat_rad = math.radians(lat_deg)
        lon_rad = math.radians(lon_deg)

        # Determine UTM Zone Number
        zone_number = int((lon_deg + 180.0) / 6.0) + 1
        if zone_number > 60:
            zone_number = 1

        # Central meridian for this zone
        lon_origin = (zone_number - 1) * 6.0 - 180.0 + 3.0
        lon_origin_rad = math.radians(lon_origin)

        # Zone letter calculation
        letters = "CDEFGHJKLMNPQRSTUVWX"
        lat_idx = int((lat_deg + 80.0) / 8.0)
        zone_letter = letters[min(max(lat_idx, 0), len(letters) - 1)]

        sin_lat = math.sin(lat_rad)
        cos_lat = math.cos(lat_rad)
        tan_lat = math.tan(lat_rad)

        n = cls.A / math.sqrt(1.0 - cls.E_SQ * sin_lat**2)
        t = tan_lat**2
        c = cls.E_PRIME_SQ * cos_lat**2
        a_term = cos_lat * (lon_rad - lon_origin_rad)

        # Meridian distance calculation
        m = cls.A * (
            (1.0 - cls.E_SQ / 4.0 - 3.0 * cls.E_SQ**2 / 64.0 - 5.0 * cls.E_SQ**3 / 256.0) * lat_rad
            - (3.0 * cls.E_SQ / 8.0 + 3.0 * cls.E_SQ**2 / 32.0 + 45.0 * cls.E_SQ**3 / 1024.0) * math.sin(2.0 * lat_rad)
            + (15.0 * cls.E_SQ**2 / 256.0 + 45.0 * cls.E_SQ**3 / 1024.0) * math.sin(4.0 * lat_rad)
            - (35.0 * cls.E_SQ**3 / 3072.0) * math.sin(6.0 * lat_rad)
        )

        # Easting computation
        easting = cls.K0 * n * (
            a_term
            + (1.0 - t + c) * a_term**3 / 6.0
            + (5.0 - 18.0 * t + t**2 + 72.0 * c - 58.0 * cls.E_PRIME_SQ) * a_term**5 / 120.0
        ) + 500000.0  # False Easting

        # Northing computation
        northing = cls.K0 * (
            m
            + n * tan_lat * (
                a_term**2 / 2.0
                + (5.0 - t + 9.0 * c + 4.0 * c**2) * a_term**4 / 24.0
                + (61.0 - 58.0 * t + t**2 + 600.0 * c - 330.0 * cls.E_PRIME_SQ) * a_term**6 / 720.0
            )
        )
        if lat_deg < 0.0:
            northing += 10000000.0  # False Northing for Southern Hemisphere

        # Grid convergence approximation (accurate within <0.001 deg)
        delta_lon = lon_rad - lon_origin_rad
        convergence_rad = delta_lon * sin_lat * (
            1.0 + (delta_lon * cos_lat)**2 / 3.0 * (1.0 + 3.0 * c + 2.0 * c**2)
        )
        convergence_deg = math.degrees(convergence_rad)

        return UtmCoordinate(
            easting=round(easting, 3),
            northing=round(northing, 3),
            zone_number=zone_number,
            zone_letter=zone_letter,
            grid_convergence_deg=round(convergence_deg, 4),
            scale_factor=round(cls.K0, 6),
        )