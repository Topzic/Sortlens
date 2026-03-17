"""
Version endpoint.
"""

from fastapi import APIRouter

from app.core.config import settings

router = APIRouter()


@router.get("/version")
async def get_version():
    """
    Get API version information.
    """
    return {
        "name": settings.APP_NAME,
        "version": settings.VERSION,
        "api_version": "v1",
    }
