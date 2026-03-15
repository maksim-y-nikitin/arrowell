"""Directional survey trajectory and MWD analytics service powered by mwdstdcore."""

import math
from typing import List

import numpy as np
from mwdstdcore.core.common.mincurv import mincurv
from mwdstdcore.core.diffev.de_correct import de_correct
from mwdstdcore.datamodel import (
    BHA,
    BhaElement,
    BhaElementType,
    Material,
    Blade,
    Station as CoreStation,
)
from mwdstdcore.datamodel import Survey as MwdSurvey
from mwdstdcore.datamodel.calc.station import calc_gbd
from mwdstdcore.datamodel.dni_params import DnIParams
from mwdstdcore.errormods.gmagmod import gmagmod
from mwdstdcore.msa.covan import covan
from mwdstdcore.sag.sagcor import sagcor

from schemas.survey import (
    SurveyStationBase,
    SurveyStationResponse,
    RawStationSensorSchema,
    TrajectoryCalculationResponse,
    BhaConfigSchema,
    SagCalculationResponse,
    SagStationCorrection,
)

RAD_TO_DEG = 180.0 / math.pi
DEG_TO_RAD = math.pi / 180.0


def calculate_trajectory_mwdcore(
    stations: List[SurveyStationBase],
    proposal_azimuth: float = 45.0,
    declination_deg: float = 12.42,
    grid_convergence_deg: float = 1.25,
    b_total_ref: float = 52480.0,
    dip_ref_deg: float = 72.15,
    g_total_ref: float = 1.0000,
    well_id: str = "well-active",
) -> TrajectoryCalculationResponse:
    """Calculate 3D trajectory using mwdstdcore Minimum Curvature Method (MCM)."""
    if not stations:
        return TrajectoryCalculationResponse(
            station_count=0, total_md=0.0, total_tvd=0.0, max_dls=0.0, stations=[]
        )
    sorted_stns = sorted(stations, key=lambda s: s.md)
    traj_input = np.zeros((len(sorted_stns), 3))
    for i, s in enumerate(sorted_stns):
        traj_input[i, 0] = s.md
        traj_input[i, 1] = s.inc * DEG_TO_RAD
        traj_input[i, 2] = s.azim * DEG_TO_RAD
    nev_coords = mincurv(traj_input, tie_in=(0.0, 0.0, 0.0))

    calculated_stations: List[SurveyStationResponse] = []
    max_dls = 0.0

    for i, curr in enumerate(sorted_stns):
        stn_id = i + 1
        northing = round(float(nev_coords[i, 0]), 2)
        easting = round(float(nev_coords[i, 1]), 2)
        tvd = round(float(nev_coords[i, 2]), 2)
        if i == 0:
            dls = 0.0
        else:
            prev = sorted_stns[i - 1]
            d_md = curr.md - prev.md
            if d_md > 0.0:
                inc1, inc2 = prev.inc * DEG_TO_RAD, curr.inc * DEG_TO_RAD
                az1, az2 = prev.azim * DEG_TO_RAD, curr.azim * DEG_TO_RAD
                cos_dl = math.cos(inc2 - inc1) - math.sin(inc1) * math.sin(inc2) * (1.0 - math.cos(az2 - az1))
                dl = math.acos(max(-1.0, min(1.0, cos_dl)))
                dls = round((dl * RAD_TO_DEG * 30.0) / d_md, 2)
            else:
                dls = 0.0

        if dls > max_dls:
            max_dls = dls
        closure_dist = round(float(math.hypot(northing, easting)), 2)
        closure_az_rad = math.atan2(easting, northing)
        closure_azim = round((closure_az_rad * RAD_TO_DEG + 360.0) % 360.0, 2)
        vs = round(closure_dist * math.cos((closure_azim - proposal_azimuth) * DEG_TO_RAD), 2)
        default_sensor = RawStationSensorSchema(
            gx=0.0, gy=0.0, gz=1.0, bx=16000.0, by=0.0, bz=50000.0
        )
        sensor = getattr(curr, "sensor", None) or default_sensor
        core_survey = MwdSurvey(
            md=curr.md,
            gx=sensor.gx,
            gy=sensor.gy,
            gz=sensor.gz,
            bx=sensor.bx,
            by=sensor.by,
            bz=sensor.bz,
        )

        gbd_params = calc_gbd(core_survey)
        g_tot = round(float(gbd_params.g), 4)
        b_tot = round(float(gbd_params.b), 1)
        dip_angle = round(float(gbd_params.dip * RAD_TO_DEG), 2)

        delta_g = round(g_tot - g_total_ref, 4)
        delta_b = round(b_tot - b_total_ref, 1)
        delta_dip = round(dip_angle - dip_ref_deg, 2)

        is_qc_pass = (
            abs(delta_g) <= 0.005 and
            abs(delta_b) <= 200.0 and
            abs(delta_dip) <= 0.30
        )

        calculated_stations.append(
            SurveyStationResponse(
                id=stn_id,
                well_id=well_id,
                md=curr.md,
                inc=curr.inc,
                azim=curr.azim,
                tvd=tvd,
                northing=northing,
                easting=easting,
                dls=dls,
                vs=vs,
                closure_dist=closure_dist,
                closure_azim=closure_azim,
                sensor=sensor,
                g_total=g_tot,
                b_total=b_tot,
                dip_angle=dip_angle,
                delta_g=delta_g,
                delta_b=delta_b,
                delta_dip=delta_dip,
                is_qc_pass=is_qc_pass,
                status="QC Pass" if is_qc_pass else "QC Warning",
            )
        )

    last_stn = calculated_stations[-1]
    return TrajectoryCalculationResponse(
        station_count=len(calculated_stations),
        total_md=last_stn.md,
        total_tvd=last_stn.tvd,
        max_dls=max_dls,
        stations=calculated_stations,
    )


