"""Main FastAPI application entrypoint."""

from contextlib import asynccontextmanager

from fastapi import FastAPI

from api.v1 import api_router
from core.cors import setup_cors
from core.database import init_db, SessionLocal
from core.seed import seed_database
from core.settings import settings


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Initialize DuckDB tables and populate seed data on startup."""
    init_db()
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
    """Health check endpoint to verify service uptime."""
    return {
        "status": "ok",
        "service": settings.PROJECT_NAME,
        "version": settings.VERSION,
        "database_file": str(settings.DATABASE_PATH),
    }