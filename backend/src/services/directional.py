"""Directional survey trajectory and MWD analytics service.

High-performance, clean-room implementation powered by arrowell_engine.
Fully typed and compatible with PyCharm type checkers, NumPy 2.x, and Pydantic v2.
"""

import math
from typing import Any, Dict, List, Tuple

import numpy as np

from arrowell_engine.geomag.specs import ModelFamily
from arrowell_engine.msa.engine import run_msa_optimization
from arrowell_engine.msa.qc import (
    compute_qc_thresholds,
    evaluate_survey_station_qc,
)
from arrowell_engine.sag.beam import (
    BhaComponent,
    ComponentMaterial,
    StabilizerBlade,
    calculate_bha_sag,
)
from arrowell_engine.sensors.transforms import compute_survey_metrics
from arrowell_engine.trajectory.mcm import calculate_mcm_trajectory
from arrowell_engine.trajectory.uncertainty import (
    calculate_separation_factor,
    calculate_trajectory_uncertainty,
    EllipsoidOfUncertainty,
    SeparationFactorResult,
)
from schemas.survey import (
    AntiCollisionPointOutput,
    AntiCollisionScanResponse,
    BhaConfigSchema,
    OffsetStationInput,
    RawStationSensorSchema,
    SagCalculationResponse,
    SagStationCorrection,
    SurveyStationBase,
    SurveyStationResponse,
    TrajectoryCalculationResponse,
)


def _synthesize_forward_sensors(
    inc_deg: float,
    azim_deg: float,
    gtf_deg: float = 0.0,
    b_total_nt: float = 52480.0,
    dip_deg: float = 72.15,
    g_total: float = 1.0000,
) -> Tuple[float, float, float, float, float, float]:
    """Generate physically consistent 3D sensor projections if telemetry is missing."""
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

    b_h = b_total_nt * cosd
    b_v = b_total_nt * sind

    bx = b_h * (cosi * cosa * sintf + sina * costf) - b_v * sini * sintf
    by = b_h * (cosi * cosa * costf - sina * sintf) - b_v * sini * costf
    bz = b_h * sini * cosa + b_v * cosi

    return gx, gy, gz, bx, by, bz


