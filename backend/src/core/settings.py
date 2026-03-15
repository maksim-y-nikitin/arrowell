"""Global application settings and directory path configurations."""

from pathlib import Path
from typing import List

from pydantic import computed_field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application configuration and environmental paths."""

    PROJECT_NAME: str = "ArroWell Directional Engine API"
    VERSION: str = "0.1.0"
    DESCRIPTION: str = "High-performance directional drilling wellbore survey analytics engine."
    API_V1_STR: str = "/api/v1"
    DEBUG: bool = False
    SRC_DIR: Path = Path(__file__).resolve().parent.parent
    BACKEND_DIR: Path = SRC_DIR.parent
    DATA_DIR: Path = BACKEND_DIR / "data"
    DB_FILE_NAME: str = "arrowell.duckdb"

    @computed_field
    @property
    def DATABASE_PATH(self) -> Path:
        """Absolute file path to the DuckDB database file."""
        return self.DATA_DIR / self.DB_FILE_NAME

    @computed_field
    @property
    def DATABASE_URL(self) -> str:
        """SQLAlchemy connection string for DuckDB."""
        return f"duckdb:///{self.DATABASE_PATH}"
    CORS_ORIGINS: List[str] = [
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:80",
        "http://127.0.0.1:80",
        "http://localhost",
    ]
    DEFAULT_GEOMAG_MODEL: str = "WMM 2025"
    DEFAULT_B_TOTAL_REF: float = 52480.0
    DEFAULT_DIP_REF: float = 72.15
    DEFAULT_DECLINATION: float = 12.42
    DEFAULT_GRID_CONVERGENCE: float = 1.25

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

settings = Settings()