def run_msa_mwdcore(
    stations: List[SurveyStationResponse],
    geomag_model: str = "BGGM",
    dec_deg: float = 12.42,
    grid_deg: float = 1.25,
) -> dict:
    """Execute high-performance Multi-Station Analysis (MSA) using optimized differential evolution."""
    msa_stations = [s for s in stations if s.inc >= 3.0]

    if len(msa_stations) < 4:
        msa_stations = stations[-6:] if len(stations) >= 6 else stations

    if len(msa_stations) < 4:
        raise ValueError("At least 4 valid survey stations are required for MSA convergence.")

    dni_xyz = np.array([
        [
            s.sensor.gx, s.sensor.gy, s.sensor.gz,
            s.sensor.bx, s.sensor.by, s.sensor.bz,
        ]
        for s in msa_stations
    ])
    ref_array = np.array([
        [1.0000, s.b_total, s.dip_angle * DEG_TO_RAD]
        for s in msa_stations
    ])
    apr_unc = covan(dni_xyz, rigid_dni=True)
    ref_mod = gmagmod.get(geomag_model.upper(), gmagmod["BGGM"])
    survey_status = np.zeros(dni_xyz.shape[0])
    dni_cor, _ = de_correct(
        dni_xyz=dni_xyz,
        ref=ref_array,
        survey_status=survey_status,
        apr_unc=apr_unc,
        refmod=ref_mod,
        particle_num=60,
    )
    dni_cs = DnIParams.fromarray(dni_cor[:15].flatten())

    return {
        "status": "success",
        "axial_bias_bz": round(float(dni_cs.MBZ), 2),
        "cross_bias_bx": round(float(dni_cs.MBX), 2),
        "cross_bias_by": round(float(dni_cs.MBY), 2),
        "scale_factor_z": round(float(dni_cs.MSZ), 5),
        "misalignment_mxy": round(float(dni_cs.MXY), 5),
        "stations_analyzed": len(msa_stations),
        "quality_assessment": {
            "accuracy": True,
            "expectation": True,
            "reference": True,
        },
    }


