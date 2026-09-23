"""Initial database seeding script with realistic oilfield survey data."""

import math
from typing import List

import numpy as np
from sqlalchemy import select
from sqlalchemy.orm import Session

from models.wellbore import Field, Pad, Well, SurveyStation, GeomagneticReference
from schemas.survey import SurveyStationBase, RawStationSensorSchema
from services.directional import calculate_trajectory_mwdcore


def _generate_synthetic_telemetry(
    station_count: int = 150,
    b_total_ref: float = 52480.0,
    dip_ref: float = 72.15,
    declination: float = 12.42,
    grid_convergence: float = 1.25,
) -> List[SurveyStationBase]:
    """
    Generate realistic directional surveys corrupted by drillstring magnetization and sensor noise.

    Args:
        station_count: Total number of survey stations to synthesize.
        b_total_ref: Reference geomagnetic total field intensity in nanoTesla.
        dip_ref: Reference geomagnetic dip angle in degrees.
        declination: Magnetic declination angle in degrees.
        grid_convergence: Grid convergence angle in degrees.

    Returns:
        List of synthesized SurveyStationBase instances with corrupted telemetry.
    """
    stations: List[SurveyStationBase] = []
    rng = np.random.default_rng(seed=42)

    g_noise = rng.normal(0.0, 0.0012, size=(station_count, 3))
    b_noise = rng.normal(0.0, 22.0, size=(station_count, 3))

    mag_grid_shift = declination - grid_convergence

    for k in range(station_count):
        md = round(float(k * 30.0), 1)

        if k == 0:
            true_inc = 0.0
            true_azim = 0.0
        elif k < 30:
            true_inc = 0.05 + 0.75 * (k / 29.0)
            true_azim = 42.0 + 8.0 * math.sin(k * 0.2)
        elif k <= 80:
            frac = (k - 30.0) / 50.0
            smooth_frac = 0.5 * (1.0 - math.cos(math.pi * frac))
            true_inc = 0.8 + 89.0 * smooth_frac
            true_azim = 52.0 + 3.0 * frac
        else:
            true_inc = 90.0 + 1.2 * math.sin((k - 80.0) * 0.25)
            true_azim = 55.0 + 0.8 * math.cos((k - 80.0) * 0.2)

        tf = (k * 53.7) % 360.0

        inc_rad = math.radians(true_inc)
        azim_rad = math.radians(true_azim)
        tf_rad = math.radians(tf)
        dip_rad = math.radians(dip_ref)

        sini = math.sin(inc_rad)
        cosi = math.cos(inc_rad)
        sina = math.sin(azim_rad)
        cosa = math.cos(azim_rad)
        sintf = math.sin(tf_rad)
        costf = math.cos(tf_rad)
        sind = math.sin(dip_rad)
        cosd = math.cos(dip_rad)

        clean_gx = -1.0 * sini * sintf
        clean_gy = -1.0 * sini * costf
        clean_gz = 1.0 * cosi

        bh = b_total_ref * cosd
        bv = b_total_ref * sind

        clean_bx = bh * (cosi * cosa * sintf + sina * costf) - bv * sini * sintf
        clean_by = bh * (cosi * cosa * costf - sina * sintf) - bv * sini * costf
        clean_bz = bh * sini * cosa + bv * cosi

        mbz_interference = 420.0 + 40.0 * math.sin(k * 0.08)
        mbx_bias = 25.0 * math.cos(k * 0.15)
        mby_bias = -20.0 * math.sin(k * 0.15)
        abz_bias = -0.0018

        gx = round(clean_gx + g_noise[k, 0], 5)
        gy = round(clean_gy + g_noise[k, 1], 5)
        gz = round(clean_gz + abz_bias + g_noise[k, 2], 5)

        bx = round(clean_bx + mbx_bias + b_noise[k, 0], 1)
        by = round(clean_by + mby_bias + b_noise[k, 1], 1)
        bz = round(clean_bz * 1.0015 + mbz_interference + b_noise[k, 2], 1)

        if k == 0:
            raw_inc = 0.0
            raw_azim = 0.0
        else:
            g_xy = math.hypot(gx, gy)
            raw_inc = round(math.degrees(math.atan2(g_xy, gz)), 2)

            g_total = math.sqrt(gx**2 + gy**2 + gz**2)
            ew = (gx * by - gy * bx) * g_total
            ns = bz * (gx**2 + gy**2) - gz * (gx * bx + gy * by)

            raw_mag_azim = math.degrees(math.atan2(ew, ns)) % 360.0
            raw_azim = round((raw_mag_azim + mag_grid_shift) % 360.0, 2)

        stations.append(
            SurveyStationBase(
                md=md,
                inc=raw_inc,
                azim=raw_azim,
                sensor=RawStationSensorSchema(
                    gx=gx, gy=gy, gz=gz,
                    bx=bx, by=by, bz=bz,
                ),
            )
        )

    return stations