def calculate_trajectory_mwdcore(
    stations: List[SurveyStationBase],
    proposal_azimuth: float = 45.0,
    declination_deg: float = 12.42,
    grid_convergence_deg: float = 1.25,
    b_total_ref: float = 52480.0,
    dip_ref_deg: float = 72.15,
    g_total_ref: float = 1.0000,
    well_id: str = "well-active",
    model_name: str = "WMM",
) -> TrajectoryCalculationResponse:
    """Calculate 3D wellbore trajectory and QA/QC flags using vectorized MCM.

    Args:
        stations: Input survey stations.
        proposal_azimuth: Direction of vertical section proposal plane (deg).
        declination_deg: Magnetic declination angle (deg).
        grid_convergence_deg: Meridian grid convergence angle (deg).
        b_total_ref: Geomagnetic total field reference in nT.
        dip_ref_deg: Geomagnetic dip angle reference in degrees.
        g_total_ref: Normal gravity reference value in g (default 1.0000).
        well_id: Well identifier key.
        model_name: Geomagnetic model family key.

    Returns:
        TrajectoryCalculationResponse with calculated stations and QC labels.
    """
    if not stations:
        return TrajectoryCalculationResponse(
            station_count=0, total_md=0.0, total_tvd=0.0, max_dls=0.0, stations=[]
        )

    # Sort strictly by measured depth
    sorted_stns = sorted(stations, key=lambda s: s.md)
    mds = np.array([s.md for s in sorted_stns], dtype=np.float64)
    incs = np.array([s.inc for s in sorted_stns], dtype=np.float64)
    azims = np.array([s.azim for s in sorted_stns], dtype=np.float64)

    # 1. Vectorized Minimum Curvature calculation
    traj = calculate_mcm_trajectory(
        md=mds,
        inc_deg=incs,
        azim_deg=azims,
        proposal_azimuth_deg=proposal_azimuth,
        tie_in=(0.0, 0.0, 0.0),
    )

    # 2. Extract or synthesize physically consistent sensor arrays
    has_real_sensors = []
    sensor_rows = []

    for s in sorted_stns:
        s_obj = getattr(s, "sensor", None)
        if s_obj is not None and hasattr(s_obj, "gx"):
            sensor_rows.append([s_obj.gx, s_obj.gy, s_obj.gz, s_obj.bx, s_obj.by, s_obj.bz])
            has_real_sensors.append(True)
        else:
            # Synthesize forward projection matching the station's actual Inc/Azim
            synth = _synthesize_forward_sensors(
                inc_deg=s.inc,
                azim_deg=s.azim,
                b_total_nt=b_total_ref,
                dip_deg=dip_ref_deg,
                g_total=g_total_ref,
            )
            sensor_rows.append(list(synth))
            has_real_sensors.append(False)

    sensor_matrix = np.array(sensor_rows, dtype=np.float64)
    gx, gy, gz = sensor_matrix[:, 0], sensor_matrix[:, 1], sensor_matrix[:, 2]
    bx, by, bz = sensor_matrix[:, 3], sensor_matrix[:, 4], sensor_matrix[:, 5]

    metrics = compute_survey_metrics(
        gx=gx,
        gy=gy,
        gz=gz,
        bx=bx,
        by=by,
        bz=bz,
        vertical_inc_threshold_deg=0.1,
        vertical_azimuth_lock=0.0,
    )

    # Total magnetic-to-grid correction angle (Declination - Grid Convergence)
    mag_grid_correction_deg = declination_deg - grid_convergence_deg

    # 3. Resolve QC boundaries
    try:
        family = ModelFamily(model_name.upper())
    except ValueError:
        family = ModelFamily.WMM
    qc_thresholds = compute_qc_thresholds(model_family=family, num_sigma=2.5)

    calculated_stations: List[SurveyStationResponse] = []
    for i, curr in enumerate(sorted_stns):
        g_tot = round(float(metrics.g_total[i]), 4)
        b_tot = round(float(metrics.b_total[i]), 1)
        dip_angle = round(float(metrics.dip_deg[i]), 2)

        # Compute sensor-derived grid azimuth
        sensor_grid_azim = (float(metrics.azim_mag_deg[i]) + mag_grid_correction_deg) % 360.0

        delta_g = round(g_tot - g_total_ref, 4)
        delta_b = round(b_tot - b_total_ref, 1)
        delta_dip = round(dip_angle - dip_ref_deg, 2)

        qc_eval = evaluate_survey_station_qc(
            g_total=g_tot,
            b_total=b_tot,
            dip_deg=dip_angle,
            g_ref=g_total_ref,
            b_ref=b_total_ref,
            dip_ref_deg=dip_ref_deg,
            thresholds=qc_thresholds,
        )

        status_label = qc_eval.status_label

        # Only evaluate azimuth discrepancy if real sensor telemetry was provided and well is deviated
        if has_real_sensors[i] and qc_eval.is_overall_pass and curr.inc >= 3.0:
            az_diff = abs((curr.azim - sensor_grid_azim + 180.0) % 360.0 - 180.0)
            if az_diff > 2.0:
                status_label = "QC Warning (Azimuth Mismatch)"
        elif not has_real_sensors[i]:
            status_label = "Synthetic (No Raw Sensors)"

        sensor_schema = getattr(curr, "sensor", None) or RawStationSensorSchema(
            gx=round(float(gx[i]), 5),
            gy=round(float(gy[i]), 5),
            gz=round(float(gz[i]), 5),
            bx=round(float(bx[i]), 1),
            by=round(float(by[i]), 1),
            bz=round(float(bz[i]), 1),
        )

        calculated_stations.append(
            SurveyStationResponse(
                id=i + 1,
                well_id=well_id,
                md=curr.md,
                inc=curr.inc,
                azim=curr.azim,
                tvd=round(float(traj.tvd[i]), 2),
                northing=round(float(traj.northing[i]), 2),
                easting=round(float(traj.easting[i]), 2),
                dls=round(float(traj.dls[i]), 2),
                vs=round(float(traj.vertical_section[i]), 2),
                closure_dist=round(float(traj.closure_dist[i]), 2),
                closure_azim=round(float(traj.closure_azim[i]), 2),
                sensor=sensor_schema,
                g_total=g_tot,
                b_total=b_tot,
                dip_angle=dip_angle,
                delta_g=delta_g,
                delta_b=delta_b,
                delta_dip=delta_dip,
                is_qc_pass=qc_eval.is_overall_pass,
                status=status_label,
            )
        )

    last_stn = calculated_stations[-1]
    max_dls_val = round(float(np.max(traj.dls)), 2)

    return TrajectoryCalculationResponse(
        station_count=len(calculated_stations),
        total_md=last_stn.md,
        total_tvd=last_stn.tvd,
        max_dls=max_dls_val,
        stations=calculated_stations,
    )


