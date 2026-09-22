"""Comprehensive validation and cross-check suite for arrowell_engine.

Test Suite:
  1. Geomagnetic field calculation (WMM2025, IGRF-14, batch vectorization vs scalar).
  2. MWD sensor transformations and vertical wellbore singularity protection (Inc < 0.1 deg).
  3. 3D Minimum Curvature Method (MCM) wellbore trajectory engine.
  4. High-Definition Continuous Inclination Fusion (telemetry filtering, offset balancing, TVD thinning).
  5. BHA Sag deflection (contact barriers, short stabilizer blade discretization, ISCWSA QC).
  6. ISCWSA 3D Position Uncertainty (EOU) and Anti-Collision Separation Factor (SF).
  7. Multi-Station Analysis (MSA) recovery of synthetic drillstring magnetic interference.
  8. End-to-end execution of directional service wrappers and schemas.
"""

import math
import sys
from datetime import date
from pathlib import Path

import numpy as np

# Configure system paths for both ArroWell root and backend/src
test_dir = Path(__file__).resolve().parent
backend_dir = test_dir.parent
src_dir = backend_dir / "src"
project_root = backend_dir.parent

for p in (src_dir, project_root):
    if str(p) not in sys.path:
        sys.path.insert(0, str(p))

from arrowell_engine.geomag.calculator import GeomagneticModelEngine
from arrowell_engine.msa.engine import run_msa_optimization
from arrowell_engine.sag.beam import (
    BhaComponent,
    ComponentMaterial,
    StabilizerBlade,
    calculate_bha_sag,
)
from arrowell_engine.sensors.transforms import compute_survey_metrics
from arrowell_engine.trajectory.continuous import (
    ContinuousSurveyPoint,
    build_high_definition_trajectory,
)
from arrowell_engine.trajectory.mcm import calculate_mcm_trajectory
from arrowell_engine.trajectory.uncertainty import (
    calculate_separation_factor,
    calculate_trajectory_uncertainty,
)
from schemas.survey import (
    BhaConfigSchema,
    SurveyStationBase,
)
from services.directional import (
    calculate_trajectory_mwdcore,
    calculate_well_sag_mwdcore,
)


def forward_mwd_sensors(
    inc_deg: float,
    azim_deg: float,
    gtf_deg: float,
    b_total: float = 58000.0,
    dip_deg: float = 77.0,
    g_total: float = 1.0,
) -> tuple[float, float, float, float, float, float]:
    """Physically exact 3D projection of gravity and magnetic field vectors onto MWD tool axes."""
    inc = math.radians(inc_deg)
    azim = math.radians(azim_deg)
    tf = math.radians(gtf_deg)
    dip = math.radians(dip_deg)

    sini, cosi = math.sin(inc), math.cos(inc)
    sina, cosa = math.sin(azim), math.cos(azim)
    sintf, costf = math.sin(tf), math.cos(tf)
    sind, cosd = math.sin(dip), math.cos(dip)

    gx = -g_total * sini * sintf
    gy = -g_total * sini * costf
    gz = g_total * cosi

    b_h = b_total * cosd
    b_v = b_total * sind

    bx = b_h * (cosi * cosa * sintf + sina * costf) - b_v * sini * sintf
    by = b_h * (cosi * cosa * costf - sina * sintf) - b_v * sini * costf
    bz = b_h * sini * cosa + b_v * cosi

    return gx, gy, gz, bx, by, bz


