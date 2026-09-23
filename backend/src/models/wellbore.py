from __future__ import annotations

from typing import List, Optional

from sqlalchemy import String, Float, Integer, Boolean, ForeignKey, Sequence
from sqlalchemy.orm import Mapped, mapped_column, relationship

from models.base import Base, TimestampMixin


class Field(Base, TimestampMixin):
    """Oil and gas field entity (e.g., Samotlor Field)."""
    __tablename__ = "fields"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    name: Mapped[str] = mapped_column(String(128), nullable=False)
    name_ru: Mapped[str] = mapped_column(String(128), nullable=False)
    country: Mapped[str] = mapped_column(String(64), default="Russia")
    basin: Mapped[str] = mapped_column(String(128), default="West Siberian Basin")

    # Relationships
    pads: Mapped[List["Pad"]] = relationship(
        back_populates="field",
        cascade="all, delete-orphan"
    )


class Pad(Base, TimestampMixin):
    """Drilling pad / platform location hosting multiple wellbores."""
    __tablename__ = "pads"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    field_id: Mapped[str] = mapped_column(
        ForeignKey("fields.id"),
        nullable=False
    )
    name: Mapped[str] = mapped_column(String(128), nullable=False)

    latitude: Mapped[float] = mapped_column(Float, nullable=False)
    longitude: Mapped[float] = mapped_column(Float, nullable=False)
    ground_elevation: Mapped[float] = mapped_column(Float, default=0.0)
    datum: Mapped[str] = mapped_column(String(32), default="MSL WGS84")

    field: Mapped["Field"] = relationship(back_populates="pads")
    wells: Mapped[List["Well"]] = relationship(
        back_populates="pad",
        cascade="all, delete-orphan"
    )
    geomagnetic_ref: Mapped[Optional["GeomagneticReference"]] = relationship(
        back_populates="pad",
        uselist=False,
        cascade="all, delete-orphan"
    )


class GeomagneticReference(Base, TimestampMixin):
    """Geomagnetic reference parameters and QC thresholds for the pad (WMM/IGRF)."""
    __tablename__ = "geomagnetic_references"

    # Use explicit Sequence for DuckDB compatibility
    id: Mapped[int] = mapped_column(
        Integer,
        Sequence("geomagnetic_references_id_seq"),
        primary_key=True
    )
    pad_id: Mapped[str] = mapped_column(
        ForeignKey("pads.id"),
        unique=True,
        nullable=False
    )

    model: Mapped[str] = mapped_column(String(32), default="WMM 2025")
    b_total_ref: Mapped[float] = mapped_column(Float, default=52480.0)
    dip_ref: Mapped[float] = mapped_column(Float, default=72.15)
    declination: Mapped[float] = mapped_column(Float, default=12.42)
    grid_convergence: Mapped[float] = mapped_column(Float, default=1.25)
    g_total_ref: Mapped[float] = mapped_column(Float, default=1.0000)
    tolerance_g: Mapped[float] = mapped_column(Float, default=0.005)
    tolerance_b: Mapped[float] = mapped_column(Float, default=200.0)
    tolerance_dip: Mapped[float] = mapped_column(Float, default=0.30)

    pad: Mapped["Pad"] = relationship(back_populates="geomagnetic_ref")


class Well(Base, TimestampMixin):
    """Directional wellbore entity."""
    __tablename__ = "wells"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    pad_id: Mapped[str] = mapped_column(
        ForeignKey("pads.id"),
        nullable=False
    )
    name: Mapped[str] = mapped_column(String(128), nullable=False)
    uwi: Mapped[str] = mapped_column(String(64), nullable=False, unique=True)
    slot: Mapped[str] = mapped_column(String(32), default="Slot #1")
    status: Mapped[str] = mapped_column(String(32), default="active")
    target_formation: Mapped[str] = mapped_column(String(64), default="BV8")
    datum_elevation: Mapped[float] = mapped_column(Float, default=0.0)
    proposal_azimuth: Mapped[float] = mapped_column(Float, default=0.0)
    pad: Mapped["Pad"] = relationship(back_populates="wells")
    stations: Mapped[List["SurveyStation"]] = relationship(
        back_populates="well",
        cascade="all, delete-orphan",
        order_by="SurveyStation.md"
    )


class SurveyStation(Base, TimestampMixin):
    """Directional survey station holding trajectory, coordinates, and raw MWD sensor telemetry."""
    __tablename__ = "survey_stations"

    id: Mapped[int] = mapped_column(
        Integer,
        Sequence("survey_stations_id_seq"),
        primary_key=True
    )
    well_id: Mapped[str] = mapped_column(
        ForeignKey("wells.id"),
        nullable=False
    )
    md: Mapped[float] = mapped_column(Float, nullable=False)
    inc: Mapped[float] = mapped_column(Float, nullable=False)
    azim: Mapped[float] = mapped_column(Float, nullable=False)
    tvd: Mapped[float] = mapped_column(Float, default=0.0)
    northing: Mapped[float] = mapped_column(Float, default=0.0)
    easting: Mapped[float] = mapped_column(Float, default=0.0)
    dls: Mapped[float] = mapped_column(Float, default=0.0)
    vs: Mapped[float] = mapped_column(Float, default=0.0)
    closure_dist: Mapped[float] = mapped_column(Float, default=0.0)
    closure_azim: Mapped[float] = mapped_column(Float, default=0.0)
    gx: Mapped[float] = mapped_column(Float, default=0.0)
    gy: Mapped[float] = mapped_column(Float, default=0.0)
    gz: Mapped[float] = mapped_column(Float, default=1.0)
    bx: Mapped[float] = mapped_column(Float, default=16000.0)
    by: Mapped[float] = mapped_column("by", Float, default=0.0, quote=True)
    bz: Mapped[float] = mapped_column(Float, default=50000.0)
    g_total: Mapped[float] = mapped_column(Float, default=1.0)
    b_total: Mapped[float] = mapped_column(Float, default=52480.0)
    dip_angle: Mapped[float] = mapped_column(Float, default=72.15)
    delta_g: Mapped[float] = mapped_column(Float, default=0.0)
    delta_b: Mapped[float] = mapped_column(Float, default=0.0)
    delta_dip: Mapped[float] = mapped_column(Float, default=0.0)
    is_qc_pass: Mapped[bool] = mapped_column(Boolean, default=True)
    status: Mapped[str] = mapped_column(String(32), default="Raw")
    well: Mapped["Well"] = relationship(back_populates="stations")