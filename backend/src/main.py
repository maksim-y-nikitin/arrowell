"""Main FastAPI application entrypoint."""

from contextlib import asynccontextmanager

from fastapi import FastAPI

from api.v1 import api_router
from core.cors import setup_cors
from core.database import init_db, SessionLocal, get_db
from core.seed import seed_database
from core.settings import settings
from models.base import Base


@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Initialize DuckDB tables and populate seed data during application startup.

    Args:
        app: Running FastAPI application instance.
    """
    init_db()

    if get_db in app.dependency_overrides:
        override = app.dependency_overrides[get_db]
        gen = override()
        try:
            test_db = next(gen)
            Base.metadata.create_all(bind=test_db.get_bind())
            seed_database(test_db)
        finally:
            try:
                next(gen)
            except StopIteration:
                pass
    else:
        with SessionLocal() as db:
            seed_database(db)

    yield


app = FastAPI(
    title=settings.PROJECT_NAME,
    version=settings.VERSION,
    description=settings.DESCRIPTION,
    lifespan=lifespan,
)

setup_cors(app)

app.include_router(api_router, prefix="/api")


@app.get("/health", tags=["Health"])
async def health_check():
    """
    Health check endpoint to verify service uptime.

    Returns:
        Dictionary containing service operational metadata.
    """
    return {
        "status": "ok",
        "service": settings.PROJECT_NAME,
        "version": settings.VERSION,
        "database_file": str(settings.DATABASE_PATH),
    }