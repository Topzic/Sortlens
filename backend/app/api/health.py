"""
Health check endpoint.
"""

import logging

from fastapi import APIRouter

from app.core.database import get_db

logger = logging.getLogger(__name__)

router = APIRouter()


@router.get("/health")
async def health_check():
    """
    Health check endpoint.
    Returns the health status of the API and database connectivity.
    """
    db_ok = False
    try:
        db = await get_db()
        cursor = await db.execute("SELECT 1")
        await cursor.fetchone()
        db_ok = True
    except Exception as exc:
        logger.warning("Health check DB probe failed: %s", exc)

    status = "healthy" if db_ok else "degraded"
    return {
        "status": status,
        "service": "sortlens-api",
        "database": "connected" if db_ok else "unavailable",
    }
