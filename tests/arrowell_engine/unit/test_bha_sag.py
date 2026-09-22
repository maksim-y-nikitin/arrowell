"""Unit tests for analytical BHA gravity sag mechanics and boundary contacts."""

from arrowell_engine.sag.beam import (
    BhaComponent,
    ComponentMaterial,
    StabilizerBlade,
    calculate_bha_sag,
)


def test_sag_zero_at_low_inclination():
    """In straight vertical intervals (Inc < 5.0 deg), sag deflection must be bypassed."""
    components = [
        BhaComponent(od_m=0.2159, id_m=0.05, length_m=0.5, material=ComponentMaterial.STEEL),
        BhaComponent(od_m=0.17145, id_m=0.0714, length_m=10.0, material=ComponentMaterial.NM_STEEL),
    ]
    stabilizers = [StabilizerBlade(blade_od_m=0.214, dist_from_bit_m=12.0, length_m=1.0)]

    res = calculate_bha_sag(
        components=components,
        stabilizers=stabilizers,
        sensor_dist_from_bit_m=10.0,
        hole_diameter_m=0.2159,
        inclination_deg=2.0,
    )
    assert res.sag_correction_deg == 0.0
    assert res.corrected_inc_deg == 2.0
    assert res.iscwsa_qc_pass is True


def test_sag_deviated_beam_deflection():
    """Verify calculated deflection for deviated well with short stabilizer blade."""
    components = [
        BhaComponent(od_m=0.2159, id_m=0.05, length_m=0.5, material=ComponentMaterial.STEEL),
        BhaComponent(od_m=0.17145, id_m=0.0714, length_m=10.0, material=ComponentMaterial.NM_STEEL),
        BhaComponent(od_m=0.17145, id_m=0.0714, length_m=30.0, material=ComponentMaterial.STEEL),
    ]
    stabilizers = [
        StabilizerBlade(blade_od_m=0.2159, dist_from_bit_m=1.8, length_m=0.25),
        StabilizerBlade(blade_od_m=0.2120, dist_from_bit_m=12.0, length_m=1.0),
    ]

    res = calculate_bha_sag(
        components=components,
        stabilizers=stabilizers,
        sensor_dist_from_bit_m=10.0,
        hole_diameter_m=0.2159,
        inclination_deg=75.0,
        dls_deg_30m=2.0,
        mud_density_kg_m3=1250.0,
        iscwsa_model_name="ISCWSA_MWD_SAG_REV4",
    )

    assert res.is_converged is True
    assert 0.05 <= abs(res.sag_correction_deg) <= 0.60
    assert res.residual_sag_unc_1sigma_deg == 0.08
    assert res.iscwsa_qc_pass is True