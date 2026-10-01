import math
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from core.database import get_db
from core.settings import settings
from crud.wellbore import (
    clear_corrected_stations,
    create_survey_station,
    delete_survey_station,
    get_full_hierarchy,
    get_geomag_ref_by_pad_id,
    get_stations_by_well,
    get_well_by_id,
    sync_survey_set_trajectory,
    upsert_geomag_reference
)
from models.wellbore import SurveyStation
from schemas.hierarchy import FieldResponse
from schemas.survey import (
    AntiCollisionScanRequest,
    AntiCollisionScanResponse,
    BhaConfigSchema,
    EouResponseSchema,
    GeomagReferenceSchema,
    MsaConfigSchema,
    RawStationSensorSchema,
    SurveyStationCreate,
    SurveyStationResponse,
)
from schemas.survey import GeomagCalcRequest, GeomagCalcResponse
from services.directional import calculate_geomag_reference_mwdcore
from services.directional import (
    calculate_uncertainty_mwdcore,
    calculate_well_sag_mwdcore,
    run_anticollision_mwdcore,
    run_msa_mwdcore,
)

router = APIRouter(prefix="/wells", tags=["Wells & Hierarchy"])


def _get_well_stations_response(
    db: Session,
    well_id: str,
    survey_type: Optional[str] = None,
    include_eou: bool = True,  # Allows skipping heavy 3D EOU computation when reading input data
) -> List[SurveyStationResponse]:
    well = get_well_by_id(db, well_id)
    if not well:
        raise HTTPException(status_code=404, detail=f"Wellbore '{well_id}' not found")

    target_type = survey_type
    if not target_type:
        has_corrected = len(get_stations_by_well(db, well_id, survey_type="corrected")) > 0
        target_type = "corrected" if has_corrected else "raw"

    db_stations = get_stations_by_well(db, well_id, survey_type=target_type)

    response_list = [
        SurveyStationResponse(
            id=s.id,
            well_id=s.well_id,
            parent_station_id=s.parent_station_id,
            survey_type=s.survey_type,
            correction_type=s.correction_type,
            md=s.md,
            inc=s.inc,
            azim=s.azim,
            tvd=s.tvd,
            northing=s.northing,
            easting=s.easting,
            dls=s.dls,
            vs=s.vs,
            closure_dist=s.closure_dist,
            closure_azim=s.closure_azim,
            sensor=RawStationSensorSchema(
                gx=s.gx, gy=s.gy, gz=s.gz,
                bx=s.bx, by=s.by, bz=s.bz,
            ),
            g_total=s.g_total,
            b_total=s.b_total,
            dip_angle=s.dip_angle,
            delta_g=s.delta_g,
            delta_b=s.delta_b,
            delta_dip=s.delta_dip,
            is_qc_pass=s.is_qc_pass,
            status=s.status,
        )
        for s in db_stations
    ]

    # Only calculate 3D Ellipsoid of Uncertainty (EOU) when preparing final client response
    if include_eou and len(response_list) >= 2:
        try:
            geo_ref = get_geomag_ref_by_pad_id(db, well.pad_id)
            b_ref = geo_ref.b_total_ref if geo_ref else settings.DEFAULT_B_TOTAL_REF
            dip_ref = geo_ref.dip_ref if geo_ref else settings.DEFAULT_DIP_REF
            dec = geo_ref.declination if geo_ref else settings.DEFAULT_DECLINATION

            eou_list = calculate_uncertainty_mwdcore(
                stations=response_list,
                b_total_ref=b_ref,
                dip_ref_deg=dip_ref,
                declination_deg=dec,
            )
            for stn_resp, eou in zip(response_list, eou_list):
                stn_resp.eou = EouResponseSchema(
                    semi_major=eou.semi_major_m,
                    semi_intermediate=eou.semi_intermediate_m,
                    semi_minor=eou.semi_minor_m,
                    horiz_semi_major=eou.horiz_semi_major_m,
                    horiz_semi_minor=eou.horiz_semi_minor_m,
                    horiz_azimuth=eou.horiz_azimuth_deg,
                    eigenvectors=eou.eigenvectors.tolist(),
                )
        except Exception:
            pass

    return response_list


