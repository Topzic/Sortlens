"""Settings API – read/write persisted user settings."""

import logging

from fastapi import APIRouter
from pydantic import BaseModel

from app.core.database import get_db

logger = logging.getLogger(__name__)

router = APIRouter()


class SettingsPayload(BaseModel):
    deletion_mode: str | None = None          # trash | rejected_folder | permanent
    include_sidecars: bool | None = None
    preview_max_size: int | None = None
    prefetch_count: int | None = None
    undo_depth: int | None = None
    scan_batch_size: int | None = None
    enable_yolo: bool | None = None
    theme: str | None = None                  # system | dark | light
    editor_command: str | None = None         # "default" | custom exe path
    enabled_tag_packs: str | None = None      # comma-separated pack IDs


@router.get("/settings")
async def get_settings():
    db = await get_db()
    cursor = await db.execute("SELECT key, value FROM settings")
    rows = await cursor.fetchall()
    return {row["key"]: row["value"] for row in rows}


@router.put("/settings")
async def update_settings(payload: SettingsPayload):
    db = await get_db()
    updated: dict[str, str] = {}
    for key, value in payload.model_dump(exclude_none=True).items():
        str_value = str(value)
        await db.execute(
            """
            INSERT INTO settings (key, value, updated_at)
            VALUES (?, ?, CURRENT_TIMESTAMP)
            ON CONFLICT(key) DO UPDATE SET
                value = excluded.value,
                updated_at = CURRENT_TIMESTAMP
            """,
            (key, str_value),
        )
        updated[key] = str_value
    await db.commit()
    logger.info("Settings updated: %s", list(updated.keys()))
    return updated