def run_msa_mwdcore(
    stations: List[SurveyStationResponse],
    geomag_model: str = "WMM",
    dec_deg: float = 12.42,
    grid_deg: float = 1.25,
) -> Dict[str, Any]:
    """Execute Multi-Station Analysis (MSA) using parallel SciPy Differential Evolution."""
    msa_stations = [s for s in stations if s.inc >= 3.0]
    if len(msa_stations) < 4:
        msa_stations = stations[-6:] if len(stations) >= 6 else stations

    if len(msa_stations) < 4:
        raise ValueError("At least 4 valid survey stations are required for MSA convergence.")

    raw_dni = np.array([
        [
            s.sensor.gx, s.sensor.gy, s.sensor.gz,
            s.sensor.bx, s.sensor.by, s.sensor.bz,
        ]
        for s in msa_stations
    ], dtype=np.float64)

    try:
        family = ModelFamily(geomag_model.upper())
    except ValueError:
        family = ModelFamily.WMM

    avg_b_ref = float(np.mean([s.b_total for s in msa_stations]))
    avg_dip_ref = float(np.mean([s.dip_angle for s in msa_stations]))

    # Run global optimization
    result = run_msa_optimization(
        raw_dni=raw_dni,
        g_ref=1.0000,
        b_ref=avg_b_ref,
        dip_ref_deg=avg_dip_ref,
        enable_misalignment=True,
    )

    total_mag_correction = dec_deg - grid_deg

    raw_metrics = compute_survey_metrics(
        raw_dni[:, 0], raw_dni[:, 1], raw_dni[:, 2],
        raw_dni[:, 3], raw_dni[:, 4], raw_dni[:, 5],
    )
    raw_grid_azims = (raw_metrics.azim_mag_deg + total_mag_correction) % 360.0

    cor = result.corrected_surveys
    cor_metrics = compute_survey_metrics(
        cor[:, 0], cor[:, 1], cor[:, 2],
        cor[:, 3], cor[:, 4], cor[:, 5],
    )
    cor_grid_azims = (cor_metrics.azim_mag_deg + total_mag_correction) % 360.0

    az_shifts = (cor_grid_azims - raw_grid_azims + 180.0) % 360.0 - 180.0
    mean_az_shift = round(float(np.mean(az_shifts)), 2)

    is_success = bool(result.success or (result.cost < 50.0))

    return {
        "status": "success" if is_success else "warning",
        "geomag_model": family.value,
        "azimuth_correction_deg": mean_az_shift,
        "delta_b_ref_nt": result.ref_corrections.delta_b,
        "delta_dip_ref_deg": result.ref_corrections.delta_dip,
        "axial_bias_bz": round(float(result.params.mbz), 2),
        "cross_bias_bx": round(float(result.params.mbx), 2),
        "cross_bias_by": round(float(result.params.mby), 2),
        "scale_factor_z": round(float(result.params.msz), 5),
        "misalignment_mxy": round(float(result.params.mxy), 5),
        "stations_analyzed": len(msa_stations),
        "iterations": result.iterations,
        "quality_assessment": {
            "accuracy": is_success,
            "cost": round(result.cost, 3),
            "expectation": result.cost < 25.0,
            "reference": True,
        },
    }