@router.get("/hierarchy", response_model=List[FieldResponse])
def read_hierarchy(db: Session = Depends(get_db)):
    return get_full_hierarchy(db)


@router.get("/{well_id}/stations", response_model=List[SurveyStationResponse])
def read_well_stations(
    well_id: str,
    survey_type: Optional[str] = Query(None),
    db: Session = Depends(get_db),
):
    return _get_well_stations_response(db=db, well_id=well_id, survey_type=survey_type, include_eou=True)


@router.post("/{well_id}/run-msa", response_model=List[SurveyStationResponse])
def execute_well_msa(
    well_id: str,
    payload: Optional[MsaConfigSchema] = None,
    db: Session = Depends(get_db),
):
    well = get_well_by_id(db, well_id)
    if not well:
        raise HTTPException(status_code=404, detail=f"Wellbore '{well_id}' not found")

    # Optimization: Read raw stations without running 140ms EOU calculations
    raw_stations = _get_well_stations_response(db=db, well_id=well_id, survey_type="raw", include_eou=False)
    if len(raw_stations) < 4:
        raise HTTPException(status_code=400, detail="Minimum 4 raw stations required for MSA")

    geo_ref = get_geomag_ref_by_pad_id(db, well.pad_id)
    b_ref = geo_ref.b_total_ref if geo_ref else settings.DEFAULT_B_TOTAL_REF
    dip_ref = geo_ref.dip_ref if geo_ref else settings.DEFAULT_DIP_REF
    g_ref = geo_ref.g_total_ref if geo_ref else 1.0000
    dec = geo_ref.declination if geo_ref else settings.DEFAULT_DECLINATION
    grid = geo_ref.grid_convergence if geo_ref else settings.DEFAULT_GRID_CONVERGENCE
    model = geo_ref.model if geo_ref else settings.DEFAULT_GEOMAG_MODEL

    cfg = payload or MsaConfigSchema()
    gens = cfg.cma_generations or cfg.max_iter or 100

    # Execute LRA-CMA core optimizer (~300 ms)
    msa_res = run_msa_mwdcore(
        stations=raw_stations,
        b_total_ref=b_ref,
        dip_ref_deg=dip_ref,
        g_total_ref=g_ref,
        declination_deg=dec,
        grid_convergence_deg=grid,
        geomag_model=model,
        cma_generations=gens,
        enable_misalignment=cfg.enable_misalignment,
        enable_ref_corrections=cfg.enable_ref_corrections,
    )

    cor_map = {item["id"]: item for item in msa_res.get("corrected_stations", [])}
    bias_bz = float(msa_res.get("axial_bias_bz", 0.0))
    bias_bx = float(msa_res.get("cross_bias_bx", 0.0))
    bias_by = float(msa_res.get("cross_bias_by", 0.0))

    db_active = get_stations_by_well(db, well_id, survey_type="corrected")
    if not db_active:
        # Optimization: Insert all corrected stations in ONE single batch operation
        db_raw = get_stations_by_well(db, well_id, survey_type="raw")
        new_stations = []
        for raw_stn in db_raw:
            cor_item = cor_map.get(raw_stn.id, {})
            new_stations.append(SurveyStation(
                well_id=well_id,
                parent_station_id=raw_stn.id,
                survey_type="corrected",
                correction_type="MSA",
                md=raw_stn.md,
                inc=raw_stn.inc,
                azim=cor_item.get("azim_cor", raw_stn.azim),
                gx=raw_stn.gx,
                gy=raw_stn.gy,
                gz=raw_stn.gz,
                bx=round(raw_stn.bx - bias_bx, 1),
                by=round(raw_stn.by - bias_by, 1),
                bz=round(raw_stn.bz - bias_bz, 1),
                status="MSA Corrected",
            ))
        db.add_all(new_stations)
        db.flush()
    else:
        for stn in db_active:
            raw_id = stn.parent_station_id if stn.parent_station_id else stn.id
            cor_item = cor_map.get(raw_id, {})
            stn.azim = cor_item.get("azim_cor", stn.azim)
            stn.bz = round(stn.bz - bias_bz, 1)
            stn.bx = round(stn.bx - bias_bx, 1)
            stn.by = round(stn.by - bias_by, 1)

            prev_types = [p for p in (stn.correction_type or "").split("+") if p and p not in ("MSA", "SCC")]
            prev_types.append("MSA")
            stn.correction_type = "+".join(sorted(prev_types))
            stn.status = f"{stn.correction_type} Applied"

    # Optimization: Sync trajectory and commit to disk only once
    prop_az = well.proposal_azimuth or 0.0
    sync_survey_set_trajectory(db, well_id=well_id, survey_type="corrected", proposal_azimuth=prop_az, commit_now=True)

    return _get_well_stations_response(db=db, well_id=well_id, survey_type="corrected", include_eou=True)


