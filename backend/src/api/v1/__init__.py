"""API v1 root router aggregator."""

from fastapi import APIRouter

from api.v1.surveys import router as surveys_router
from api.v1.wells import router as wells_router

api_router = APIRouter(prefix="/v1")
api_router.include_router(surveys_router)
api_router.include_router(wells_router)