def build_bha_assembly(config: BhaConfigSchema) -> Tuple[List[BhaComponent], List[StabilizerBlade], float]:
    """Translate engineering schema parameters into physical beam elements."""
    od_m = config.collar_od_mm / 1000.0
    id_m = config.collar_id_mm / 1000.0
    material = (
        ComponentMaterial.NM_STEEL
        if str(config.bha_material).lower() in ("nm_steel", "nmsteel")
        else ComponentMaterial.STEEL
    )

    total_len = max(55.0, config.sensor_to_bit_m + 35.0)
    bit_len = 0.5
    bit_od = max(od_m, 0.2159)
    bit_id = 0.05

    bit_elem = BhaComponent(od_m=bit_od, id_m=bit_id, length_m=bit_len, material=ComponentMaterial.STEEL)

    collar1_len = max(1.0, config.stabilizer_dist_m - bit_len)
    collar1_elem = BhaComponent(od_m=od_m, id_m=id_m, length_m=collar1_len, material=material)

    collar2_len = max(5.0, total_len - (bit_len + collar1_len))
    collar2_elem = BhaComponent(od_m=od_m, id_m=id_m, length_m=collar2_len, material=ComponentMaterial.STEEL)

    stab_blade = StabilizerBlade(
        blade_od_m=max(od_m * 1.15, 0.2159),
        dist_from_bit_m=config.stabilizer_dist_m,
        length_m=1.0,
    )

    components = [bit_elem, collar1_elem, collar2_elem]
    stabilizers = [stab_blade]
    nominal_hole_m = max(bit_od * 1.02, 0.2159)

    return components, stabilizers, nominal_hole_m


def calculate_well_sag_mwdcore(
    stations: List[SurveyStationResponse],
    bha_config: BhaConfigSchema,
    well_id: str = "well-active",
    iscwsa_model_name: str = "ISCWSA_MWD_SAG_REV4",
) -> SagCalculationResponse:
    """Calculate BHA Sag deflection across wellbore stations using beam relaxation."""
    if not stations:
        return SagCalculationResponse(
            status="empty",
            well_id=well_id,
            mud_weight_gcm3=bha_config.mud_weight_gcm3,
            peak_sag_deg=0.0,
            stations_corrected=0,
            corrections=[],
        )

    components, stabilizers, hole_diameter_m = build_bha_assembly(bha_config)
    mud_density_kg_m3 = bha_config.mud_weight_gcm3 * 1000.0

    corrections: List[SagStationCorrection] = []
    max_sag_deg = 0.0

    for st in stations:
        sag_res = calculate_bha_sag(
            components=components,
            stabilizers=stabilizers,
            sensor_dist_from_bit_m=bha_config.sensor_to_bit_m,
            hole_diameter_m=hole_diameter_m,
            inclination_deg=st.inc,
            dls_deg_30m=st.dls,
            mud_density_kg_m3=mud_density_kg_m3,
            iscwsa_model_name=iscwsa_model_name,
        )

        abs_sag = abs(sag_res.sag_correction_deg)
        if abs_sag > max_sag_deg:
            max_sag_deg = abs_sag

        corrections.append(
            SagStationCorrection(
                station_id=st.id,
                md=st.md,
                raw_inc=st.inc,
                sag_correction_deg=sag_res.sag_correction_deg,
                corrected_inc=sag_res.corrected_inc_deg,
                valid=sag_res.is_converged and sag_res.iscwsa_qc_pass,
            )
        )

    return SagCalculationResponse(
        status="success",
        well_id=well_id,
        mud_weight_gcm3=bha_config.mud_weight_gcm3,
        peak_sag_deg=round(max_sag_deg, 3),
        stations_corrected=len(corrections),
        corrections=corrections,
    )


def calculate_uncertainty_mwdcore(
    stations: List[SurveyStationResponse],
    b_total_ref: float = 52480.0,
    dip_ref_deg: float = 72.15,
    declination_deg: float = 12.42,
    model_name: str = "ISCWSA_MWD_REV4",
    expansion_k: float = 2.0,
) -> List[EllipsoidOfUncertainty]:
    """Calculate 3D Ellipsoids of Uncertainty (EOU) along calculated survey stations."""
    if len(stations) < 2:
        return []

    md = np.array([s.md for s in stations], dtype=np.float64)
    inc = np.array([s.inc for s in stations], dtype=np.float64)
    azim = np.array([s.azim for s in stations], dtype=np.float64)
    tvd = np.array([s.tvd for s in stations], dtype=np.float64)

    return calculate_trajectory_uncertainty(
        md=md,
        inc_deg=inc,
        azim_deg=azim,
        tvd=tvd,
        b_total_nt=b_total_ref,
        dip_deg=dip_ref_deg,
        declination_deg=declination_deg,
        model_name=model_name,
        expansion_k=expansion_k,
    )


def calculate_anticollision_mwdcore(
    subject_station: SurveyStationResponse,
    subject_cov: np.ndarray,
    offset_station: SurveyStationResponse,
    offset_cov: np.ndarray,
    well_radius_subject_m: float = 0.108,
    well_radius_offset_m: float = 0.108,
    expansion_k: float = 2.0,
) -> SeparationFactorResult:
    """Calculate Anti-Collision Clearance and Separation Factor (SF) between two stations."""
    pos_subject = np.array([subject_station.northing, subject_station.easting, subject_station.tvd], dtype=np.float64)
    pos_offset = np.array([offset_station.northing, offset_station.easting, offset_station.tvd], dtype=np.float64)

    return calculate_separation_factor(
        pos_subject_nev=pos_subject,
        cov_subject_nev=subject_cov,
        pos_offset_nev=pos_offset,
        cov_offset_nev=offset_cov,
        well_radius_subject_m=well_radius_subject_m,
        well_radius_offset_m=well_radius_offset_m,
        expansion_k=expansion_k,
    )

