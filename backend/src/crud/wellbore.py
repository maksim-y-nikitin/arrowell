import math
from typing import List, Optional

import numpy as np
from sqlalchemy import select, delete
from sqlalchemy.orm import Session, selectinload

from arrowell_engine.trajectory.mcm import calculate_mcm_trajectory
from models.wellbore import Field, Pad, Well, SurveyStation, GeomagneticReference


def get_full_hierarchy(db: Session) -> List[Field]:
    stmt = (
        select(Field)
        .options(selectinload(Field.pads).selectinload(Pad.wells))
        .order_by(Field.name)
    )
    return list(db.scalars(stmt).all())


def get_well_by_id(db: Session, well_id: str) -> Optional[Well]:
    stmt = select(Well).where(Well.id == well_id)
    return db.scalar(stmt)


def get_geomag_ref_by_pad_id(db: Session, pad_id: str) -> Optional[GeomagneticReference]:
    stmt = select(GeomagneticReference).where(GeomagneticReference.pad_id == pad_id)
    return db.scalar(stmt)


def get_stations_by_well(
    db: Session,
    well_id: str,
    survey_type: Optional[str] = None
) -> List[SurveyStation]:
    stmt = select(SurveyStation).where(SurveyStation.well_id == well_id)
    if survey_type:
        stmt = stmt.where(SurveyStation.survey_type == survey_type)
    stmt = stmt.order_by(SurveyStation.md)
    return list(db.scalars(stmt).all())


def create_survey_station(db: Session, station_data: dict) -> SurveyStation:
    station = SurveyStation(**station_data)
    db.add(station)
    db.commit()
    db.refresh(station)
    return station


def delete_survey_station(db: Session, station_id: int, well_id: str) -> bool:
    stmt = select(SurveyStation).where(
        SurveyStation.id == station_id,
        SurveyStation.well_id == well_id,
    )
    station = db.scalar(stmt)
    if not station:
        return False

    del_children = delete(SurveyStation).where(
        SurveyStation.well_id == well_id,
        SurveyStation.parent_station_id == station_id,
    )
    db.execute(del_children)

    db.delete(station)
    db.commit()
    return True


def clear_corrected_stations(db: Session, well_id: str) -> None:
    stmt = delete(SurveyStation).where(
        SurveyStation.well_id == well_id,
        SurveyStation.survey_type == "corrected",
    )
    db.execute(stmt)
    db.commit()


def sync_survey_set_trajectory(
    db: Session,
    well_id: str,
    survey_type: str = "raw",
    proposal_azimuth: float = 55.0,
) -> List[SurveyStation]:
    from core.settings import settings

    well = get_well_by_id(db, well_id)
    geo_ref = get_geomag_ref_by_pad_id(db, well.pad_id) if well else None

    b_ref = geo_ref.b_total_ref if geo_ref else settings.DEFAULT_B_TOTAL_REF
    dip_ref = geo_ref.dip_ref if geo_ref else settings.DEFAULT_DIP_REF
    g_ref = geo_ref.g_total_ref if geo_ref else 1.0000
    tol_g = geo_ref.tolerance_g if geo_ref else 0.005
    tol_b = geo_ref.tolerance_b if geo_ref else 200.0
    tol_dip = geo_ref.tolerance_dip if geo_ref else 0.30

    stations = get_stations_by_well(db, well_id, survey_type=survey_type)
    if not stations:
        return []

    mds = np.array([s.md for s in stations], dtype=np.float64)
    incs = np.array([s.inc for s in stations], dtype=np.float64)
    azims = np.array([s.azim for s in stations], dtype=np.float64)

    traj = calculate_mcm_trajectory(
        md=mds,
        inc_deg=incs,
        azim_deg=azims,
        proposal_azimuth_deg=proposal_azimuth,
        tie_in=(0.0, 0.0, 0.0),
    )

    for i, s in enumerate(stations):
        s.tvd = round(float(traj.tvd[i]), 2)
        s.northing = round(float(traj.northing[i]), 2)
        s.easting = round(float(traj.easting[i]), 2)
        s.dls = round(float(traj.dls[i]), 2)
        s.vs = round(float(traj.vertical_section[i]), 2)
        s.closure_dist = round(float(traj.closure_dist[i]), 2)
        s.closure_azim = round(float(traj.closure_azim[i]), 2)

        s.g_total = round(float(math.sqrt(s.gx**2 + s.gy**2 + s.gz**2)), 4)
        s.b_total = round(float(math.hypot(s.bx, s.by, s.bz)), 1)
        g_len = math.sqrt(s.gx ** 2 + s.gy ** 2 + s.gz ** 2) or 1.0
        b_len = math.hypot(s.bx, s.by, s.bz) or 1.0
        dot_gb = (s.gx * s.bx + s.gy * s.by + s.gz * s.bz) / (g_len * b_len)
        dot_gb = max(-1.0, min(1.0, dot_gb))
        s.dip_angle = round(float(math.degrees(math.asin(dot_gb))), 2)

        s.delta_g = round(s.g_total - g_ref, 4)
        s.delta_b = round(s.b_total - b_ref, 1)
        s.delta_dip = round(s.dip_angle - dip_ref, 2)

        s.is_qc_pass = bool(
            abs(s.delta_g) <= tol_g and
            abs(s.delta_b) <= tol_b and
            abs(s.delta_dip) <= tol_dip
        )

    db.commit()
    return stations