def test_geomagnetic_models():
    """Verify compiled WMM2025 and IGRF-14 binaries and batch vectorization."""
    print("[1/8] Testing Geomagnetic Engine (.npz binaries & batch vectorization)...")
    models_dir = project_root / "arrowell_engine" / "geomag" / "assets" / "models"
    wmm_file = models_dir / "wmm2025.npz"
    igrf_file = models_dir / "igrf14.npz"

    assert wmm_file.exists(), f"WMM2025 binary not found: {wmm_file}"
    assert igrf_file.exists(), f"IGRF-14 binary not found: {igrf_file}"

    wmm_engine = GeomagneticModelEngine(wmm_file)
    igrf_engine = GeomagneticModelEngine(igrf_file)

    test_date = date(2025, 6, 1)
    wmm_res = wmm_engine.calculate(61.25, 73.40, 100.0, test_date)
    igrf_res = igrf_engine.calculate(61.25, 73.40, 100.0, test_date)

    print(f"    WMM2025 Scalar: B_total = {wmm_res.total_field_nt:.1f} nT, Dip = {wmm_res.dip_deg:.2f} deg, Dec = {wmm_res.declination_deg:.2f} deg")
    print(f"    IGRF-14 Scalar: B_total = {igrf_res.total_field_nt:.1f} nT, Dip = {igrf_res.dip_deg:.2f} deg, Dec = {igrf_res.declination_deg:.2f} deg")

    assert 56000.0 <= wmm_res.total_field_nt <= 60000.0, "Total field out of expected range"
    assert 75.0 <= wmm_res.dip_deg <= 82.0, "Dip angle out of expected range"
    assert abs(wmm_res.total_field_nt - igrf_res.total_field_nt) < 150.0, "WMM and IGRF divergence exceeds threshold"

    # Batch vectorization consistency check
    batch_lats = np.array([60.0, 61.25, 62.5], dtype=np.float64)
    batch_lons = np.array([70.0, 73.40, 76.0], dtype=np.float64)
    batch_alts = np.array([0.0, 100.0, 200.0], dtype=np.float64)

    batch_res = wmm_engine.calculate_batch(batch_lats, batch_lons, batch_alts, test_date)
    assert len(batch_res.total_field_nt) == 3, "Batch calculation count mismatch"
    assert math.isclose(batch_res.total_field_nt[1], wmm_res.total_field_nt, abs_tol=1e-5), "Batch vs scalar field mismatch"
    assert math.isclose(batch_res.declination_deg[1], wmm_res.declination_deg, abs_tol=1e-5), "Batch vs scalar declination mismatch"
    assert np.all((batch_res.declination_deg >= -180.0) & (batch_res.declination_deg <= 180.0)), "Declination wrap-around out of bounds"

    print("    -> PASS: Geomagnetic scalar and vectorized batch models verified.\n")


def test_sensor_transforms_and_vertical():
    """Verify sensor metric extraction and vertical singularity protection."""
    print("[2/8] Testing Sensor Transforms & Vertical Singularity Protection...")

    # Case A: Deviated station
    gx, gy, gz, bx, by, bz = forward_mwd_sensors(
        inc_deg=45.0,
        azim_deg=60.0,
        gtf_deg=35.0,
        b_total=58000.0,
        dip_deg=75.0,
        g_total=1.0,
    )
    metrics_dev = compute_survey_metrics(gx, gy, gz, bx, by, bz)

    assert math.isclose(float(metrics_dev.inc_deg[0]), 45.0, abs_tol=0.01), "Deviated Inc mismatch"
    assert math.isclose(float(metrics_dev.azim_mag_deg[0]), 60.0, abs_tol=0.01), "Deviated Azim mismatch"
    assert math.isclose(float(metrics_dev.gtf_deg[0]), 35.0, abs_tol=0.01), "Deviated GTF mismatch"
    assert bool(metrics_dev.is_vertical[0]) is False, "Deviated station misidentified as vertical"
    assert bool(metrics_dev.is_azimuth_valid[0]) is True, "Deviated station azimuth flagged invalid"
    assert bool(metrics_dev.is_gtf_valid[0]) is True, "Deviated station GTF flagged invalid"

    # Case B: Vertical station (Inc = 0.04 deg < 0.1 deg threshold)
    gx_v, gy_v, gz_v, bx_v, by_v, bz_v = forward_mwd_sensors(
        inc_deg=0.04,
        azim_deg=195.0,
        gtf_deg=0.0,
        b_total=58000.0,
        dip_deg=75.0,
        g_total=1.0,
    )
    metrics_vert = compute_survey_metrics(
        gx_v, gy_v, gz_v, bx_v, by_v, bz_v,
        vertical_inc_threshold_deg=0.1,
        vertical_azimuth_lock=0.0,
    )

    assert bool(metrics_vert.is_vertical[0]) is True, "Vertical station not detected"
    assert bool(metrics_vert.is_azimuth_valid[0]) is False, "Vertical azimuth must be flagged invalid"
    assert float(metrics_vert.azim_mag_deg[0]) == 0.0, "Vertical azimuth was not locked to reference"
    assert bool(metrics_vert.is_gtf_valid[0]) is False, "GTF below 2 deg must be flagged unstable"

    print("    -> PASS: Sensor metrics and vertical regularization verified.\n")


def test_mcm_trajectory():
    """Verify Minimum Curvature Method calculations against synthetic curve."""
    print("[3/8] Testing Minimum Curvature Method (MCM)...")
    md = np.array([0.0, 500.0, 1000.0, 1500.0], dtype=np.float64)
    inc = np.array([0.0, 15.0, 45.0, 85.0], dtype=np.float64)
    azim = np.array([45.0, 45.0, 60.0, 75.0], dtype=np.float64)

    traj = calculate_mcm_trajectory(md, inc, azim, proposal_azimuth_deg=45.0)

    print(f"    Total TVD: {traj.tvd[-1]:.2f} m (Expected < 1500 m)")
    print(f"    Max DLS:   {np.max(traj.dls):.2f} deg/30m")
    print(f"    Closure:   {traj.closure_dist[-1]:.2f} m at {traj.closure_azim[-1]:.2f} deg")

    assert traj.tvd[-1] < 1500.0, "TVD must be less than MD in curved well"
    assert traj.northing[-1] > 0.0 and traj.easting[-1] > 0.0, "Coordinates must be in NE quadrant"
    assert np.all(traj.dls >= 0.0), "DLS cannot be negative"
    print("    -> PASS: MCM trajectory calculations validated.\n")


def test_continuous_inc_fusion():
    """Verify Continuous Inclination fusion, dynamic offset balancing, and TVD thinning."""
    print("[4/8] Testing Continuous Inclination Fusion & Mesh Optimization...")
    static_md = np.array([1000.0, 1030.0, 1060.0], dtype=np.float64)
    static_inc = np.array([85.0, 90.0, 90.0], dtype=np.float64)
    static_az = np.array([45.0, 48.0, 48.0], dtype=np.float64)

    # Simulated steering telemetry with duplicate depths and physical outlier spike
    raw_ci = [
        ContinuousSurveyPoint(1002.0, 86.8),
        ContinuousSurveyPoint(1004.0, 88.5),
        ContinuousSurveyPoint(1004.0, 88.5),  # Redundant duplicate
        ContinuousSurveyPoint(1006.0, 89.6),
        ContinuousSurveyPoint(1008.0, 90.1),
        ContinuousSurveyPoint(1010.0, 135.0), # Extreme telemetry spike (> 18 deg/30m)
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

    print(f"    Raw CI count:        {res.raw_ci_count}")
    print(f"    Filtered CI count:   {res.valid_ci_count} (Glitches rejected)")
    print(f"    Optimized stations:  {res.optimized_station_count}")
    print(f"    Max TVD deviation:   {res.tvd_max_error_m * 100.0:.2f} cm (Bound <= {tvd_tol_m * 100.0:.1f} cm)")

    assert res.valid_ci_count < res.raw_ci_count, "Glitches and duplicates were not filtered"
    assert np.all(res.inc_deg <= 91.0), "Extreme spike was not removed from inclination profile"
    assert math.isclose(float(res.inc_deg[0]), 85.0, abs_tol=1e-3), "Tie-in Inc mismatch"
    assert math.isclose(float(res.inc_deg[-1]), 90.0, abs_tol=1e-3), "End anchor Inc mismatch"
    assert res.tvd_max_error_m <= tvd_tol_m, "TVD error bound exceeded"

    print("    -> PASS: Continuous inclination fusion and mesh compression validated.\n")


def test_bha_sag():
    """Verify BHA sag deflection physics, short blade grid handling, and ISCWSA QC."""
    print("[5/8] Testing BHA Sag Engine (Variational Solver & ISCWSA QC)...")
    components = [
        BhaComponent(od_m=0.2159, id_m=0.05, length_m=0.5, material=ComponentMaterial.STEEL),
        BhaComponent(od_m=0.17145, id_m=0.0714, length_m=10.0, material=ComponentMaterial.NM_STEEL),
        BhaComponent(od_m=0.17145, id_m=0.0714, length_m=30.0, material=ComponentMaterial.STEEL),
    ]
    # Includes a short stabilizer blade (length_m <= dz) to verify grid non-vanishing fix
    stabilizers = [
        StabilizerBlade(blade_od_m=0.2159, dist_from_bit_m=1.8, length_m=0.25),
        StabilizerBlade(blade_od_m=0.2120, dist_from_bit_m=12.0, length_m=1.0),
    ]

    # Test 1: Vertical well (inc < 5 deg) -> Sag must be zero
    res_vert = calculate_bha_sag(
        components=components,
        stabilizers=stabilizers,
        sensor_dist_from_bit_m=10.0,
        hole_diameter_m=0.2159,
        inclination_deg=2.0,
    )
    assert res_vert.sag_correction_deg == 0.0, "Vertical sag must be zero"
    assert res_vert.iscwsa_qc_pass is True, "Vertical sag QC must pass"

    # Test 2: Deviated well
    res_deviated = calculate_bha_sag(
        components=components,
        stabilizers=stabilizers,
        sensor_dist_from_bit_m=10.0,
        hole_diameter_m=0.2159,
        inclination_deg=75.0,
        dls_deg_30m=2.0,
        mud_density_kg_m3=1250.0,
        iscwsa_model_name="ISCWSA_MWD_SAG_REV4",
    )
    print(f"    Sag at 75 deg Inc:   {res_deviated.sag_correction_deg:.3f} deg")
    print(f"    Corrected Inc:       {res_deviated.corrected_inc_deg:.2f} deg")
    print(f"    Sensor Deflection:   {res_deviated.sensor_deflection_mm:.2f} mm")
    print(f"    ISCWSA 1-sigma unc:  {res_deviated.residual_sag_unc_1sigma_deg:.3f} deg")
    print(f"    ISCWSA QC Pass:      {res_deviated.iscwsa_qc_pass}")

    assert res_deviated.is_converged, "Coordinate descent must converge"
    assert 0.05 <= abs(res_deviated.sag_correction_deg) <= 0.60, "Sag angle out of expected drilling range"
    assert res_deviated.residual_sag_unc_1sigma_deg == 0.08, "ISCWSA residual uncertainty mismatch"
    assert res_deviated.iscwsa_qc_pass is True, "Sag QC check failed"

    print("    -> PASS: BHA Sag mechanics, short blade grid handling, and ISCWSA QC verified.\n")


def test_iscwsa_uncertainty_and_separation_factor():
    """Verify ISCWSA error propagation, 3D EOU, and Anti-Collision Separation Factor."""
    print("[6/8] Testing ISCWSA 3D EOU & Anti-Collision Separation Factor (SF)...")
    md = np.array([0.0, 500.0, 1000.0, 1500.0], dtype=np.float64)
    inc = np.array([0.0, 15.0, 45.0, 60.0], dtype=np.float64)
    azim = np.array([0.0, 45.0, 50.0, 52.0], dtype=np.float64)

    traj = calculate_mcm_trajectory(md, inc, azim)

    # Compute 2-sigma 3D Ellipsoids of Uncertainty (EOU)
    eou_profile = calculate_trajectory_uncertainty(
        md=md,
        inc_deg=inc,
        azim_deg=azim,
        tvd=traj.tvd,
        b_total_nt=58000.0,
        dip_deg=75.0,
        declination_deg=10.0,
        model_name="ISCWSA_MWD_REV4",
        expansion_k=2.0,
    )

    assert len(eou_profile) == 4, "EOU station count mismatch"
    last_eou = eou_profile[-1]

    # Verify spectral properties: semi_major >= semi_intermediate >= semi_minor
    assert last_eou.semi_major_m >= last_eou.semi_intermediate_m >= last_eou.semi_minor_m > 0.0
    cov = last_eou.covariance_nev
    assert cov[0, 0] > 0.0 and cov[1, 1] > 0.0 and cov[2, 2] > 0.0, "Variances must be strictly positive"
    assert math.isclose(cov[0, 1], cov[1, 0], abs_tol=1e-6), "Covariance matrix must be symmetric"

    print(f"    TD Semi-Major (2-sigma): +/-{last_eou.semi_major_m:.2f} m")
    print(f"    TD TVD 1-sigma:          +/-{last_eou.vertical_1sigma_m:.2f} m")

    # Anti-Collision Clearance & Separation Factor (SF) check
    pos_subject = np.array([traj.northing[-1], traj.easting[-1], traj.tvd[-1]], dtype=np.float64)
    cov_subject = last_eou.covariance_nev

    # Case A: Wellbores at safe distance (30 meters center-to-center)
    pos_offset_safe = pos_subject + np.array([24.0, 18.0, 0.0], dtype=np.float64)
    cov_offset = cov_subject.copy()

    sf_safe = calculate_separation_factor(
        pos_subject_nev=pos_subject,
        cov_subject_nev=cov_subject,
        pos_offset_nev=pos_offset_safe,
        cov_offset_nev=cov_offset,
        well_radius_subject_m=0.108,
        well_radius_offset_m=0.108,
        expansion_k=2.0,
    )

    assert math.isclose(sf_safe.center_distance_m, 30.0, abs_tol=0.1), "Center distance mismatch"
    assert sf_safe.separation_factor > 1.0, "Safe scenario misclassified"
    assert sf_safe.is_violation is False, "False collision flag"

    # Case B: Close proximity violation (3 meters center-to-center)
    pos_offset_close = pos_subject + np.array([2.4, 1.8, 0.0], dtype=np.float64)
    sf_close = calculate_separation_factor(
        pos_subject_nev=pos_subject,
        cov_subject_nev=cov_subject,
        pos_offset_nev=pos_offset_close,
        cov_offset_nev=cov_offset,
        well_radius_subject_m=0.108,
        well_radius_offset_m=0.108,
        expansion_k=2.0,
    )

    assert sf_close.separation_factor < 1.0, "Proximity collision violation not triggered"
    assert sf_close.is_violation is True, "Violation flag not raised"

    print(f"    Safe Scenario SF:    {sf_safe.separation_factor:.2f} ({sf_safe.warning_level})")
    print(f"    Proximity Violation: {sf_close.separation_factor:.2f} ({sf_close.warning_level})")
    print("    -> PASS: ISCWSA error propagation and Separation Factor (SF) validated.\n")


def test_msa_optimization():
    """Verify MSA solver recovery of synthetic drillstring magnetic interference."""
    print("[7/8] Testing Multi-Station Analysis (MSA Recovery)...")
    true_b_ref = 58000.0
    true_dip_ref = 77.0
    synthetic_mbz = 650.0  # +650 nT axial interference on drillstring

    # Realistic build curve profile with full toolface coverage
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
            inc_deg=inc_val,
            azim_deg=az_val,
            gtf_deg=tf_val,
            b_total=true_b_ref,
            dip_deg=true_dip_ref,
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

    print(f"    Injected Axial Bias (MBZ): +{synthetic_mbz:.1f} nT")
    print(f"    Recovered MBZ by SciPy:    +{result.params.mbz:.1f} nT")
    print(f"    Toolface Coverage:          {result.toolface_coverage_deg:.1f} deg")
    print(f"    Optimization Cost:          {result.cost:.3f}")

    recovered_mbz = result.params.mbz
    error_mbz = abs(recovered_mbz - synthetic_mbz)
    assert error_mbz < 50.0, f"MSA recovery error too large: {error_mbz} nT"
    print("    -> PASS: MSA successfully decoupling axial magnetic interference.\n")


def test_directional_service_integration():
    """Verify directional.py entry points and Pydantic schema compatibility."""
    print("[8/8] Testing backend/src/services/directional.py Integration...")
    stations = [
        SurveyStationBase(md=1000.0, inc=15.0, azim=45.0),
        SurveyStationBase(md=1030.0, inc=18.0, azim=47.0),
        SurveyStationBase(md=1060.0, inc=21.0, azim=48.0),
        SurveyStationBase(md=1090.0, inc=25.0, azim=50.0),
    ]

    calc_res = calculate_trajectory_mwdcore(
        stations=stations,
        declination_deg=13.5,
        grid_convergence_deg=1.8,
        b_total_ref=58200.0,
        dip_ref_deg=78.2,
    )
    assert calc_res.station_count == 4
    assert calc_res.stations[0].dls == 0.0
    assert calc_res.stations[-1].tvd > 0.0

    bha_cfg = BhaConfigSchema(
        collar_od_mm=171.45,
        collar_id_mm=71.4,
        bha_material="nm_steel",
        sensor_to_bit_m=12.5,
        stabilizer_dist_m=9.0,
        mud_weight_gcm3=1.22,
    )
    sag_res = calculate_well_sag_mwdcore(
        stations=calc_res.stations,
        bha_config=bha_cfg,
    )
    assert sag_res.status == "success"
    assert len(sag_res.corrections) == 4
    assert sag_res.corrections[-1].valid is True

    print("    -> PASS: All directional.py services executed without typing or runtime errors.\n")


def main():
    print("=" * 70)
    print(" ArroWell Engine: Automated Verification & Cross-Check Suite")
    print("=" * 70 + "\n")

    test_geomagnetic_models()
    test_sensor_transforms_and_vertical()
    test_mcm_trajectory()
    test_continuous_inc_fusion()
    test_bha_sag()
    test_iscwsa_uncertainty_and_separation_factor()
    test_msa_optimization()
    test_directional_service_integration()

    print("=" * 70)
    print(" ALL 8 TEST SUITES PASSED: 100% Core Verification Successful.")
    print("=" * 70)


if __name__ == "__main__":
    main()