"""CORS (Cross-Origin Resource Sharing) middleware configuration."""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware


def setup_cors(app: FastAPI) -> None:
    """Configure CORS middleware to accept requests from any local frontend port."""
    app.add_middleware(
        CORSMiddleware,
        allow_origin_regex=r"^https?://(localhost|127\.0\.0\.1)(:[0-9]+)?$",
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )