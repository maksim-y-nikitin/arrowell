"""Pydantic schemas for the field -> pad -> well hierarchy."""

from typing import List, Optional

from pydantic import BaseModel, ConfigDict


class WellBase(BaseModel):
    """Base attributes of a directional wellbore."""
    name: str
    uwi: str
    slot: str = "Slot #1"
    status: str = "active"
    target_formation: str = "BV8"
    datum_elevation: float = 0.0


class WellResponse(WellBase):
    """Well entity response payload for hierarchy navigation."""
    id: str
    pad_id: str

    model_config = ConfigDict(from_attributes=True)


class PadBase(BaseModel):
    """Base attributes of a well pad."""
    name: str
    latitude: float
    longitude: float
    ground_elevation: float = 0.0
    datum: str = "MSL WGS84"


class GeomagneticReferenceResponse(BaseModel):
    id: int
    pad_id: str
    model: str
    error_model: str
    b_total_ref: float
    dip_ref: float
    declination: float
    grid_convergence: float
    g_total_ref: float
    tolerance_g: float
    tolerance_b: float
    tolerance_dip: float

    model_config = ConfigDict(from_attributes=True)


class PadResponse(PadBase):
    id: str
    field_id: str
    wells: Optional[List[WellResponse]] = None
    geomagnetic_ref: Optional[GeomagneticReferenceResponse] = None

    model_config = ConfigDict(from_attributes=True)

class FieldResponse(BaseModel):
    """Top-level field entity response with child pads and wells."""
    id: str
    name: str
    name_ru: str
    country: str
    basin: str
    pads: Optional[List[PadResponse]] = None

    model_config = ConfigDict(from_attributes=True)