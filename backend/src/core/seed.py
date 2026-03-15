"""Initial database seeding script with realistic oilfield survey data."""

from sqlalchemy import select
from sqlalchemy.orm import Session

from models.wellbore import Field, Pad, Well, SurveyStation, GeomagneticReference
from schemas.survey import SurveyStationBase, RawStationSensorSchema
from services.directional import calculate_trajectory_mwdcore


def seed_database(db: Session) -> None:
    """Check if the database is empty and populate it with initial sample wellbores."""
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
    )
    db.add(well)
    db.commit()

    raw_surveys = [
        (0.0, 0.0, 0.0, 0.0, 0.0, 1.0, 16120.0, 0.0, 49950.0),
        (150.0, 0.12, 42.1, 0.001, 0.001, 0.9999, 16125.0, 80.0, 49948.0),
        (320.0, 0.25, 45.3, 0.002, 0.003, 0.9999, 16110.0, 120.0, 49952.0),
        (500.0, 0.38, 46.0, 0.003, 0.004, 0.9998, 16130.0, 95.0, 49945.0),
        (710.0, 0.52, 48.2, 0.004, 0.006, 0.9998, 16140.0, 150.0, 49940.0),
        (900.0, 0.85, 50.1, 0.007, 0.010, 0.9997, 16115.0, 190.0, 49960.0),
        (1020.0, 4.2, 51.5, 0.038, 0.062, 0.9972, 16210.0, 410.0, 50220.0),
        (1150.0, 9.8, 52.0, 0.088, 0.144, 0.9855, 16350.0, 750.0, 50450.0),
        (1280.0, 15.5, 52.2, 0.140, 0.228, 0.9636, 16480.0, 1100.0, 50680.0),
        (1410.0, 21.4, 52.5, 0.191, 0.312, 0.9310, 16620.0, 1490.0, 50850.0),
        (1540.0, 28.0, 52.7, 0.248, 0.398, 0.8830, 16790.0, 1850.0, 50980.0),
        (1670.0, 35.2, 53.0, 0.303, 0.490, 0.8171, 16950.0, 2200.0, 51150.0),
        (1800.0, 43.1, 53.2, 0.358, 0.582, 0.7302, 17100.0, 2540.0, 51320.0),
        (1930.0, 51.5, 53.4, 0.408, 0.668, 0.6225, 17240.0, 2890.0, 51480.0),
        (2060.0, 60.2, 53.8, 0.450, 0.742, 0.4970, 17350.0, 3200.0, 51640.0),
        (2190.0, 69.4, 54.0, 0.481, 0.800, 0.3518, 17450.0, 3510.0, 51780.0),
        (2320.0, 78.5, 54.2, 0.501, 0.840, 0.1994, 17520.0, 3780.0, 51920.0),
        (2450.0, 86.8, 54.5, 0.510, 0.860, 0.0558, 17580.0, 3950.0, 52020.0),
        (2560.0, 89.8, 54.8, 0.513, 0.866, 0.0035, 17610.0, 4050.0, 52120.0),
        (2680.0, 90.2, 55.0, 0.512, 0.865, -0.0035, 17630.0, 4100.0, 52180.0),
        (2800.0, 89.5, 55.2, 0.513, 0.866, 0.0087, 17640.0, 4150.0, 52210.0),
        (2920.0, 90.5, 55.4, 0.511, 0.864, -0.0087, 17650.0, 4200.0, 52260.0),
        (3050.0, 91.1, 55.7, 0.510, 0.863, -0.0192, 17660.0, 4250.0, 52310.0),
        (3180.0, 89.8, 55.9, 0.513, 0.866, 0.0035, 17670.0, 4300.0, 52350.0),
        (3300.0, 90.2, 56.1, 0.512, 0.865, -0.0035, 17680.0, 4340.0, 52390.0),
        (3420.0, 90.0, 56.3, 0.513, 0.865, 0.0, 17690.0, 4380.0, 52420.0),
    ]

    base_stations = [
        SurveyStationBase(
            md=item[0],
            inc=item[1],
            azim=item[2],
            sensor=RawStationSensorSchema(
                gx=item[3], gy=item[4], gz=item[5],
                bx=item[6], by=item[7], bz=item[8],
            )
        )
        for item in raw_surveys
    ]

    calc_res = calculate_trajectory_mwdcore(
        stations=base_stations,
        proposal_azimuth=55.0,
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