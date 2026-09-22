"""Wells and field hierarchy API endpoints.

Powered by arrowell_engine (Zero mwdstdcore dependencies).
"""

import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

# Ensure project root (containing arrowell_engine) is in sys.path
_project_root = str(Path(__file__).resolve().parents[4])
if _project_root not in sys.path:
    sys.path.insert(0, _project_root)

from arrowell_engine.coords import GeodeticEngine
from arrowell_engine.geomag.calculator import GeomagneticModelEngine
from arrowell_engine.geomag.service import GeomagneticReferenceService
from core.database import get_db
from crud.wellbore import (
    create_survey_station,
    delete_survey_station,
    get_full_hierarchy,
    get_stations_by_well,
    get_well_by_id,
    sync_well_trajectory,
)
from schemas.hierarchy import FieldResponse
from schemas.survey import (
    AntiCollisionScanRequest,
    AntiCollisionScanResponse,
    BhaConfigSchema,
    RawStationSensorSchema,
    SagCalculationResponse,
    SurveyStationCreate,
    SurveyStationResponse,
)
from services.directional import (
    calculate_well_sag_mwdcore,
    run_anticollision_mwdcore,
    run_msa_mwdcore,
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


@router.post("/{well_id}/run-msa", summary="Run real MSA correction via arrowell_engine")
def execute_well_msa(well_id: str, db: Session = Depends(get_db)):
    """Trigger Differential Evolution Multi-Station Analysis on well telemetry."""
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
    """Insert a survey station and recalculate full downstream wellbore trajectory."""
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
    summary="Calculate BHA gravity sag deflection using arrowell_engine",
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
    model: str = Field("WMM2025", description="Model name: WMM2025, IGRF14, or WMMHR2025")
    date_iso: Optional[str] = Field(None, description="ISO formatted date (e.g. '2026-09-20' or '2026-09-20T12:00:00Z')")


class GeomagCalcResponse(BaseModel):
    """Exact reference geomagnetic and gravitational parameters."""
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
    summary="Compute reference parameters via arrowell_engine",
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
    calc_date = target_date.date()

    # 1. Normal gravity at latitude using WGS-84 Somigliana formula
    g_val = GeomagneticReferenceService.normal_gravity_wgs84(payload.latitude)
    g_total_ref = g_val / 9.80665

    # 2. Grid convergence from WGS-84 to UTM (returns degrees directly)
    conv_deg = GeodeticEngine.calculate_meridian_convergence(payload.latitude, payload.longitude)

    # 3. Geomagnetic components (try compiled .npz first, fallback to pygeomag)
    mod_name = payload.model.replace(" ", "").replace("-", "").lower()
    models_dir = Path(_project_root) / "arrowell_engine" / "geomag" / "assets" / "models"
    npz_candidate = models_dir / f"{mod_name}.npz"
    if not npz_candidate.exists():
        npz_candidate = models_dir / "wmm2025.npz"

    if npz_candidate.exists():
        engine = GeomagneticModelEngine(npz_candidate)
        mag = engine.calculate(
            latitude_deg=payload.latitude,
            longitude_deg=payload.longitude,
            altitude_meters=payload.altitude_m,
            survey_date=calc_date,
        )
        b_total = mag.total_field_nt
        dip = mag.dip_deg
        dec = mag.declination_deg
    else:
        geomag_srv = GeomagneticReferenceService()
        b_total, dip, dec = geomag_srv.get_magnetic_reference(
            lat_deg=payload.latitude,
            lon_deg=payload.longitude,
            alt_meters=payload.altitude_m,
            survey_date=calc_date,
        )

    return GeomagCalcResponse(
        model=payload.model,
        b_total_ref=round(float(b_total), 1),
        dip_ref=round(float(dip), 2),
        declination=round(float(dec), 2),
        grid_convergence=round(float(conv_deg), 2),
        g_total_ref=round(float(g_total_ref), 4),
        g_ms2=round(float(g_val), 4),
    )


@router.post(
    "/{well_id}/run-anti-collision",
    response_model=AntiCollisionScanResponse,
    summary="Trigger Anti-Collision scan for wellbore against an offset well",
)
def run_anti_collision_endpoint(
    well_id: str,
    req: AntiCollisionScanRequest,
    db: Session = Depends(get_db),
):
    """Trigger 3D Anti-Collision clearance scan using ISCWSA error models and EOU."""
    stations = read_well_stations(well_id, db)
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