@router.post("/{well_id}/run-sag", response_model=List[SurveyStationResponse])
def execute_well_sag(
    well_id: str,
    payload: Optional[BhaConfigSchema] = None,
    db: Session = Depends(get_db),
):
    well = get_well_by_id(db, well_id)
    if not well:
        raise HTTPException(status_code=404, detail=f"Wellbore '{well_id}' not found")

    # Optimization: Skip EOU calculation during intermediate data loading
    raw_stations = _get_well_stations_response(db=db, well_id=well_id, survey_type="raw", include_eou=False)
    if not raw_stations:
        raise HTTPException(status_code=404, detail="No survey stations found")

    bha_config = payload or BhaConfigSchema()
    sag_res = calculate_well_sag_mwdcore(stations=raw_stations, bha_config=bha_config, well_id=well_id)
    sag_map = {c.station_id: c.corrected_inc for c in sag_res.corrections}

    db_active = get_stations_by_well(db, well_id, survey_type="corrected")
    if not db_active:
        db_raw = get_stations_by_well(db, well_id, survey_type="raw")
        new_stations = []
        for raw_stn in db_raw:
            new_stations.append(SurveyStation(
                well_id=well_id,
                parent_station_id=raw_stn.id,
                survey_type="corrected",
                correction_type="SAG",
                md=raw_stn.md,
                inc=sag_map.get(raw_stn.id, raw_stn.inc),
                azim=raw_stn.azim,
                gx=raw_stn.gx,
                gy=raw_stn.gy,
                gz=raw_stn.gz,
                bx=raw_stn.bx,
                by=raw_stn.by,
                bz=raw_stn.bz,
                status="SAG Applied",
            ))
        db.add_all(new_stations)
        db.flush()
    else:
        for stn in db_active:
            target_key = stn.parent_station_id if stn.parent_station_id else stn.id
            if target_key in sag_map:
                stn.inc = sag_map[target_key]
                prev_types = [p for p in (stn.correction_type or "").split("+") if p and p != "SAG"]
                prev_types.append("SAG")
                stn.correction_type = "+".join(sorted(prev_types))
                stn.status = f"{stn.correction_type} Applied"

    prop_az = well.proposal_azimuth or 0.0
    sync_survey_set_trajectory(db, well_id=well_id, survey_type="corrected", proposal_azimuth=prop_az, commit_now=True)

    return _get_well_stations_response(db=db, well_id=well_id, survey_type="corrected", include_eou=True)


