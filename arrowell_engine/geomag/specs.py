"""Geomagnetic model uncertainty specifications and ISCWSA error terms.

Defines 1-sigma uncertainty tolerances for standard global models (WMM, BGGM, HDGM)
and field-referencing techniques (IFR1, IFR2) based on ISCWSA OWSG Rev 4/5 standards.
"""

import math
from dataclasses import dataclass
from enum import Enum


class ModelFamily(str, Enum):
    WMM = "WMM"      # World Magnetic Model (NOAA/BGS, open)
    IGRF = "IGRF"    # International Geomagnetic Reference Field (IAGA, open)
    BGGM = "BGGM"    # British Geological Survey Global Model (Commercial standard)
    HDGM = "HDGM"    # High Definition Geomagnetic Model (NOAA commercial)
    EMM = "EMM"      # Enhanced Magnetic Model (NOAA high degree crustal, open)
    IFR1 = "IFR1"    # Static In-Field Referencing (Local aeromagnetic survey)
    IFR2 = "IFR2"    # Dynamic In-Field Referencing (Local real-time base station)


@dataclass(slots=True, frozen=True)
class GeomagneticUncertaintySpec:
    """1-sigma uncertainty parameters for MWD quality control and error modeling."""
    mgi: float  # Total gravity reference error (m/s^2)
    mbi: float  # Total magnetic reference systematic error (nT)
    mdi: float  # Magnetic dip reference systematic error (rad)
    dec: float  # Magnetic declination constant systematic error (rad)
    dbh: float  # Horizontal field dependent declination error (rad * nT)
    gre: float  # Gravity random noise (m/s^2)
    bre: float  # Magnetic total field random noise (nT)
    dre: float  # Magnetic dip random noise (rad)


DEG_TO_RAD = math.pi / 180.0

# ISCWSA OWSG validated standard error values
GEOMAG_ERROR_MODELS = {
    ModelFamily.WMM: GeomagneticUncertaintySpec(
        mgi=0.01,
        mbi=152.0,
        mdi=0.22 * DEG_TO_RAD,
        dec=0.36 * DEG_TO_RAD,
        dbh=5430.0 * DEG_TO_RAD,
        gre=0.0015,
        bre=60.0,
        dre=0.08 * DEG_TO_RAD,
    ),
    ModelFamily.IGRF: GeomagneticUncertaintySpec(
        mgi=0.01,
        mbi=152.0,
        mdi=0.22 * DEG_TO_RAD,
        dec=0.36 * DEG_TO_RAD,
        dbh=5430.0 * DEG_TO_RAD,
        gre=0.0015,
        bre=60.0,
        dre=0.08 * DEG_TO_RAD,
    ),
    ModelFamily.BGGM: GeomagneticUncertaintySpec(
        mgi=0.01,
        mbi=130.0,
        mdi=0.20 * DEG_TO_RAD,
        dec=0.36 * DEG_TO_RAD,
        dbh=5000.0 * DEG_TO_RAD,
        gre=0.0015,
        bre=60.0,
        dre=0.08 * DEG_TO_RAD,
    ),
    ModelFamily.HDGM: GeomagneticUncertaintySpec(
        mgi=0.01,
        mbi=107.0,
        mdi=0.16 * DEG_TO_RAD,
        dec=0.30 * DEG_TO_RAD,
        dbh=4118.0 * DEG_TO_RAD,
        gre=0.0015,
        bre=60.0,
        dre=0.08 * DEG_TO_RAD,
    ),
    ModelFamily.EMM: GeomagneticUncertaintySpec(
        mgi=0.01,
        mbi=107.0,
        mdi=0.16 * DEG_TO_RAD,
        dec=0.30 * DEG_TO_RAD,
        dbh=4118.0 * DEG_TO_RAD,
        gre=0.0015,
        bre=60.0,
        dre=0.08 * DEG_TO_RAD,
    ),
    ModelFamily.IFR1: GeomagneticUncertaintySpec(
        mgi=0.01,
        mbi=50.0,
        mdi=0.10 * DEG_TO_RAD,
        dec=0.15 * DEG_TO_RAD,
        dbh=1500.0 * DEG_TO_RAD,
        gre=0.0015,
        bre=60.0,
        dre=0.08 * DEG_TO_RAD,
    ),
    ModelFamily.IFR2: GeomagneticUncertaintySpec(
        mgi=0.01,
        mbi=45.0,
        mdi=0.08 * DEG_TO_RAD,
        dec=0.15 * DEG_TO_RAD,
        dbh=1250.0 * DEG_TO_RAD,
        gre=0.0015,
        bre=15.0,
        dre=0.02 * DEG_TO_RAD,
    ),
}