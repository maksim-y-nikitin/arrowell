"""Pydantic schemas for directional survey stations, telemetry, and 3D uncertainty.

Powered by arrowell_engine.
"""

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


# =====================================================================
# ISCWSA 3D ELLIPSOID OF UNCERTAINTY SCHEMA (arrowell_engine)
# =====================================================================
class EouResponseSchema(BaseModel):
    """3D Ellipsoid of Uncertainty (EOU) parameters calculated by arrowell_engine."""
    semi_major: float = Field(..., description="3D Maximum semi-axis in meters")
    semi_intermediate: float = Field(..., description="3D Intermediate semi-axis in meters")
    semi_minor: float = Field(..., description="3D Minimum semi-axis in meters")
    horiz_semi_major: float = Field(..., description="Horizontal projection major axis in meters")
    horiz_semi_minor: float = Field(..., description="Horizontal projection minor axis in meters")
    horiz_azimuth: float = Field(..., description="Horizontal ellipse azimuth in degrees")
    eigenvectors: List[List[float]] = Field(..., description="3x3 rotation modal matrix from eigen-decomposition")


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

    # 3D Ellipsoid of Uncertainty from arrowell_engine
    eou: Optional[EouResponseSchema] = None

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


# =====================================================================
# ANTI-COLLISION & ISCWSA SEPARATION FACTOR SCHEMAS
# =====================================================================
class OffsetStationInput(BaseModel):
    """Input survey coordinates for an offset wellbore station."""
    md: float = Field(..., description="Measured Depth in meters", ge=0.0)
    inc: Optional[float] = Field(0.0, description="Inclination in degrees", ge=0.0, le=180.0)
    azim: Optional[float] = Field(0.0, description="Azimuth in degrees", ge=0.0, lt=360.0)
    tvd: float = Field(..., description="True Vertical Depth in meters")
    northing: float = Field(..., description="North/South coordinate (+N/-S) in meters")
    easting: float = Field(..., description="East/West coordinate (+E/-W) in meters")


class AntiCollisionScanRequest(BaseModel):
    """Request payload for running 3D ISCWSA Anti-Collision clearance scan."""
    offset_well_name: str = Field(..., description="Name or identifier of the offset well")
    offset_stations: List[OffsetStationInput] = Field(..., description="Trajectory stations of the offset well")
    model_name: str = Field("ISCWSA_MWD_REV4", description="ISCWSA tool error model key")
    expansion_k: float = Field(2.0, description="Confidence multiplier (2.0 for 2-sigma, 2.7955 for 3D 95%)", gt=0.0)
    well_radius_subject_m: float = Field(0.108, description="Subject wellbore radius in meters", ge=0.0)
    well_radius_offset_m: float = Field(0.108, description="Offset wellbore radius in meters", ge=0.0)
    b_total_ref: float = Field(52480.0, description="Geomagnetic total field reference in nT")
    dip_ref_deg: float = Field(72.15, description="Geomagnetic dip angle reference in degrees")
    declination_deg: float = Field(12.42, description="Magnetic declination in degrees")


class AntiCollisionPointOutput(BaseModel):
    """Single point of closest approach scan result along the wellbore."""
    md: float = Field(..., description="Subject well measured depth in meters")
    tvd: float = Field(..., description="Subject well TVD in meters")
    northing: float = Field(..., description="Subject well Northing in meters")
    easting: float = Field(..., description="Subject well Easting in meters")
    offset_well_name: str = Field(..., description="Offset well name")
    offset_md: float = Field(..., description="Offset well measured depth at closest approach in meters")
    center_distance: float = Field(..., description="Center-to-center 3D distance in meters")
    clearance_distance: float = Field(..., description="Surface-to-surface borehole clearance distance in meters")
    sigma_subject: float = Field(..., description="Subject well 1-sigma error projected on line of centers (m)")
    sigma_offset: float = Field(..., description="Offset well 1-sigma error projected on line of centers (m)")
    combined_uncertainty: float = Field(..., description="Combined expanded uncertainty envelope k*(sigma_S + sigma_O) in meters")
    separation_factor: float = Field(..., description="Calculated ISCWSA Separation Factor (SF)")
    is_violation: bool = Field(..., description="True if collision threshold is breached (SF < 1.0)")
    warning_level: str = Field(..., description="Safety status: 'SAFE', 'WARNING', or 'CRITICAL'")

    # 3D EOU parameters calculated by arrowell_engine at closest approach
    subject_eou: Optional[EouResponseSchema] = None
    offset_eou: Optional[EouResponseSchema] = None


class AntiCollisionScanResponse(BaseModel):
    """Full Anti-Collision scan response payload."""
    status: str = Field("success", description="Execution status")
    well_id: str = Field(..., description="Subject well identifier")
    offset_well_name: str = Field(..., description="Offset well identifier")
    min_separation_factor: float = Field(..., description="Minimum Separation Factor along the well")
    closest_distance_m: float = Field(..., description="Minimum center-to-center distance in meters")
    closest_md_m: float = Field(..., description="Measured depth at minimum distance in meters")
    scan_points: List[AntiCollisionPointOutput] = Field(default=[], description="Station-by-station scan profile")

class MsaConfigSchema(BaseModel):
    """Configuration settings for Multi-Station Analysis (MSA) optimization solver."""
    method: str = Field("trf", description="Optimization solver: 'trf' (Trust Region Reflective) or 'de' (Differential Evolution)")
    max_iter: int = Field(50, description="Maximum iterations or generations limit", ge=5, le=500)
    popsize: int = Field(15, description="Population multiplier for Differential Evolution", ge=5, le=50)
    enable_misalignment: bool = Field(True, description="Enable cross-axis sensor misalignment calibration")
    enable_ref_corrections: bool = Field(True, description="Enable reference field residual estimation")