@router.post("/{well_id}/run-scc", response_model=List[SurveyStationResponse])
def execute_well_scc(well_id: str, db: Session = Depends(get_db)):
    well = get_well_by_id(db, well_id)
    if not well:
        raise HTTPException(status_code=404, detail=f"Wellbore '{well_id}' not found")

    geo_ref = get_geomag_ref_by_pad_id(db, well.pad_id)
    b_ref = geo_ref.b_total_ref if geo_ref else settings.DEFAULT_B_TOTAL_REF
    dec = geo_ref.declination if geo_ref else settings.DEFAULT_DECLINATION
    grid = geo_ref.grid_convergence if geo_ref else settings.DEFAULT_GRID_CONVERGENCE
    mag_grid_shift = dec - grid

    db_raw = get_stations_by_well(db, well_id, survey_type="raw")
    if not db_raw:
        raise HTTPException(status_code=404, detail="No survey stations found")

    raw_calc_map = {}
    for raw_stn in db_raw:
        b_xy_sq = raw_stn.bx**2 + raw_stn.by**2
        diff = max(0.0, b_ref**2 - b_xy_sq)
        sign = 1.0 if raw_stn.bz >= 0.0 else -1.0
        cor_bz = round(sign * math.sqrt(diff), 1)

        g_tot = math.sqrt(raw_stn.gx**2 + raw_stn.gy**2 + raw_stn.gz**2) or 1.0
        ew = (raw_stn.gx * raw_stn.by - raw_stn.gy * raw_stn.bx) * g_tot
        ns = cor_bz * (raw_stn.gx**2 + raw_stn.gy**2) - raw_stn.gz * (raw_stn.gx * raw_stn.bx + raw_stn.gy * raw_stn.by)

        raw_mag_azim = math.degrees(math.atan2(ew, ns)) % 360.0
        new_azim = round((raw_mag_azim + mag_grid_shift) % 360.0, 2)
        raw_calc_map[raw_stn.id] = (new_azim, cor_bz)

    db_active = get_stations_by_well(db, well_id, survey_type="corrected")
    if not db_active:
        new_stations = []
        for raw_stn in db_raw:
            new_azim, cor_bz = raw_calc_map[raw_stn.id]
            new_stations.append(SurveyStation(
                well_id=well_id,
                parent_station_id=raw_stn.id,
                survey_type="corrected",
                correction_type="SCC",
                md=raw_stn.md,
                inc=raw_stn.inc,
                azim=new_azim,
                gx=raw_stn.gx,
                gy=raw_stn.gy,
                gz=raw_stn.gz,
                bx=raw_stn.bx,
                by=raw_stn.by,
                bz=cor_bz,
                status="SCC Applied",
            ))
        db.add_all(new_stations)
        db.flush()
    else:
        for stn in db_active:
            raw_id = stn.parent_station_id if stn.parent_station_id else stn.id
            if raw_id in raw_calc_map:
                new_azim, cor_bz = raw_calc_map[raw_id]
                stn.azim = new_azim
                stn.bz = cor_bz

                prev_types = [p for p in (stn.correction_type or "").split("+") if p and p not in ("MSA", "SCC")]
                prev_types.append("SCC")
                stn.correction_type = "+".join(sorted(prev_types))
                stn.status = f"{stn.correction_type} Applied"

    prop_az = well.proposal_azimuth or 0.0
    sync_survey_set_trajectory(db, well_id=well_id, survey_type="corrected", proposal_azimuth=prop_az, commit_now=True)

    return _get_well_stations_response(db=db, well_id=well_id, survey_type="corrected", include_eou=True)


@router.post("/{well_id}/reset-corrections", response_model=List[SurveyStationResponse])
def reset_well_corrections(
    well_id: str,
    target: Optional[str] = Query(None),
    db: Session = Depends(get_db)
):
    well = get_well_by_id(db, well_id)
    if not well:
        raise HTTPException(status_code=404, detail=f"Wellbore '{well_id}' not found")

    if not target or target == "all":
        clear_corrected_stations(db, well_id)
        return _get_well_stations_response(db=db, well_id=well_id, survey_type="raw", include_eou=True)

    db_active = get_stations_by_well(db, well_id, survey_type="corrected")
    if not db_active:
        return _get_well_stations_response(db=db, well_id=well_id, survey_type="raw", include_eou=True)

    db_raw_map = {r.id: r for r in get_stations_by_well(db, well_id, survey_type="raw")}

    for stn in db_active:
        raw_stn = db_raw_map.get(stn.parent_station_id)
        if not raw_stn:
            continue

        prev_types = [p for p in (stn.correction_type or "").split("+") if p]
        if target.upper() == "SAG":
            stn.inc = raw_stn.inc
            prev_types = [p for p in prev_types if p != "SAG"]
        elif target.upper() in ("MSA", "SCC"):
            stn.azim = raw_stn.azim
            stn.bx = raw_stn.bx
            stn.by = raw_stn.by
            stn.bz = raw_stn.bz
            prev_types = [p for p in prev_types if p not in ("MSA", "SCC")]

        stn.correction_type = "+".join(sorted(prev_types))
        stn.status = f"{stn.correction_type} Applied" if stn.correction_type else "Raw"

    if all(not s.correction_type for s in db_active):
        clear_corrected_stations(db, well_id)
        return _get_well_stations_response(db=db, well_id=well_id, survey_type="raw", include_eou=True)

    prop_az = well.proposal_azimuth or 0.0
    sync_survey_set_trajectory(db, well_id=well_id, survey_type="corrected", proposal_azimuth=prop_az, commit_now=True)

    return _get_well_stations_response(db=db, well_id=well_id, survey_type="corrected", include_eou=True)


