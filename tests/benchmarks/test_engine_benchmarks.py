"""High-Performance Benchmarking Suite for arrowell_engine."""

import math
from datetime import date
from pathlib import Path

import numpy as np
import pytest

from arrowell_engine.geomag.calculator import GeomagneticModelEngine
from arrowell_engine.msa.engine import run_msa_optimization
from arrowell_engine.sag.beam import (
    BhaComponent,
    StabilizerBlade,
    ComponentMaterial,
    calculate_bha_sag,
)
from arrowell_engine.trajectory.continuous import (
    ContinuousSurveyPoint,
    build_high_definition_trajectory,
)
from arrowell_engine.trajectory.mcm import calculate_mcm_trajectory
from arrowell_engine.trajectory.uncertainty import calculate_trajectory_uncertainty


@pytest.mark.benchmark(group="trajectory-mcm")
@pytest.mark.parametrize("station_count", [100, 1000, 10000])
def test_bench_mcm_trajectory(benchmark, station_count):
    """Benchmark vectorized MCM across 100, 1,000 and 10,000 stations."""
    md = np.linspace(0.0, 10000.0, station_count, dtype=np.float64)
    inc = np.linspace(0.0, 92.0, station_count, dtype=np.float64)
    azim = np.linspace(45.0, 65.0, station_count, dtype=np.float64)

    res = benchmark(calculate_mcm_trajectory, md, inc, azim, proposal_azimuth_deg=45.0)

    assert len(res.tvd) == station_count
    assert res.tvd[-1] > 0.0


@pytest.mark.benchmark(group="continuous-fusion")
def test_bench_continuous_fusion_and_thinning(benchmark):
    """Benchmark fusion & TVD-bounded thinning on 2,000 streaming data points."""
    static_md = np.linspace(1000.0, 3000.0, 21)
    static_inc = np.linspace(15.0, 90.0, 21)
    static_az = np.linspace(45.0, 55.0, 21)

    ci_records = [
        ContinuousSurveyPoint(
            float(m),
            float(15.0 + (m - 1000.0) * 0.0375 + math.sin(m / 50.0) * 0.5)
        )
        for m in np.linspace(1001.0, 2999.0, 2000)
    ]

    res = benchmark(
        build_high_definition_trajectory,
        static_md=static_md,
        static_inc_deg=static_inc,
        static_azim_deg=static_az,
        continuous_records=ci_records,
        tvd_tolerance_m=0.05,
    )

    assert res.compression_ratio > 40.0
    assert res.tvd_max_error_m <= 0.06


@pytest.mark.benchmark(group="bha-sag")
def test_bench_bha_sag_solver(benchmark):
    """Benchmark single-station analytical beam deflection calculation."""
    components = [
        BhaComponent(od_m=0.2159, id_m=0.05, length_m=0.5, material=ComponentMaterial.STEEL),
        BhaComponent(od_m=0.17145, id_m=0.0714, length_m=10.0, material=ComponentMaterial.NM_STEEL),
        BhaComponent(od_m=0.17145, id_m=0.0714, length_m=30.0, material=ComponentMaterial.STEEL),
    ]
    stabilizers = [
        StabilizerBlade(blade_od_m=0.2159, dist_from_bit_m=1.8, length_m=0.25),
        StabilizerBlade(blade_od_m=0.2120, dist_from_bit_m=12.0, length_m=1.0),
    ]

    res = benchmark(
        calculate_bha_sag,
        components=components,
        stabilizers=stabilizers,
        sensor_dist_from_bit_m=10.0,
        hole_diameter_m=0.2159,
        inclination_deg=85.0,
        dls_deg_30m=3.0,
        mud_density_kg_m3=1250.0,
        iscwsa_model_name="ISCWSA_MWD_SAG_REV4",
    )

    assert res.is_converged is True


@pytest.mark.benchmark(group="iscwsa-uncertainty")
def test_bench_iscwsa_eou_propagation(benchmark):
    """Benchmark full 3D EOU covariance synthesis on 500 survey stations."""
    station_count = 500
    md = np.linspace(0.0, 5000.0, station_count)
    inc = np.linspace(0.0, 85.0, station_count)
    azim = np.linspace(45.0, 75.0, station_count)
    tvd = md * np.cos(np.radians(inc / 2.0))

    res = benchmark(
        calculate_trajectory_uncertainty,
        md=md,
        inc_deg=inc,
        azim_deg=azim,
        tvd=tvd,
        model_name="ISCWSA_MWD_REV4",
        expansion_k=2.0,
    )

    assert len(res) == station_count


@pytest.mark.benchmark(group="geomag-wmm")
def test_bench_wmm_batch_evaluation(benchmark):
    """Benchmark vectorized WMM2025 batch evaluation across 500 3D spatial points."""
    models_dir = Path(__file__).resolve().parents[2] / "arrowell_engine" / "geomag" / "assets" / "models"
    wmm_path = models_dir / "wmm2025.npz"

    if not wmm_path.exists():
        pytest.skip("wmm2025.npz binary not found")

    engine = GeomagneticModelEngine(wmm_path)
    count = 500
    lats = np.linspace(55.0, 65.0, count)
    lons = np.linspace(70.0, 80.0, count)
    alts = np.linspace(0.0, 3000.0, count)
    test_date = date(2025, 6, 1)

    res = benchmark(engine.calculate_batch, lats, lons, alts, test_date)
    assert len(res.total_field_nt) == count\

@pytest.mark.benchmark(group="msa-optimization")
def test_bench_msa_global_optimization(benchmark):
    """Benchmark MSA Differential Evolution solver on a 6-station MWD run."""
    true_b_ref = 58000.0
    true_dip_ref = 77.0
    synthetic_mbz = 650.0  # +650 nT помеха от бурильной колонны

    # 6 точек с полным охватом toolface
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
        inc, azim, tf, dip = map(math.radians, (inc_val, az_val, tf_val, true_dip_ref))
        sini, cosi = math.sin(inc), math.cos(inc)
        sina, cosa = math.sin(azim), math.cos(azim)
        sintf, costf = math.sin(tf), math.cos(tf)
        sind, cosd = math.sin(dip), math.cos(dip)

        gx = -1.0 * sini * sintf
        gy = -1.0 * sini * costf
        gz = 1.0 * cosi

        b_h, b_v = true_b_ref * cosd, true_b_ref * sind
        bx = b_h * (cosi * cosa * sintf + sina * costf) - b_v * sini * sintf
        by = b_h * (cosi * cosa * costf - sina * sintf) - b_v * sini * costf
        bz = b_h * sini * cosa + b_v * cosi

        raw_surveys.append([gx, gy, gz, bx, by, bz + synthetic_mbz])

    raw_dni = np.array(raw_surveys, dtype=np.float64)

    res = benchmark(
        run_msa_optimization,
        raw_dni=raw_dni,
        g_ref=1.0,
        b_ref=true_b_ref,
        dip_ref_deg=true_dip_ref,
        enable_misalignment=False,
        enable_ref_corrections=False,
        max_iter=60,
        popsize=10,
    )

    assert res.success is True
    assert abs(res.params.mbz - synthetic_mbz) < 50.0