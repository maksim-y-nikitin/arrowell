"""Pydantic schemas for directional survey stations and sensor telemetry."""

from typing import List, Optional

from pydantic import BaseModel, ConfigDict, Field


class RawStationSensorSchema(BaseModel):
    """Raw tri-axial sensor readings from MWD tool."""
    gx: float = Field(..., description="Accelerometer X-axis (g)")
    gy: float = Field(..., description="Accelerometer Y-axis (g)")
    gz: float = Field(..., description="Accelerometer Z-axis (g)")
    bx: float = Field(..., description="Magnetometer X-axis (nT)")
    by: float = Field(..., description="Magnetometer Y-axis (nT)")
    bz: float = Field(..., description="Magnetometer Z-axis (nT)")


class SurveyStationBase(BaseModel):
    """Base directional survey attributes."""
    md: float = Field(..., description="Measured Depth (m)", ge=0.0)
    inc: float = Field(..., description="Inclination (degrees)", ge=0.0, le=180.0)
    azim: float = Field(..., description="Azimuth (degrees)", ge=0.0, lt=360.0)
    sensor: Optional[RawStationSensorSchema] = Field(
        default=None,
        description="Raw tri-axial sensor readings from MWD tool"
    )


class SurveyStationCreate(SurveyStationBase):
    """Payload for adding a new directional survey station."""
    well_id: Optional[str] = None


class SurveyStationResponse(SurveyStationBase):
    """Full station payload returned to frontend clients."""
    id: int
    well_id: str

    # Calculated trajectory parameters
    tvd: float = Field(0.0, description="True Vertical Depth (m)")
    northing: float = Field(0.0, description="North/South coordinate (+N/-S)")
    easting: float = Field(0.0, description="East/West coordinate (+E/-W)")
    dls: float = Field(0.0, description="Dogleg Severity (deg/30m)")
    vs: float = Field(0.0, description="Vertical Section (m)")
    closure_dist: float = Field(0.0, description="Closure Distance (m)")
    closure_azim: float = Field(0.0, description="Closure Azimuth (degrees)")
    sensor: RawStationSensorSchema
    g_total: float = Field(1.0, description="Total gravity field (g)")
    b_total: float = Field(52480.0, description="Total magnetic field (nT)")
    dip_angle: float = Field(72.15, description="Magnetic dip angle (degrees)")
    delta_g: float = Field(0.0, description="Gravity residual delta (g)")
    delta_b: float = Field(0.0, description="Magnetic residual delta (nT)")
    delta_dip: float = Field(0.0, description="Dip residual delta (degrees)")

    is_qc_pass: bool = Field(True, description="QC acceptance status")
    status: str = Field("Raw", description="Station processing status")

    model_config = ConfigDict(from_attributes=True)


class TrajectoryCalculationRequest(BaseModel):
    """Request payload for on-the-fly trajectory recalculation."""
    proposal_azimuth: float = Field(45.0, description="Vertical section projection azimuth (degrees)")
    stations: List[SurveyStationBase]


class TrajectoryCalculationResponse(BaseModel):
    """Response payload containing calculated 3D trajectory points."""
    station_count: int
    total_md: float
    total_tvd: float
    max_dls: float
    stations: List[SurveyStationResponse]

class BhaConfigSchema(BaseModel):
    """BHA and drilling fluid configuration parameters for SAG correction."""
    collar_od_mm: float = Field(171.5, description="Collar outer diameter in mm (e.g. 171.5 for 6-3/4\")")
    collar_id_mm: float = Field(71.4, description="Collar inner diameter in mm")
    sensor_to_bit_m: float = Field(14.2, description="Distance from drill bit to MWD sensor in meters")
    stabilizer_dist_m: float = Field(21.5, description="Distance from drill bit to first stabilizer in meters")
    mud_weight_gcm3: float = Field(1.20, description="Drilling fluid density in g/cm3")
    bha_material: str = Field("nm_steel", description="Collar material: 'nm_steel' or 'steel'")


class SagStationCorrection(BaseModel):
    """Station-by-station BHA Sag deflection correction result."""
    station_id: int
    md: float
    raw_inc: float
    sag_correction_deg: float
    corrected_inc: float
    valid: bool


class SagCalculationResponse(BaseModel):
    """Full wellbore SAG correction analysis response."""
    status: str
    well_id: str
    mud_weight_gcm3: float
    peak_sag_deg: float
    stations_corrected: int
    corrections: List[SagStationCorrection]