@router.post("/{well_id}/stations", response_model=SurveyStationResponse, status_code=201)
def add_well_station(
    well_id: str,
    payload: SurveyStationCreate,
    db: Session = Depends(get_db),
):
    well = get_well_by_id(db, well_id)
    if not well:
        raise HTTPException(status_code=404, detail=f"Wellbore '{well_id}' not found")

    default_sensor = RawStationSensorSchema(
        gx=0.513, gy=0.865, gz=0.0, bx=17690.0, by=4380.0, bz=50200.0
    )
    sensor = payload.sensor or default_sensor

    db_stn = create_survey_station(db, {
        "well_id": well_id,
        "parent_station_id": None,
        "survey_type": "raw",
        "correction_type": None,
        "md": payload.md,
        "inc": payload.inc,
        "azim": payload.azim,
        "gx": sensor.gx,
        "gy": sensor.gy,
        "gz": sensor.gz,
        "bx": sensor.bx,
        "by": sensor.by,
        "bz": sensor.bz,
        "status": "Raw",
    })

    prop_az = well.proposal_azimuth or 0.0
    sync_survey_set_trajectory(db, well_id=well_id, survey_type="raw", proposal_azimuth=prop_az, commit_now=True)
    stations = _get_well_stations_response(db=db, well_id=well_id, survey_type="raw", include_eou=True)
    return next((s for s in stations if s.id == db_stn.id))


@router.delete("/{well_id}/stations/{station_id}")
def remove_well_station(
    well_id: str,
    station_id: int,
    db: Session = Depends(get_db),
):
    success = delete_survey_station(db, station_id=station_id, well_id=well_id)
    if not success:
        raise HTTPException(status_code=404, detail="Station not found")

    well = get_well_by_id(db, well_id)
    prop_az = well.proposal_azimuth or 0.0
    sync_survey_set_trajectory(db, well_id=well_id, survey_type="raw", proposal_azimuth=prop_az, commit_now=True)
    sync_survey_set_trajectory(db, well_id=well_id, survey_type="corrected", proposal_azimuth=prop_az, commit_now=True)
    return {"status": "success", "deleted_station_id": station_id}


@router.post(
    "/{well_id}/run-anti-collision",
    response_model=AntiCollisionScanResponse,
)
def run_anti_collision_endpoint(
    well_id: str,
    req: AntiCollisionScanRequest,
    db: Session = Depends(get_db),
):
    if req.subject_stations and len(req.subject_stations) >= 2:
        stations = [
            SurveyStationResponse(
                id=s.id,
                well_id=well_id,
                md=s.md,
                inc=s.inc,
                azim=s.azim,
                tvd=s.tvd,
                northing=s.northing,
                easting=s.easting,
                sensor=RawStationSensorSchema(gx=0.0, gy=0.0, gz=1.0, bx=16000.0, by=0.0, bz=50000.0),
            )
            for s in req.subject_stations
        ]
    else:
        stations = _get_well_stations_response(db=db, well_id=well_id, include_eou=True)

    if not stations or len(stations) < 2:
        raise HTTPException(status_code=400, detail="Well has insufficient survey stations")

    return run_anticollision_mwdcore(
        subject_stations=stations,
        offset_stations=req.offset_stations,
        offset_well_name=req.offset_well_name,
        well_id=well_id,
        model_name=req.model_name,
        expansion_k=req.expansion_k,
        well_radius_subject_m=req.well_radius_subject_m,
        well_radius_offset_m=req.well_radius_offset_m,
        b_total_ref=req.b_total_ref,
        dip_ref_deg=req.dip_ref_deg,
        declination_deg=req.declination_deg,
    )

