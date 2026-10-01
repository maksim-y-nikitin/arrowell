from typing import List, Optional

from pydantic import BaseModel, ConfigDict, Field


class RawStationSensorSchema(BaseModel):
    gx: float = Field(..., description="Accelerometer X-axis (g)")
    gy: float = Field(..., description="Accelerometer Y-axis (g)")
    gz: float = Field(..., description="Accelerometer Z-axis (g)")
    bx: float = Field(..., description="Magnetometer X-axis (nT)")
    by: float = Field(..., description="Magnetometer Y-axis (nT)")
    bz: float = Field(..., description="Magnetometer Z-axis (nT)")


class SurveyStationBase(BaseModel):
    md: float = Field(..., description="Measured Depth (m)", ge=0.0)
    inc: float = Field(..., description="Inclination (degrees)", ge=0.0, le=180.0)
    azim: float = Field(..., description="Azimuth (degrees)", ge=0.0, lt=360.0)
    sensor: Optional[RawStationSensorSchema] = Field(default=None)


class SurveyStationCreate(SurveyStationBase):
    well_id: Optional[str] = None


class EouResponseSchema(BaseModel):
    semi_major: float
    semi_intermediate: float
    semi_minor: float
    horiz_semi_major: float
    horiz_semi_minor: float
    horiz_azimuth: float
    eigenvectors: List[List[float]]


class SurveyStationResponse(SurveyStationBase):
    id: int
    well_id: str
    parent_station_id: Optional[int] = None
    survey_type: str = "raw"
    correction_type: Optional[str] = None
    tvd: float = Field(0.0)
    northing: float = Field(0.0)
    easting: float = Field(0.0)
    dls: float = Field(0.0)
    vs: float = Field(0.0)
    closure_dist: float = Field(0.0)
    closure_azim: float = Field(0.0)
    sensor: RawStationSensorSchema
    g_total: float = Field(1.0)
    b_total: float = Field(52480.0)
    dip_angle: float = Field(72.15)
    delta_g: float = Field(0.0)
    delta_b: float = Field(0.0)
    delta_dip: float = Field(0.0)
    is_qc_pass: bool = Field(True)
    status: str = Field("Raw")
    eou: Optional[EouResponseSchema] = None

    model_config = ConfigDict(from_attributes=True)


class TrajectoryCalculationRequest(BaseModel):
    proposal_azimuth: float = Field(45.0)
    stations: List[SurveyStationBase]


class TrajectoryCalculationResponse(BaseModel):
    station_count: int
    total_md: float
    total_tvd: float
    max_dls: float
    stations: List[SurveyStationResponse]


class BhaConfigSchema(BaseModel):
    collar_od_mm: float = Field(171.5)
    collar_id_mm: float = Field(71.4)
    sensor_to_bit_m: float = Field(14.2)
    stabilizer_dist_m: float = Field(21.5)
    mud_weight_gcm3: float = Field(1.20)
    bha_material: str = Field("nm_steel")


class SagStationCorrection(BaseModel):
    station_id: int
    md: float
    raw_inc: float
    sag_correction_deg: float
    corrected_inc: float
    valid: bool


class SagCalculationResponse(BaseModel):
    status: str
    well_id: str
    mud_weight_gcm3: float
    peak_sag_deg: float
    stations_corrected: int
    corrections: List[SagStationCorrection]


class OffsetStationInput(BaseModel):
    md: float = Field(..., ge=0.0)
    inc: Optional[float] = Field(0.0, ge=0.0, le=180.0)
    azim: Optional[float] = Field(0.0, ge=0.0, lt=360.0)
    tvd: float
    northing: float
    easting: float


class SubjectStationInput(BaseModel):
    id: int
    md: float
    inc: float
    azim: float
    tvd: float
    northing: float
    easting: float


class AntiCollisionScanRequest(BaseModel):
    offset_well_name: str
    offset_stations: List[OffsetStationInput]
    subject_stations: Optional[List[SubjectStationInput]] = None
    model_name: str = "ISCWSA_MWD_REV4"
    expansion_k: float = 2.0
    well_radius_subject_m: float = 0.108
    well_radius_offset_m: float = 0.108
    b_total_ref: float = 52480.0
    dip_ref_deg: float = 72.15
    declination_deg: float = 12.42


class AntiCollisionPointOutput(BaseModel):
    md: float
    tvd: float
    northing: float
    easting: float
    offset_well_name: str
    offset_md: float
    center_distance: float
    clearance_distance: float
    sigma_subject: float
    sigma_offset: float
    combined_uncertainty: float
    separation_factor: float
    is_violation: bool
    warning_level: str
    subject_eou: Optional[EouResponseSchema] = None
    offset_eou: Optional[EouResponseSchema] = None


class AntiCollisionScanResponse(BaseModel):
    status: str = "success"
    well_id: str
    offset_well_name: str
    min_separation_factor: float
    closest_distance_m: float
    closest_md_m: float
    scan_points: List[AntiCollisionPointOutput] = Field(default=[])


class GeomagReferenceSchema(BaseModel):
    model: str = Field("WMM 2025", description="Geomagnetic field model name")
    error_model: str = Field("ISCWSA_MWD_REV4", description="ISCWSA tool error model key")
    b_total_ref: float = Field(52480.0, description="Total magnetic intensity (nT)")
    dip_ref: float = Field(72.15, description="Magnetic dip angle (deg)")
    declination: float = Field(12.42, description="Magnetic declination (deg)")
    grid_convergence: float = Field(1.25, description="Grid convergence angle (deg)")
    g_total_ref: float = Field(1.0000, description="Total gravity reference (1.0 g)")
    tolerance_g: float = Field(0.005, description="Delta G acceptance tolerance (g)")
    tolerance_b: float = Field(200.0, description="Delta B acceptance tolerance (nT)")
    tolerance_dip: float = Field(0.30, description="Delta Dip acceptance tolerance (deg)")

    model_config = ConfigDict(from_attributes=True)


class MsaConfigSchema(BaseModel):
    cma_generations: Optional[int] = Field(100, ge=10, le=300)
    max_iter: Optional[int] = Field(None, ge=10, le=300)
    enable_misalignment: bool = True
    enable_ref_corrections: bool = True
    error_model: Optional[str] = Field(None, description="Optional override for ISCWSA model")
    geomag_model: Optional[str] = Field(None, description="Optional override for Geomag model")

class GeomagCalcRequest(BaseModel):
    latitude: float = Field(..., description="Latitude in degrees (-90 to 90)")
    longitude: float = Field(..., description="Longitude in degrees (-180 to 180)")
    altitude_m: float = Field(0.0, description="Altitude above MSL in meters")
    model: str = Field("WMM2025", description="Geomagnetic model identifier")
    date_iso: Optional[str] = Field(None, description="ISO formatted date")


class GeomagCalcResponse(BaseModel):
    model: str
    b_total_ref: float
    dip_ref: float
    declination: float
    grid_convergence: float
    g_total_ref: float
    g_ms2: float
    tolerance_g: float
    tolerance_b: float
    tolerance_dip: float