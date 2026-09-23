"""Database CRUD operations for fields, pads, wells, and survey stations."""

from typing import List, Optional

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from models.wellbore import Field, Pad, Well, SurveyStation, GeomagneticReference
from schemas.survey import SurveyStationBase, RawStationSensorSchema


def get_full_hierarchy(db: Session) -> List[Field]:
    """
    Retrieve all fields with eagerly loaded pads and wells.

    Args:
        db: Scoped database session.

    Returns:
        List of Field entities with populated hierarchy relations.
    """
    stmt = (
        select(Field)
        .options(
            selectinload(Field.pads).selectinload(Pad.wells)
        )
        .order_by(Field.name)
    )
    return list(db.scalars(stmt).all())


def get_well_by_id(db: Session, well_id: str) -> Optional[Well]:
    """
    Retrieve a single wellbore by its unique identifier.

    Args:
        db: Scoped database session.
        well_id: Unique identifier string of the wellbore.

    Returns:
        Well entity or None if not found.
    """
    stmt = select(Well).where(Well.id == well_id)
    return db.scalar(stmt)


def get_geomag_ref_by_pad_id(db: Session, pad_id: str) -> Optional[GeomagneticReference]:
    """
    Retrieve geomagnetic reference parameters for a specific pad identifier.

    Args:
        db: Scoped database session.
        pad_id: Unique identifier string of the drilling pad.

    Returns:
        GeomagneticReference entity or None if not found.
    """
    stmt = select(GeomagneticReference).where(GeomagneticReference.pad_id == pad_id)
    return db.scalar(stmt)


def get_stations_by_well(db: Session, well_id: str) -> List[SurveyStation]:
    """
    Retrieve all survey stations for a specific wellbore ordered by measured depth.

    Args:
        db: Scoped database session.
        well_id: Unique identifier string of the wellbore.

    Returns:
        List of SurveyStation entities ordered by measured depth.
    """
    stmt = (
        select(SurveyStation)
        .where(SurveyStation.well_id == well_id)
        .order_by(SurveyStation.md)
    )
    return list(db.scalars(stmt).all())


def create_survey_station(db: Session, station_data: dict) -> SurveyStation:
    """
    Insert a new directional survey station into the database.

    Args:
        db: Scoped database session.
        station_data: Dictionary of survey station attributes.

    Returns:
        Newly created SurveyStation entity.
    """
    station = SurveyStation(**station_data)
    db.add(station)
    db.commit()
    db.refresh(station)
    return station


def get_station_by_id(db: Session, station_id: int) -> Optional[SurveyStation]:
    """
    Retrieve a single survey station by its primary key ID.

    Args:
        db: Scoped database session.
        station_id: Integer primary key ID of the station.

    Returns:
        SurveyStation entity or None if not found.
    """
    stmt = select(SurveyStation).where(SurveyStation.id == station_id)
    return db.scalar(stmt)


def delete_survey_station(db: Session, station_id: int, well_id: str) -> bool:
    """
    Delete a directional survey station by ID and well identifier.

    Args:
        db: Scoped database session.
        station_id: Integer primary key ID of the station.
        well_id: Unique identifier string of the wellbore.

    Returns:
        Boolean flag indicating whether deletion succeeded.
    """
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
    Recalculate 3D trajectory and QA/QC residuals using pad geomagnetic reference parameters.

    Args:
        db: Scoped database session.
        well_id: Unique identifier of the target wellbore.
        proposal_azimuth: Proposal azimuth projection angle in degrees.

    Returns:
        List of updated persistent SurveyStation database entities.
    """
    from services.directional import calculate_trajectory_mwdcore
    from core.settings import settings

    well = get_well_by_id(db, well_id)
    geo_ref = get_geomag_ref_by_pad_id(db, well.pad_id) if well else None

    b_ref = geo_ref.b_total_ref if geo_ref else settings.DEFAULT_B_TOTAL_REF
    dip_ref = geo_ref.dip_ref if geo_ref else settings.DEFAULT_DIP_REF
    dec = geo_ref.declination if geo_ref else settings.DEFAULT_DECLINATION
    grid = geo_ref.grid_convergence if geo_ref else settings.DEFAULT_GRID_CONVERGENCE

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
        declination_deg=dec,
        grid_convergence_deg=grid,
        b_total_ref=b_ref,
        dip_ref_deg=dip_ref,
        well_id=well_id,
    )

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