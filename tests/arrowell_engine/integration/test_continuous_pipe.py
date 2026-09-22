"""Integration tests for Continuous Inclination fusion, drift balance, and thinning pipeline."""

import math

import numpy as np

from arrowell_engine.trajectory.continuous import (
    ContinuousSurveyPoint,
    build_high_definition_trajectory,
)


def test_continuous_fusion_pipeline():
    """Verify full pipeline: filtering outliers, matching anchors, and keeping TVD error <= 5cm."""
    static_md = np.array([1000.0, 1030.0, 1060.0], dtype=np.float64)
    static_inc = np.array([85.0, 90.0, 90.0], dtype=np.float64)
    static_az = np.array([45.0, 48.0, 48.0], dtype=np.float64)

    raw_ci = [
        ContinuousSurveyPoint(1002.0, 86.8),
        ContinuousSurveyPoint(1004.0, 88.5),
        ContinuousSurveyPoint(1004.0, 88.5),  # Duplicate
        ContinuousSurveyPoint(1006.0, 89.6),
        ContinuousSurveyPoint(1008.0, 90.1),
        ContinuousSurveyPoint(1010.0, 135.0), # Impossible spike >18 deg/30m
        ContinuousSurveyPoint(1015.0, 90.0),
        ContinuousSurveyPoint(1022.0, 90.1),
    ]

    tvd_tol_m = 0.05
    res = build_high_definition_trajectory(
        static_md=static_md,
        static_inc_deg=static_inc,
        static_azim_deg=static_az,
        continuous_records=raw_ci,
        tvd_tolerance_m=tvd_tol_m,
    )

    assert res.valid_ci_count < res.raw_ci_count
    assert np.all(res.inc_deg <= 91.0), "Spike was not filtered out"
    assert math.isclose(float(res.inc_deg[0]), 85.0, abs_tol=1e-3)
    assert math.isclose(float(res.inc_deg[-1]), 90.0, abs_tol=1e-3)
    assert res.tvd_max_error_m <= tvd_tol_m