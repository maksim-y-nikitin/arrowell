"""Database connection and session management module using DuckDB."""

from typing import Generator

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, Session
from sqlalchemy.pool import StaticPool

from core.settings import settings
from models.base import Base

settings.DATA_DIR.mkdir(parents=True, exist_ok=True)

connect_args = {}
engine_kwargs = {"echo": settings.DEBUG}

if ":memory:" in settings.DATABASE_URL or settings.DATABASE_URL == "duckdb://":
    engine_kwargs["poolclass"] = StaticPool
    connect_args["read_only"] = False

engine = create_engine(
    settings.DATABASE_URL,
    connect_args=connect_args,
    **engine_kwargs,
)

SessionLocal = sessionmaker(
    autocommit=False,
    autoflush=False,
    bind=engine,
)


def init_db() -> None:
    """
    Initialize database schema by creating all registered tables on the engine.
    """
    Base.metadata.create_all(bind=engine)


def get_db() -> Generator[Session, None, None]:
    """
    FastAPI dependency yielding a scoped database session.

    Yields:
        Session: Scoped database session.
    """
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()