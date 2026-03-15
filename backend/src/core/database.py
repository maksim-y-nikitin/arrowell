"""Database connection and session management module using DuckDB."""

from typing import Generator

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, Session

from core.settings import settings
from models.base import Base

settings.DATA_DIR.mkdir(parents=True, exist_ok=True)
engine = create_engine(
    settings.DATABASE_URL,
    echo=settings.DEBUG,
)

SessionLocal = sessionmaker(
    autocommit=False,
    autoflush=False,
    bind=engine,
)


def init_db() -> None:
    """Initialize database schema by creating all registered tables."""
    Base.metadata.create_all(bind=engine)


def get_db() -> Generator[Session, None, None]:
    """FastAPI dependency yielding a scoped database session."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()