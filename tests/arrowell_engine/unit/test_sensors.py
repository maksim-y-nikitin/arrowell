"""Unit tests for MWD sensor vector transformations and vertical regularization."""

import math

from arrowell_engine.sensors.transforms import compute_survey_metrics


def forward_mwd_sensors(
    inc_deg: float,
    azim_deg: float,
    gtf_deg: float,
    b_total: float = 58000.0,
    dip_deg: float = 77.0,
    g_total: float = 1.0,
) -> tuple[float, float, float, float, float, float]:
    """Helper for 3D forward projection of gravity and magnetic field vectors."""
    inc, azim, tf, dip = map(math.radians, (inc_deg, azim_deg, gtf_deg, dip_deg))
    sini, cosi = math.sin(inc), math.cos(inc)
    sina, cosa = math.sin(azim), math.cos(azim)
    sintf, costf = math.sin(tf), math.cos(tf)
    sind, cosd = math.sin(dip), math.cos(dip)

    gx = -g_total * sini * sintf
    gy = -g_total * sini * costf
    gz = g_total * cosi

    b_h, b_v = b_total * cosd, b_total * sind
    bx = b_h * (cosi * cosa * sintf + sina * costf) - b_v * sini * sintf
    by = b_h * (cosi * cosa * costf - sina * sintf) - b_v * sini * costf
    bz = b_h * sini * cosa + b_v * cosi
    return gx, gy, gz, bx, by, bz


def test_deviated_sensor_metrics_recovery():
    """Verify exact angular recovery for deviated station."""
    gx, gy, gz, bx, by, bz = forward_mwd_sensors(45.0, 60.0, 35.0, 58000.0, 75.0, 1.0)
    m = compute_survey_metrics(gx, gy, gz, bx, by, bz)

    assert math.isclose(float(m.inc_deg[0]), 45.0, abs_tol=0.01)
    assert math.isclose(float(m.azim_mag_deg[0]), 60.0, abs_tol=0.01)
    assert math.isclose(float(m.gtf_deg[0]), 35.0, abs_tol=0.01)
    assert bool(m.is_vertical[0]) is False
    assert bool(m.is_azimuth_valid[0]) is True
    assert bool(m.is_gtf_valid[0]) is True


def test_vertical_wellbore_singularity_lock():
    """Verify that vertical stations (Inc < 0.1°) lock azimuth and flag GTF invalid."""
    gx, gy, gz, bx, by, bz = forward_mwd_sensors(0.04, 195.0, 0.0, 58000.0, 75.0, 1.0)
    m = compute_survey_metrics(
        gx, gy, gz, bx, by, bz,
        vertical_inc_threshold_deg=0.1,
        vertical_azimuth_lock=0.0,
    )

    assert bool(m.is_vertical[0]) is True
    assert bool(m.is_azimuth_valid[0]) is False
    assert float(m.azim_mag_deg[0]) == 0.0
    assert bool(m.is_gtf_valid[0]) is False