@router.get("/{well_id}/geomag-reference", response_model=GeomagReferenceSchema)
def read_well_geomag_reference(well_id: str, db: Session = Depends(get_db)):
    """Fetch current geomagnetic and ISCWSA model parameters stored in DuckDB."""
    well = get_well_by_id(db, well_id)
    if not well:
        raise HTTPException(status_code=404, detail=f"Wellbore '{well_id}' not found")

    geo_ref = get_geomag_ref_by_pad_id(db, well.pad_id)
    if not geo_ref:
        return GeomagReferenceSchema()
    return geo_ref


@router.put("/{well_id}/geomag-reference", response_model=GeomagReferenceSchema)
def update_well_geomag_reference(
    well_id: str,
    payload: GeomagReferenceSchema,
    db: Session = Depends(get_db),
):
    """Save user-assigned geomagnetic model, error model, reference values and deltas into DuckDB."""
    well = get_well_by_id(db, well_id)
    if not well:
        raise HTTPException(status_code=404, detail=f"Wellbore '{well_id}' not found")

    saved_ref = upsert_geomag_reference(db, pad_id=well.pad_id, data=payload.model_dump())

    # Re-synchronize survey station QC flags against updated reference and delta tolerances
    prop_az = well.proposal_azimuth or 0.0
    sync_survey_set_trajectory(db, well_id=well_id, survey_type="raw", proposal_azimuth=prop_az)
    sync_survey_set_trajectory(db, well_id=well_id, survey_type="corrected", proposal_azimuth=prop_az)

    return saved_ref


@router.post("/{well_id}/run-msa", response_model=List[SurveyStationResponse])
def execute_well_msa(
    well_id: str,
    payload: Optional[MsaConfigSchema] = None,
    db: Session = Depends(get_db),
):
    well = get_well_by_id(db, well_id)
    if not well:
        raise HTTPException(status_code=404, detail=f"Wellbore '{well_id}' not found")

    raw_stations = _get_well_stations_response(db=db, well_id=well_id, survey_type="raw", include_eou=False)
    if len(raw_stations) < 4:
        raise HTTPException(status_code=400, detail="Minimum 4 raw stations required for MSA")

    # Fetch reference field parameters and error model strictly from DuckDB
    geo_ref = get_geomag_ref_by_pad_id(db, well.pad_id)
    b_ref = geo_ref.b_total_ref if geo_ref else settings.DEFAULT_B_TOTAL_REF
    dip_ref = geo_ref.dip_ref if geo_ref else settings.DEFAULT_DIP_REF
    g_ref = geo_ref.g_total_ref if geo_ref else 1.0000
    dec = geo_ref.declination if geo_ref else settings.DEFAULT_DECLINATION
    grid = geo_ref.grid_convergence if geo_ref else settings.DEFAULT_GRID_CONVERGENCE

    cfg = payload or MsaConfigSchema()
    model = cfg.geomag_model or (geo_ref.model if geo_ref else settings.DEFAULT_GEOMAG_MODEL)
    error_model = cfg.error_model or (geo_ref.error_model if geo_ref and hasattr(geo_ref, 'error_model') else "ISCWSA_MWD_REV4")
    gens = cfg.cma_generations or cfg.max_iter or 100

    msa_res = run_msa_mwdcore(
        stations=raw_stations,
        b_total_ref=b_ref,
        dip_ref_deg=dip_ref,
        g_total_ref=g_ref,
        declination_deg=dec,
        grid_convergence_deg=grid,
        geomag_model=model,
        iscwsa_model_name=error_model,
        cma_generations=gens,
        enable_misalignment=cfg.enable_misalignment,
        enable_ref_corrections=cfg.enable_ref_corrections,
    )

@router.post(
    "/calculate-geomag-reference",
    response_model=GeomagCalcResponse,
    summary="Calculate reference field and QC tolerances by geodetic coordinates",
)
def compute_geomag_reference(payload: GeomagCalcRequest):
    """Proxy request to directional service layer without loading models in API router."""
    return calculate_geomag_reference_mwdcore(payload)