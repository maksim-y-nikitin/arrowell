"""Geomagnetic and geodetic reference models wrapper.

Replaces deprecated hardcoded model files with the standard World Magnetic Model
(via pygeomag or official NOAA WMM.COF) and WGS84 normal gravity formulas.
"""

import math
from datetime import date
from typing import Tuple

from pygeomag import GeoMag


def to_decimal_year(survey_date: date) -> float:
    """Convert standard datetime.date object to decimal years."""
    year_start = date(survey_date.year, 1, 1)
    year_end = date(survey_date.year + 1, 1, 1)
    year_fraction = (survey_date - year_start).days / (year_end - year_start).days
    return survey_date.year + year_fraction


class GeomagneticReferenceService:
    """Provides earth reference parameters (total gravity, total field, dip, declination)."""

    def __init__(self):
        self._geomag = GeoMag()

    @staticmethod
    def normal_gravity_wgs84(latitude_deg: float) -> float:
        """Calculate normal gravity at sea level using Somigliana's formula (WGS84)."""
        lat_rad = math.radians(latitude_deg)
        sin_lat_sq = math.sin(lat_rad) ** 2
        # Somigliana coefficients for WGS84
        g0 = 9.7803267714 * (1.0 + 0.00193185138639 * sin_lat_sq) / math.sqrt(1.0 - 0.00669437999014 * sin_lat_sq)
        return g0

    def get_magnetic_reference(
        self,
        lat_deg: float,
        lon_deg: float,
        alt_meters: float,
        survey_date: date,
    ) -> Tuple[float, float, float]:
        """Compute geomagnetic field components.

        Args:
            lat_deg: Geodetic latitude in degrees.
            lon_deg: Geodetic longitude in degrees.
            alt_meters: Altitude above MSL/ellipsoid in meters.
            survey_date: Survey date.

        Returns:
            Tuple of (Total Field [nT], Dip Angle [deg], Declination [deg]).
        """
        alt_km = alt_meters / 1000.0
        decimal_year = to_decimal_year(survey_date)
        result = self._geomag.calculate(glat=lat_deg, glon=lon_deg, alt=alt_km, time=decimal_year)
        return float(result.f), float(result.d), float(result.dec)