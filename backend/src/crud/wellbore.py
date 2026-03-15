"""Database CRUD operations for fields, pads, wells, and survey stations."""

from typing import List, Optional

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from models.wellbore import Field, Pad, Well, SurveyStation
from schemas.survey import SurveyStationBase, RawStationSensorSchema


def get_full_hierarchy(db: Session) -> List[Field]:
    """Retrieve all fields with eagerly loaded pads and wells."""
    stmt = (
        select(Field)
        .options(
            selectinload(Field.pads).selectinload(Pad.wells)
        )
        .order_by(Field.name)
    )
    return list(db.scalars(stmt).all())


def get_well_by_id(db: Session, well_id: str) -> Optional[Well]:
    """Retrieve a single wellbore by its unique identifier."""
    stmt = select(Well).where(Well.id == well_id)
    return db.scalar(stmt)


def get_stations_by_well(db: Session, well_id: str) -> List[SurveyStation]:
    """Retrieve all survey stations for a specific wellbore ordered by measured depth."""
    stmt = (
        select(SurveyStation)
        .where(SurveyStation.well_id == well_id)
        .order_by(SurveyStation.md)
    )
    return list(db.scalars(stmt).all())


def create_survey_station(db: Session, station_data: dict) -> SurveyStation:
    """Insert a new directional survey station into the database."""
    station = SurveyStation(**station_data)
    db.add(station)
    db.commit()
    db.refresh(station)
    return station


def get_station_by_id(db: Session, station_id: int) -> Optional[SurveyStation]:
    """Retrieve a single survey station by its primary key ID."""
    stmt = select(SurveyStation).where(SurveyStation.id == station_id)
    return db.scalar(stmt)


def delete_survey_station(db: Session, station_id: int, well_id: str) -> bool:
    """Delete a directional survey station by ID and well identifier."""
    stmt = select(SurveyStation).where(
        SurveyStation.id == station_id,
        SurveyStation.well_id == well_id,
    )
    station = db.scalar(stmt)
    if not station:
        return False
    db.delete(station)
    db.commit()
    return True


def sync_well_trajectory(
    db: Session,
    well_id: str,
    proposal_azimuth: float = 55.0,
) -> List[SurveyStation]:
    """
    Recalculate cumulative 3D Minimum Curvature Method (MCM) trajectory
    and QA/QC residuals for all stations in a wellbore, updating persistent DB entities.
    """
    from services.directional import calculate_trajectory_mwdcore

    db_stations = get_stations_by_well(db, well_id)
    if not db_stations:
        return []

    input_stations = [
        SurveyStationBase(
            md=s.md,
            inc=s.inc,
            azim=s.azim,
            sensor=RawStationSensorSchema(
                gx=s.gx, gy=s.gy, gz=s.gz,
                bx=s.bx, by=s.by, bz=s.bz,
            ),
        )
        for s in db_stations
    ]

    calc_res = calculate_trajectory_mwdcore(
        stations=input_stations,
        proposal_azimuth=proposal_azimuth,
        well_id=well_id,
    )

    # db_stations and calc_res.stations are guaranteed to match 1:1 sorted by MD
    for db_stn, computed in zip(db_stations, calc_res.stations):
        db_stn.tvd = computed.tvd
        db_stn.northing = computed.northing
        db_stn.easting = computed.easting
        db_stn.dls = computed.dls
        db_stn.vs = computed.vs
        db_stn.closure_dist = computed.closure_dist
        db_stn.closure_azim = computed.closure_azim
        db_stn.g_total = computed.g_total
        db_stn.b_total = computed.b_total
        db_stn.dip_angle = computed.dip_angle
        db_stn.delta_g = computed.delta_g
        db_stn.delta_b = computed.delta_b
        db_stn.delta_dip = computed.delta_dip
        db_stn.is_qc_pass = computed.is_qc_pass
        db_stn.status = computed.status

    db.commit()
    return db_stations