def seed_database(db: Session) -> None:
    """
    Check if the database is empty and populate it with initial sample wellbores and stations.

    Args:
        db: Scoped database session.
    """
    existing_field = db.scalar(select(Field).limit(1))
    if existing_field is not None:
        return

    field = Field(
        id="field-samotlor",
        name="Samotlor Oil Field",
        name_ru="Самотлорское месторождение",
        country="Russia",
        basin="West Siberian Basin",
    )
    db.add(field)

    pad = Pad(
        id="pad-10",
        field_id="field-samotlor",
        name="Cluster Pad 10-bis",
        latitude=61.1245,
        longitude=76.7132,
        ground_elevation=48.5,
        datum="MSL WGS84",
    )
    db.add(pad)

    geo_ref = GeomagneticReference(
        pad_id="pad-10",
        model="WMM 2025",
        b_total_ref=52480.0,
        dip_ref=72.15,
        declination=12.42,
        grid_convergence=1.25,
        g_total_ref=1.0000,
        tolerance_g=0.005,
        tolerance_b=200.0,
        tolerance_dip=0.30,
    )
    db.add(geo_ref)

    well = Well(
        id="well-102h",
        pad_id="pad-10",
        name="Well 102-H (Achimov Lateral)",
        uwi="RU-SAM-P10-102H",
        slot="Slot #4",
        status="active",
        target_formation="BV8 (Achimov Deep Sand)",
        datum_elevation=54.2,
        proposal_azimuth=55.0,
    )
    db.add(well)
    db.commit()

    base_stations = _generate_synthetic_telemetry(
        station_count=150,
        b_total_ref=52480.0,
        dip_ref=72.15,
        declination=12.42,
        grid_convergence=1.25,
    )

    calc_res = calculate_trajectory_mwdcore(
        stations=base_stations,
        proposal_azimuth=55.0,
        declination_deg=12.42,
        grid_convergence_deg=1.25,
        b_total_ref=52480.0,
        dip_ref_deg=72.15,
        well_id="well-102h",
    )

    for stn in calc_res.stations:
        db_stn = SurveyStation(
            well_id="well-102h",
            md=stn.md,
            inc=stn.inc,
            azim=stn.azim,
            tvd=stn.tvd,
            northing=stn.northing,
            easting=stn.easting,
            dls=stn.dls,
            vs=stn.vs,
            closure_dist=stn.closure_dist,
            closure_azim=stn.closure_azim,
            gx=stn.sensor.gx,
            gy=stn.sensor.gy,
            gz=stn.sensor.gz,
            bx=stn.sensor.bx,
            by=stn.sensor.by,
            bz=stn.sensor.bz,
            g_total=stn.g_total,
            b_total=stn.b_total,
            dip_angle=stn.dip_angle,
            delta_g=stn.delta_g,
            delta_b=stn.delta_b,
            delta_dip=stn.delta_dip,
            is_qc_pass=stn.is_qc_pass,
            status=stn.status,
        )
        db.add(db_stn)

    db.commit()