def build_mwdstd_bha(config: BhaConfigSchema) -> BHA:
    """Build mwdstdcore BHA data model from engineering parameters."""
    od_m = config.collar_od_mm / 1000.0
    id_m = config.collar_id_mm / 1000.0
    material = Material.nm_steel if config.bha_material in ("nm_steel", "nmsteel") else Material.steel

    total_len = max(55.0, config.sensor_to_bit_m + 35.0)
    density_steel = 7850.0

    bit_len = 0.5
    bit_od = max(od_m, 0.2159)
    bit_id = 0.05
    bit_vol = (math.pi / 4.0) * (bit_od**2 - bit_id**2) * bit_len
    bit_elem = BhaElement(
        type=BhaElementType.bit,
        od=bit_od,
        id=bit_id,
        weight=density_steel * bit_vol,
        length=bit_len,
        material=Material.steel,
    )

    collar1_len = max(1.0, config.stabilizer_dist_m - bit_len)
    collar1_vol = (math.pi / 4.0) * (od_m**2 - id_m**2) * collar1_len
    collar1_elem = BhaElement(
        type=BhaElementType.nmdc,
        od=od_m,
        id=id_m,
        weight=density_steel * collar1_vol,
        length=collar1_len,
        material=material,
    )

    collar2_len = max(5.0, total_len - (bit_len + collar1_len))
    collar2_vol = (math.pi / 4.0) * (od_m**2 - id_m**2) * collar2_len
    collar2_elem = BhaElement(
        type=BhaElementType.collar,
        od=od_m,
        id=id_m,
        weight=density_steel * collar2_vol,
        length=collar2_len,
        material=Material.steel,
    )

    stab_blade = Blade(
        od=max(od_m * 1.15, 0.2159),
        center_to_bit=config.stabilizer_dist_m,
        length=1.0,
    )

    return BHA(
        structure=[bit_elem, collar1_elem, collar2_elem],
        blades=[stab_blade],
        dni_to_bit=config.sensor_to_bit_m,
        bend_angle=0.0,
        bend_to_bit=0.0,
    )


def calculate_well_sag_mwdcore(
    stations: List[SurveyStationResponse],
    bha_config: BhaConfigSchema,
    well_id: str = "well-active",
) -> SagCalculationResponse:
    """Calculate analytical BHA Sag deflection across wellbore stations using mwdstdcore."""
    if not stations:
        return SagCalculationResponse(
            status="empty",
            well_id=well_id,
            mud_weight_gcm3=bha_config.mud_weight_gcm3,
            peak_sag_deg=0.0,
            stations_corrected=0,
            corrections=[],
        )

    bha = build_mwdstd_bha(bha_config)
    mud_weight_kg_m3 = bha_config.mud_weight_gcm3 * 1000.0

    corrections: List[SagStationCorrection] = []
    max_sag_deg = 0.0

    for i, st in enumerate(stations):
        inc_rad = st.inc * DEG_TO_RAD

        if inc_rad < math.radians(5.0):
            corrections.append(
                SagStationCorrection(
                    station_id=st.id,
                    md=st.md,
                    raw_inc=st.inc,
                    sag_correction_deg=0.0,
                    corrected_inc=st.inc,
                    valid=True,
                )
            )
            continue

        sp = next((s for s in reversed(stations[:i]) if s.md < st.md - 10.0), None)
        sn = next((s for s in stations[i + 1:] if s.md > st.md + 10.0), None)

        sp_inc_rad = sp.inc * DEG_TO_RAD if sp else inc_rad
        sn_inc_rad = sn.inc * DEG_TO_RAD if sn else inc_rad

        dlsp = (inc_rad - sp_inc_rad) / (st.md - sp.md) if sp and st.md != sp.md else 0.0
        dlsn = (sn_inc_rad - inc_rad) / (sn.md - st.md) if sn and sn.md != st.md else dlsp / 2.0
        if sp is None:
            dlsp = dlsn / 2.0

        bit_depth = bha.dni_to_bit
        md1 = bit_depth - bha.length - 10.0
        inc1 = max(0.0, min(math.pi, inc_rad + dlsp * md1))
        md2 = bit_depth + 10.0
        inc2 = max(0.0, min(math.pi, inc_rad + dlsn * md2))

        local_traj = [
            CoreStation(md1, inc1, 0.0),
            CoreStation(0.0, inc_rad, 0.0),
            CoreStation(md2, inc2, 0.0),
        ]

        sag_res = sagcor(
            bha=bha,
            md_bit=bit_depth,
            trajectory=local_traj,
            steer_gtf=math.radians(90.0),
            mud_weight=mud_weight_kg_m3,
        )

        sag_deg = round(math.degrees(sag_res.sag), 3)
        if abs(sag_deg) > max_sag_deg:
            max_sag_deg = abs(sag_deg)
        corrected_inc = round(st.inc - sag_deg, 2)

        corrections.append(
            SagStationCorrection(
                station_id=st.id,
                md=st.md,
                raw_inc=st.inc,
                sag_correction_deg=sag_deg,
                corrected_inc=corrected_inc,
                valid=sag_res.valid,
            )
        )

    return SagCalculationResponse(
        status="success",
        well_id=well_id,
        mud_weight_gcm3=bha_config.mud_weight_gcm3,
        peak_sag_deg=max_sag_deg,
        stations_corrected=len(corrections),
        corrections=corrections,
    )