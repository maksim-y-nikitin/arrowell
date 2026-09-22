"""Unit tests for Minimum Curvature Method (MCM) core trajectory calculations."""

import numpy as np

from arrowell_engine.trajectory.mcm import calculate_mcm_trajectory, TrajectoryResult


def test_mcm_empty_arrays():
    """Verify engine handles empty inputs gracefully without exceptions."""
    res = calculate_mcm_trajectory(np.array([]), np.array([]), np.array([]))
    assert isinstance(res, TrajectoryResult)
    assert len(res.tvd) == 0


def test_mcm_synthetic_deviated_curve():
    """Suite 3: Validate basic 3D curved trajectory integration."""
    md = np.array([0.0, 500.0, 1000.0, 1500.0], dtype=np.float64)
    inc = np.array([0.0, 15.0, 45.0, 85.0], dtype=np.float64)
    azim = np.array([45.0, 45.0, 60.0, 75.0], dtype=np.float64)

    traj = calculate_mcm_trajectory(md, inc, azim, proposal_azimuth_deg=45.0)

    assert traj.tvd[-1] < 1500.0, "TVD must be less than MD in curved well"
    assert traj.northing[-1] > 0.0 and traj.easting[-1] > 0.0
    assert np.all(traj.dls >= 0.0), "Dogleg severity must be non-negative"
    assert traj.closure_dist[-1] > 0.0


def test_mcm_vertical_well_properties():
    """Verify that vertical well maintains TVD=MD and zero horizontal displacement."""
    md = np.array([0.0, 100.0, 500.0])
    inc = np.array([0.0, 0.0, 0.0])
    azim = np.array([0.0, 0.0, 0.0])

    traj = calculate_mcm_trajectory(md, inc, azim)

    np.testing.assert_allclose(traj.tvd, md, atol=1e-5)
    np.testing.assert_allclose(traj.northing, 0.0, atol=1e-5)
    np.testing.assert_allclose(traj.easting, 0.0, atol=1e-5)
    np.testing.assert_allclose(traj.dls, 0.0, atol=1e-5)


def test_mcm_azimuth_boundary_crossing():
    """Verify short-arc interpolation across 360°/0° azimuth boundary."""
    md = np.array([1000.0, 1030.0])
    inc = np.array([30.0, 30.0])
    azim = np.array([355.0, 5.0])  # 10 deg true turn

    traj = calculate_mcm_trajectory(md, inc, azim)

    # 10 deg turn at 30 deg inc over 30m produces ~5 deg/30m DLS, not >150 deg/30m
    assert 3.0 < traj.dls[1] < 10.0