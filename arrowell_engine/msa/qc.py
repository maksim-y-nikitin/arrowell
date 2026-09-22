"""Quality Control (QC) filtering and boundary validation for MWD surveys.

Calculates multi-sigma acceptance bands for G_total, B_total, and Dip angle
considering both downhole sensor uncertainty and chosen geomagnetic reference model.
"""

import math
from dataclasses import dataclass

from ..geomag.specs import GeomagneticUncertaintySpec, GEOMAG_ERROR_MODELS, ModelFamily


@dataclass(slots=True, frozen=True)
class SurveyQcThresholds:
    delta_g_max: float    # Max allowable |G_total - G_ref|
    delta_b_max: float    # Max allowable |B_total - B_ref| in nT
    delta_dip_max: float  # Max allowable |Dip - Dip_ref| in deg


@dataclass(slots=True, frozen=True)
class SurveyQcEvaluation:
    is_valid_g: bool
    is_valid_b: bool
    is_valid_dip: bool
    is_overall_pass: bool
    status_label: str


def compute_qc_thresholds(
    model_family: ModelFamily = ModelFamily.WMM,
    num_sigma: float = 2.5,
) -> SurveyQcThresholds:
    """Compute acceptance window boundaries based on model uncertainty.

    Total allowable variance is the sum of reference field model error
    and MWD sensor noise: sigma_total = sqrt(sigma_ref^2 + sigma_noise^2).
    """
    spec: GeomagneticUncertaintySpec = GEOMAG_ERROR_MODELS.get(
        model_family, GEOMAG_ERROR_MODELS[ModelFamily.WMM]
    )

    sigma_g = math.sqrt(spec.mgi**2 + spec.gre**2)
    sigma_b = math.sqrt(spec.mbi**2 + spec.bre**2)
    sigma_dip_rad = math.sqrt(spec.mdi**2 + spec.dre**2)

    return SurveyQcThresholds(
        delta_g_max=round(num_sigma * sigma_g, 4),
        delta_b_max=round(num_sigma * sigma_b, 1),
        delta_dip_max=round(num_sigma * math.degrees(sigma_dip_rad), 2),
    )


def evaluate_survey_station_qc(
    g_total: float,
    b_total: float,
    dip_deg: float,
    g_ref: float,
    b_ref: float,
    dip_ref_deg: float,
    thresholds: SurveyQcThresholds,
) -> SurveyQcEvaluation:
    """Validate a single survey station against reference boundaries."""
    delta_g = abs(g_total - g_ref)
    delta_b = abs(b_total - b_ref)
    delta_dip = abs(dip_deg - dip_ref_deg)

    pass_g = delta_g <= thresholds.delta_g_max
    pass_b = delta_b <= thresholds.delta_b_max
    pass_dip = delta_dip <= thresholds.delta_dip_max

    is_pass = pass_g and pass_b and pass_dip

    if is_pass:
        label = "QC Pass"
    elif not pass_g:
        label = "QC Fail (Gravity)"
    elif not pass_b or not pass_dip:
        label = "QC Warning (Magnetic)"
    else:
        label = "QC Fail"

    return SurveyQcEvaluation(
        is_valid_g=pass_g,
        is_valid_b=pass_b,
        is_valid_dip=pass_dip,
        is_overall_pass=is_pass,
        status_label=label,
    )