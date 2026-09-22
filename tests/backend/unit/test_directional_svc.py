"""Unit tests for backend directional service layer and Pydantic validation."""

from schemas.survey import SurveyStationBase, BhaConfigSchema
from services.directional import (
    calculate_trajectory_mwdcore,
    calculate_well_sag_mwdcore,
)


def test_directional_service_trajectory():
    """Verify trajectory computation via service layer adapter."""
    stations = [
        SurveyStationBase(md=1000.0, inc=15.0, azim=45.0),
        SurveyStationBase(md=1030.0, inc=18.0, azim=47.0),
        SurveyStationBase(md=1060.0, inc=21.0, azim=48.0),
        SurveyStationBase(md=1090.0, inc=25.0, azim=50.0),
    ]
    calc_res = calculate_trajectory_mwdcore(
        stations=stations,
        declination_deg=13.5,
        grid_convergence_deg=1.8,
        b_total_ref=58200.0,
        dip_ref_deg=78.2,
    )
    assert calc_res.station_count == 4
    assert calc_res.stations[0].dls == 0.0
    assert calc_res.stations[-1].tvd > 0.0


def test_directional_service_sag():
    """Verify BHA sag calculation via service layer adapter."""
    stations = [
        SurveyStationBase(md=1000.0, inc=30.0, azim=45.0),
        SurveyStationBase(md=1030.0, inc=50.0, azim=45.0),
        SurveyStationBase(md=1060.0, inc=75.0, azim=45.0),
    ]
    calc_res = calculate_trajectory_mwdcore(stations=stations)
    bha_cfg = BhaConfigSchema(
        collar_od_mm=171.45,
        collar_id_mm=71.4,
        bha_material="nm_steel",
        sensor_to_bit_m=12.5,
        stabilizer_dist_m=9.0,
        mud_weight_gcm3=1.22,
    )
    sag_res = calculate_well_sag_mwdcore(
        stations=calc_res.stations,
        bha_config=bha_cfg,
    )
    assert sag_res.status == "success"
    assert len(sag_res.corrections) == 3