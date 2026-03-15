"""Survey calculation and telemetry API router powered by mwdstdcore."""

from fastapi import APIRouter

from schemas.survey import (
    TrajectoryCalculationRequest,
    TrajectoryCalculationResponse,
)
from services.directional import calculate_trajectory_mwdcore

router = APIRouter(prefix="/surveys", tags=["Directional Surveys"])


@router.post(
    "/calculate-trajectory",
    response_model=TrajectoryCalculationResponse,
    summary="Calculate 3D trajectory using mwdstdcore Minimum Curvature Method",
)
def compute_trajectory(payload: TrajectoryCalculationRequest):
    """Takes inclination and azimuth stations and returns calculated 3D coordinates via mwdstdcore."""
    return calculate_trajectory_mwdcore(
        stations=payload.stations,
        proposal_azimuth=payload.proposal_azimuth,
    )