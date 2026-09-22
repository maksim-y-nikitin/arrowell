"""Minimum Curvature Method (MCM) trajectory engine.

Implements the standard wellbore positioning equations published by
Sawaryn & Thorogood (SPE 84246) and the ISCWSA committee.
Compatible with NumPy 2.x.
"""

from dataclasses import dataclass

import numpy as np


@dataclass(slots=True, frozen=True)
class TrajectoryResult:
    northing: np.ndarray
    easting: np.ndarray
    tvd: np.ndarray
    dls: np.ndarray          # deg / 30m
    closure_dist: np.ndarray
    closure_azim: np.ndarray # deg
    vertical_section: np.ndarray


def calculate_mcm_trajectory(
    md: np.ndarray,
    inc_deg: np.ndarray,
    azim_deg: np.ndarray,
    proposal_azimuth_deg: float = 0.0,
    tie_in: tuple[float, float, float] = (0.0, 0.0, 0.0),
) -> TrajectoryResult:
    """Calculate 3D wellbore trajectory coordinates using the Minimum Curvature Method.

    Args:
        md: Measured depth array (meters or feet).
        inc_deg: Wellbore inclination array in degrees.
        azim_deg: Wellbore azimuth array in degrees (grid or true north).
        proposal_azimuth_deg: Reference vertical section direction in degrees.
        tie_in: Initial coordinate tuple (Northing, Easting, TVD).

    Returns:
        TrajectoryResult containing calculated spatial profiles.
    """
    station_count = len(md)
    if station_count == 0:
        empty = np.zeros(0, dtype=np.float64)
        return TrajectoryResult(empty, empty, empty, empty, empty, empty, empty)

    # Convert angular inputs to radians
    inc_rad = np.radians(inc_deg)
    azim_rad = np.radians(azim_deg)

    i1 = inc_rad[:-1]
    i2 = inc_rad[1:]
    a1 = azim_rad[:-1]
    a2 = azim_rad[1:]
    delta_md = md[1:] - md[:-1]

    # Subtended dogleg angle calculation
    cos_dl = np.cos(i2 - i1) - np.sin(i1) * np.sin(i2) * (1.0 - np.cos(a2 - a1))
    cos_dl = np.clip(cos_dl, -1.0, 1.0)
    dl = np.arccos(cos_dl)

    # Ratio Factor (RF): handle straight intervals (dl -> 0) safely
    rf = np.ones_like(dl, dtype=np.float64)
    curved = dl > 1e-6
    rf[curved] = (2.0 / dl[curved]) * np.tan(dl[curved] / 2.0)

    # Delta coordinate components
    half_delta_md_rf = 0.5 * delta_md * rf
    d_north = half_delta_md_rf * (np.sin(i1) * np.cos(a1) + np.sin(i2) * np.cos(a2))
    d_east = half_delta_md_rf * (np.sin(i1) * np.sin(a1) + np.sin(i2) * np.sin(a2))
    d_tvd = half_delta_md_rf * (np.cos(i1) + np.cos(i2))

    north = np.empty(station_count, dtype=np.float64)
    east = np.empty(station_count, dtype=np.float64)
    tvd = np.empty(station_count, dtype=np.float64)

    north[0], east[0], tvd[0] = tie_in
    north[1:] = tie_in[0] + np.cumsum(d_north)
    east[1:] = tie_in[1] + np.cumsum(d_east)
    tvd[1:] = tie_in[2] + np.cumsum(d_tvd)

    # Dogleg Severity (deg / 30m)
    dls = np.zeros(station_count, dtype=np.float64)
    valid_dmd = delta_md > 0.0
    dls[1:][valid_dmd] = (np.degrees(dl[valid_dmd]) * 30.0) / delta_md[valid_dmd]

    # Closure parameters
    closure_dist = np.hypot(north, east)
    closure_azim = np.degrees(np.arctan2(east, north)) % 360.0

    # Vertical Section along proposal line
    vs_rad = np.radians(closure_azim - proposal_azimuth_deg)
    vertical_section = closure_dist * np.cos(vs_rad)

    return TrajectoryResult(
        northing=north,
        easting=east,
        tvd=tvd,
        dls=dls,
        closure_dist=closure_dist,
        closure_azim=closure_azim,
        vertical_section=vertical_section,
    )