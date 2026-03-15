"""Wells and field hierarchy API endpoints."""

import math
from datetime import datetime
from datetime import timezone
from typing import List
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from mwdstdcore.gmag.gmagcalc.gmag import gmag_point, gravity, grid_conv
from mwdstdcore.gmag.maglib.date import Date
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from core.database import get_db
from crud.wellbore import (
    get_full_hierarchy,
    get_stations_by_well,
    get_well_by_id,
    create_survey_station,
    delete_survey_station,
    sync_well_trajectory,
)
from schemas.hierarchy import FieldResponse
from schemas.survey import (
    SurveyStationResponse,
    RawStationSensorSchema,
    SurveyStationCreate,
    BhaConfigSchema,
    SagCalculationResponse,
)
from services.directional import (
    run_msa_mwdcore,
    calculate_well_sag_mwdcore,
)

router = APIRouter(prefix="/wells", tags=["Wells & Hierarchy"])


@router.get("/hierarchy", response_model=List[FieldResponse], summary="Get full field -> pad -> well hierarchy")
def read_hierarchy(db: Session = Depends(get_db)):
    """Retrieve full oilfield hierarchy tree for frontend navigation sidebar."""
    return get_full_hierarchy(db)


@router.get("/{well_id}/stations", response_model=List[SurveyStationResponse], summary="Get survey stations for a well")
def read_well_stations(well_id: str, db: Session = Depends(get_db)):
    """Fetch all directional survey stations for a given wellbore."""
    well = get_well_by_id(db, well_id)
    if not well:
        raise HTTPException(status_code=404, detail=f"Wellbore '{well_id}' not found")

    db_stations = get_stations_by_well(db, well_id)

    response_list = []
    for s in db_stations:
        response_list.append(
            SurveyStationResponse(
                id=s.id,
                well_id=s.well_id,
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
        )
    return response_list


@router.post("/{well_id}/run-msa", summary="Run real MSA correction via mwdstdcore")
def execute_well_msa(well_id: str, db: Session = Depends(get_db)):
    """Trigger mwdstdcore differential evolution Multi-Station Analysis on well telemetry."""
    stations = read_well_stations(well_id, db)
    if len(stations) < 4:
        raise HTTPException(
            status_code=400,
            detail="Insufficient stations for MSA analysis (minimum 4 stations required)",
        )

    try:
        result = run_msa_mwdcore(stations)
        return result
    except ValueError as err:
        raise HTTPException(
            status_code=422,
            detail=f"MSA convergence failed: {str(err)}",
        )
    except Exception as err:
        raise HTTPException(
            status_code=500,
            detail=f"Internal telemetry solver error: {str(err)}",
        )

WELL_PROPOSAL_AZIMUTHS = {
    "well-102h": 55.0,
    "well-104b": 133.0,
    "well-b12": 215.5,
}

@router.post(
    "/{well_id}/stations",
    response_model=SurveyStationResponse,
    status_code=201,
    summary="Add a new survey station and cascade trajectory recomputation",
)
def add_well_station(
    well_id: str,
    payload: SurveyStationCreate,
    db: Session = Depends(get_db),
):
    """Insert a survey station and recalculate full downstream wellbore trajectory via mwdstdcore."""
    well = get_well_by_id(db, well_id)
    if not well:
        raise HTTPException(status_code=404, detail=f"Wellbore '{well_id}' not found")

    default_sensor = RawStationSensorSchema(
        gx=0.513, gy=0.865, gz=0.0, bx=17690.0, by=4380.0, bz=50200.0
    )
    sensor = payload.sensor or default_sensor

    stn_dict = {
        "well_id": well_id,
        "md": payload.md,
        "inc": payload.inc,
        "azim": payload.azim,
        "gx": sensor.gx,
        "gy": sensor.gy,
        "gz": sensor.gz,
        "bx": sensor.bx,
        "by": sensor.by,
        "bz": sensor.bz,
    }
    db_stn = create_survey_station(db, stn_dict)

    prop_az = WELL_PROPOSAL_AZIMUTHS.get(well_id, 55.0)
    updated_stations = sync_well_trajectory(db, well_id=well_id, proposal_azimuth=prop_az)
    computed = next((s for s in updated_stations if s.id == db_stn.id), db_stn)

    return SurveyStationResponse(
        id=computed.id,
        well_id=computed.well_id,
        md=computed.md,
        inc=computed.inc,
        azim=computed.azim,
        tvd=computed.tvd,
        northing=computed.northing,
        easting=computed.easting,
        dls=computed.dls,
        vs=computed.vs,
        closure_dist=computed.closure_dist,
        closure_azim=computed.closure_azim,
        sensor=RawStationSensorSchema(
            gx=computed.gx, gy=computed.gy, gz=computed.gz,
            bx=computed.bx, by=computed.by, bz=computed.bz,
        ),
        g_total=computed.g_total,
        b_total=computed.b_total,
        dip_angle=computed.dip_angle,
        delta_g=computed.delta_g,
        delta_b=computed.delta_b,
        delta_dip=computed.delta_dip,
        is_qc_pass=computed.is_qc_pass,
        status=computed.status,
    )


@router.delete("/{well_id}/stations/{station_id}", summary="Delete survey station and resync trajectory")
def remove_well_station(
    well_id: str,
    station_id: int,
    db: Session = Depends(get_db),
):
    """Delete a survey station and cascade trajectory recomputation across remaining stations."""
    success = delete_survey_station(db, station_id=station_id, well_id=well_id)
    if not success:
        raise HTTPException(
            status_code=404,
            detail=f"Station with ID {station_id} not found in well '{well_id}'",
        )

    prop_az = WELL_PROPOSAL_AZIMUTHS.get(well_id, 55.0)
    sync_well_trajectory(db, well_id=well_id, proposal_azimuth=prop_az)
    return {"status": "success", "deleted_station_id": station_id}


@router.post(
    "/{well_id}/run-sag",
    response_model=SagCalculationResponse,
    summary="Calculate BHA gravity sag deflection using mwdstdcore",
)
def execute_well_sag(
    well_id: str,
    payload: Optional[BhaConfigSchema] = None,
    db: Session = Depends(get_db),
):
    """Execute analytical beam-bending BHA Sag correction on well survey stations."""
    stations = read_well_stations(well_id, db)
    if not stations:
        raise HTTPException(status_code=404, detail=f"No survey stations found for well '{well_id}'")

    bha_config = payload or BhaConfigSchema()
    result = calculate_well_sag_mwdcore(stations=stations, bha_config=bha_config, well_id=well_id)
    return result


class GeomagCalcRequest(BaseModel):
    """Payload for calculating global geomagnetic reference parameters."""
    latitude: float = Field(..., description="Latitude in degrees (-90 to 90)")
    longitude: float = Field(..., description="Longitude in degrees (-180 to 180)")
    altitude_m: float = Field(0.0, description="Altitude above MSL in meters")
    model: str = Field("WMM2020", description="Model name: WMM2020, IGRF2020, or WMM2015")
    date_iso: Optional[str] = Field(None, description="ISO formatted date (e.g. '2026-09-20' or '2026-09-20T12:00:00Z')")


class GeomagCalcResponse(BaseModel):
    """Exact reference geomagnetic and gravitational parameters from mwdstdcore."""
    model: str
    b_total_ref: float
    dip_ref: float
    declination: float
    grid_convergence: float
    g_total_ref: float
    g_ms2: float


@router.post(
    "/calculate-geomag-reference",
    response_model=GeomagCalcResponse,
    summary="Compute reference parameters via mwdstdcore",
)
def compute_geomag_reference(payload: GeomagCalcRequest):
    """Calculate exact reference geomagnetic field, dip, declination, and convergence from lat/lon."""
    if payload.date_iso:
        parsed_dt = datetime.fromisoformat(payload.date_iso)
        if parsed_dt.tzinfo is None:
            target_date = parsed_dt.replace(tzinfo=timezone.utc)
        else:
            target_date = parsed_dt.astimezone(timezone.utc)
    else:
        target_date = datetime.now(timezone.utc)
    mwd_date = Date(day=target_date.day, month=target_date.month, year=target_date.year)

    mod_name = payload.model.replace(" ", "").upper()
    if mod_name not in ("WMM2020", "IGRF2020", "WMM2015", "WMM2010"):
        mod_name = "WMM2020"
    mag = gmag_point(
        latitude=payload.latitude,
        longitude=payload.longitude,
        altitude=payload.altitude_m / 1000.0,
        date=mwd_date,
        gmag_mod=mod_name,
    )

    g_val = gravity(payload.latitude)
    conv_rad = grid_conv(payload.latitude, payload.longitude)

    return GeomagCalcResponse(
        model=payload.model,
        b_total_ref=round(mag.F, 1),
        dip_ref=round(mag.Incl, 2),
        declination=round(mag.Decl, 2),
        grid_convergence=round(math.degrees(conv_rad), 2),
        g_total_ref=round(g_val / 9.80665, 4),
        g_ms2=round(g_val, 4),
    )