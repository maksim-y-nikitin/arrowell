"""Unit tests for ISCWSA 3D positional uncertainty and anti-collision separation factor."""

import math

import numpy as np

from arrowell_engine.trajectory.mcm import calculate_mcm_trajectory
from arrowell_engine.trajectory.uncertainty import (
    calculate_trajectory_uncertainty,
    calculate_separation_factor,
)


def test_eou_eigen_decomposition_properties():
    """Verify positive definiteness and principal axis ordering of EOU covariance matrices."""
    md = np.array([0.0, 500.0, 1000.0, 1500.0], dtype=np.float64)
    inc = np.array([0.0, 15.0, 45.0, 60.0], dtype=np.float64)
    azim = np.array([0.0, 45.0, 50.0, 52.0], dtype=np.float64)

    traj = calculate_mcm_trajectory(md, inc, azim)
    eou_list = calculate_trajectory_uncertainty(
        md=md, inc_deg=inc, azim_deg=azim, tvd=traj.tvd,
        b_total_nt=58000.0, dip_deg=75.0, declination_deg=10.0,
        model_name="ISCWSA_MWD_REV4", expansion_k=2.0,
    )

    assert len(eou_list) == 4
    last = eou_list[-1]

    # Verify spectral properties: a >= b >= c > 0
    assert last.semi_major_m >= last.semi_intermediate_m >= last.semi_minor_m > 0.0

    cov = last.covariance_nev
    assert cov[0, 0] > 0 and cov[1, 1] > 0 and cov[2, 2] > 0
    np.testing.assert_allclose(cov, cov.T, atol=1e-6)


def test_separation_factor_scenarios():
    """Verify Separation Factor (SF) calculation for safe distance vs close collision risk."""
    pos_subject = np.array([100.0, 200.0, 1500.0])
    cov_subject = np.eye(3) * 4.0

    # Safe scenario: 30m away
    pos_safe = pos_subject + np.array([24.0, 18.0, 0.0])
    sf_safe = calculate_separation_factor(pos_subject, cov_subject, pos_safe, cov_subject)

    assert math.isclose(sf_safe.center_distance_m, 30.0, abs_tol=0.1)
    assert sf_safe.separation_factor > 1.0
    assert sf_safe.is_violation is False

    # Violation scenario: 3m away
    pos_close = pos_subject + np.array([2.4, 1.8, 0.0])
    sf_close = calculate_separation_factor(pos_subject, cov_subject, pos_close, cov_subject)

    assert sf_close.separation_factor < 1.0
    assert sf_close.is_violation is True
    assert "CRITICAL" in sf_close.warning_level