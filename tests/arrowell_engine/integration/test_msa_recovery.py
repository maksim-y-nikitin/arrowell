"""Integration test for Multi-Station Analysis (MSA) parameter estimation via SciPy."""

import math

import numpy as np

from arrowell_engine.msa.engine import run_msa_optimization


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


def test_msa_recovery_of_synthetic_interference():
    """Verify that Differential Evolution decouples synthetic +650 nT drillstring bias."""
    true_b_ref = 58000.0
    true_dip_ref = 77.0
    synthetic_mbz = 650.0

    stations_profile = [
        (35.0, 45.0, 15.0),
        (45.0, 48.0, 80.0),
        (55.0, 50.0, 145.0),
        (65.0, 52.0, 215.0),
        (75.0, 55.0, 280.0),
        (82.0, 58.0, 340.0),
    ]

    raw_surveys = []
    for inc_val, az_val, tf_val in stations_profile:
        gx, gy, gz, bx, by, bz = forward_mwd_sensors(
            inc_deg=inc_val, azim_deg=az_val, gtf_deg=tf_val,
            b_total=true_b_ref, dip_deg=true_dip_ref,
        )
        raw_surveys.append([gx, gy, gz, bx, by, bz + synthetic_mbz])

    raw_dni = np.array(raw_surveys, dtype=np.float64)

    result = run_msa_optimization(
        raw_dni=raw_dni,
        g_ref=1.0,
        b_ref=true_b_ref,
        dip_ref_deg=true_dip_ref,
        enable_misalignment=False,
        enable_ref_corrections=False,
        max_iter=150,
    )

    error_mbz = abs(result.params.mbz - synthetic_mbz)
    assert error_mbz < 50.0, f"MSA recovery deviation too large: {error_mbz} nT"