"""Pytest fixtures and isolated in-memory test database setup."""

from typing import Generator

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, Session
from sqlalchemy.pool import StaticPool

import core.database as db_module
from core.seed import seed_database
from main import app
from models.base import Base

# Use an isolated in-memory DuckDB engine with StaticPool so all threads share the memory DB
test_engine = create_engine(
    "duckdb:///:memory:",
    poolclass=StaticPool,
)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=test_engine)

# Redirect core.database so application lifespan operates completely in RAM during tests
db_module.engine = test_engine
db_module.SessionLocal = TestingSessionLocal


@pytest.fixture(scope="session", autouse=True)
def setup_test_db():
    """Create test database schema and seed initial data once for the test session."""
    Base.metadata.create_all(bind=test_engine)
    with TestingSessionLocal() as db:
        seed_database(db)
    yield
    Base.metadata.drop_all(bind=test_engine)


@pytest.fixture
def db_session() -> Generator[Session, None, None]:
    """Provide a scoped database session for individual test functions."""
    session = TestingSessionLocal()
    try:
        yield session
    finally:
        session.close()


@pytest.fixture
def client(db_session: Session) -> Generator[TestClient, None, None]:
    """Provide a TestClient connected to the in-memory test database."""
    def override_get_db():
        try:
            yield db_session
        finally:
            pass

    app.dependency_overrides[db_module.get_db] = override_get_db
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()