def run_anticollision_mwdcore(
    subject_stations: List[SurveyStationResponse],
    offset_stations: List[OffsetStationInput],
    offset_well_name: str,
    well_id: str = "well-active",
    model_name: str = "ISCWSA_MWD_REV4",
    expansion_k: float = 2.0,
    well_radius_subject_m: float = 0.108,
    well_radius_offset_m: float = 0.108,
    b_total_ref: float = 52480.0,
    dip_ref_deg: float = 72.15,
    declination_deg: float = 12.42,
) -> AntiCollisionScanResponse:
    """Execute high-precision 3D Anti-Collision clearance scan using ISCWSA error propagation.

    Args:
        subject_stations: Calculated stations of the active drilling wellbore.
        offset_stations: Input coordinates of the offset well.
        offset_well_name: Identifier name of the offset well.
        well_id: Active well identifier.
        model_name: ISCWSA tool error model key (default 'ISCWSA_MWD_REV4').
        expansion_k: Confidence coverage multiplier (default 2.0 for 2-sigma).
        well_radius_subject_m: Subject wellbore radius in meters.
        well_radius_offset_m: Offset wellbore radius in meters.
        b_total_ref: Geomagnetic total field reference in nT.
        dip_ref_deg: Geomagnetic dip angle reference in degrees.
        declination_deg: Magnetic declination in degrees.

    Returns:
        AntiCollisionScanResponse with clearance geometry, EOU envelopes, and SF.
    """
    if len(subject_stations) < 2 or len(offset_stations) < 2:
        return AntiCollisionScanResponse(
            status="empty",
            well_id=well_id,
            offset_well_name=offset_well_name,
            min_separation_factor=999.0,
            closest_distance_m=0.0,
            closest_md_m=0.0,
            scan_points=[],
        )

    # 1. Subject well 3D Ellipsoids of Uncertainty (EOU)
    subj_eou = calculate_uncertainty_mwdcore(
        stations=subject_stations,
        b_total_ref=b_total_ref,
        dip_ref_deg=dip_ref_deg,
        declination_deg=declination_deg,
        model_name=model_name,
        expansion_k=expansion_k,
    )

    # 2. Offset well trajectory and EOU
    offset_bases = [
        SurveyStationBase(md=s.md, inc=s.inc or 0.0, azim=s.azim or 0.0)
        for s in offset_stations
    ]
    offset_traj = calculate_trajectory_mwdcore(
        stations=offset_bases,
        declination_deg=declination_deg,
        b_total_ref=b_total_ref,
        dip_ref_deg=dip_ref_deg,
        well_id="offset-temp",
    )
    offset_eou = calculate_uncertainty_mwdcore(
        stations=offset_traj.stations,
        b_total_ref=b_total_ref,
        dip_ref_deg=dip_ref_deg,
        declination_deg=declination_deg,
        model_name=model_name,
        expansion_k=expansion_k,
    )

    scan_points: List[AntiCollisionPointOutput] = []
    min_sf = 999.0
    min_dist = float("inf")
    min_dist_md = 0.0

    for i, s_stn in enumerate(subject_stations):
        if s_stn.md < 100.0 or i >= len(subj_eou):
            continue

        s_cov = subj_eou[i].covariance_nev
        best_sf_res = None
        best_off_stn = None
        current_min_d = float("inf")

        for j, o_stn in enumerate(offset_traj.stations):
            if j >= len(offset_eou):
                continue
            dist = math.hypot(
                s_stn.northing - o_stn.northing,
                s_stn.easting - o_stn.easting,
                s_stn.tvd - o_stn.tvd,
            )
            if dist < current_min_d:
                current_min_d = dist
                best_off_stn = o_stn
                o_cov = offset_eou[j].covariance_nev
                best_sf_res = calculate_anticollision_mwdcore(
                    subject_station=s_stn,
                    subject_cov=s_cov,
                    offset_station=o_stn,
                    offset_cov=o_cov,
                    well_radius_subject_m=well_radius_subject_m,
                    well_radius_offset_m=well_radius_offset_m,
                    expansion_k=expansion_k,
                )

        if best_sf_res and best_off_stn:
            if best_sf_res.separation_factor < min_sf:
                min_sf = best_sf_res.separation_factor
            if best_sf_res.center_distance_m < min_dist:
                min_dist = best_sf_res.center_distance_m
                min_dist_md = s_stn.md

            scan_points.append(
                AntiCollisionPointOutput(
                    md=s_stn.md,
                    tvd=s_stn.tvd,
                    northing=s_stn.northing,
                    easting=s_stn.easting,
                    offset_well_name=offset_well_name,
                    offset_md=best_off_stn.md,
                    center_distance=best_sf_res.center_distance_m,
                    clearance_distance=best_sf_res.clearance_distance_m,
                    sigma_subject=best_sf_res.sigma_subject_m,
                    sigma_offset=best_sf_res.sigma_offset_m,
                    combined_uncertainty=best_sf_res.combined_uncertainty_m,
                    separation_factor=best_sf_res.separation_factor,
                    is_violation=best_sf_res.is_violation,
                    warning_level=best_sf_res.warning_level,
                )
            )

    return AntiCollisionScanResponse(
        status="success",
        well_id=well_id,
        offset_well_name=offset_well_name,
        min_separation_factor=round(min_sf, 2) if scan_points else 999.0,
        closest_distance_m=round(min_dist, 2) if scan_points else 0.0,
        closest_md_m=round(min_dist_md, 1) if scan_points else 0.0,
        scan_points=scan_points,
    )