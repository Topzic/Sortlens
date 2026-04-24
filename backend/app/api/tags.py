"""
Tags API – add, remove, list, suggest, and batch-manage tags on images.
"""

from __future__ import annotations

import asyncio
import logging
from pathlib import Path

from fastapi import APIRouter, BackgroundTasks, HTTPException, Query
from pydantic import BaseModel, field_validator

from app.core.config import settings
from app.core.database import get_db
from app.core.tag_suggestions import (
    TagPack,
    TagSuggestion,
    clip_model_available,
    clip_model_size_bytes,
    download_clip_model,
    get_image_suggestions,
    get_tag_packs,
    reset_clip_session,
)
from app.core.xmp_writer import write_tags_to_xmp

logger = logging.getLogger(__name__)

router = APIRouter()

# ---------------------------------------------------------------------------
# Pydantic models
# ---------------------------------------------------------------------------


class TagOut(BaseModel):
    id: int
    name: str
    usage_count: int


class ImageTagOut(BaseModel):
    name: str
    source: str  # manual | ai | exif | ai_object
    confidence: float | None = None


class AddTagRequest(BaseModel):
    name: str
    source: str = "manual"
    confidence: float | None = None

    @field_validator("name")
    @classmethod
    def clean_name(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("Tag name cannot be empty")
        if len(v) > 100:
            raise ValueError("Tag name must be 100 characters or less")
        return v

    @field_validator("source")
    @classmethod
    def validate_source(cls, v: str) -> str:
        allowed = {
            "manual",
            "ai",
            "exif",
            "ai_object",
            "ai_object_wildlife",
            "ai_wildlife",
            "ai_food",
            "ai_scene",
            "ai_event",
        }
        if v not in allowed:
            raise ValueError(f"source must be one of: {', '.join(sorted(allowed))}")
        return v


class BatchTagRequest(BaseModel):
    image_ids: list[str]
    tags: list[str]

    @field_validator("image_ids")
    @classmethod
    def validate_image_ids(cls, value: list[str]) -> list[str]:
        cleaned: list[str] = []
        seen: set[str] = set()
        for image_id in value:
            normalized = image_id.strip()
            if not normalized or normalized in seen:
                continue
            seen.add(normalized)
            cleaned.append(normalized)
        if not cleaned:
            raise ValueError("image_ids must contain at least one image id")
        return cleaned

    @field_validator("tags")
    @classmethod
    def validate_tags(cls, value: list[str]) -> list[str]:
        cleaned: list[str] = []
        seen: set[str] = set()
        for tag_name in value:
            normalized = tag_name.strip()
            lower_name = normalized.lower()
            if not normalized or lower_name in seen:
                continue
            if len(normalized) > 100:
                raise ValueError("Tag name must be 100 characters or less")
            seen.add(lower_name)
            cleaned.append(normalized)
        if not cleaned:
            raise ValueError("tags must contain at least one tag")
        return cleaned


class RenameTagRequest(BaseModel):
    name: str

    @field_validator("name")
    @classmethod
    def clean_name(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("Tag name cannot be empty")
        if len(v) > 100:
            raise ValueError("Tag name must be 100 characters or less")
        return v


class SuggestionOut(BaseModel):
    name: str
    source: str
    confidence: float
    already_applied: bool = False


class AiStatusOut(BaseModel):
    available: bool
    downloading: bool
    progress: float | None = None  # 0.0 – 1.0
    model_size_bytes: int | None = None


class TagPackOut(BaseModel):
    id: str
    name: str
    description: str
    source: str
    tag_count: int
    default_enabled: bool


# Track ongoing downloads
_download_progress: dict[str, float] = {}
_download_task_running = False

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


async def _get_or_create_tag(db, name: str) -> int:
    """Return the tag id, creating the tag if it doesn't yet exist."""
    cursor = await db.execute("SELECT id FROM tags WHERE name = ? COLLATE NOCASE", (name,))
    row = await cursor.fetchone()
    if row:
        return row["id"]
    cursor = await db.execute("INSERT INTO tags (name) VALUES (?)", (name,))
    return cursor.lastrowid


async def _image_tag_names(db, image_id: str) -> set[str]:
    cursor = await db.execute(
        """
        SELECT t.name FROM image_tags it
        JOIN tags t ON t.id = it.tag_id
        WHERE it.image_id = ?
        """,
        (image_id,),
    )
    rows = await cursor.fetchall()
    return {r["name"].lower() for r in rows}


async def _get_image_path(db, image_id: str) -> Path | None:
    cursor = await db.execute("SELECT path FROM images WHERE id = ?", (image_id,))
    row = await cursor.fetchone()
    return Path(row["path"]) if row else None


async def _get_setting_value(db, key: str) -> str | None:
    cursor = await db.execute("SELECT value FROM settings WHERE key = ?", (key,))
    row = await cursor.fetchone()
    return row["value"] if row else None


async def _get_csv_setting(db, key: str) -> list[str] | None:
    value = await _get_setting_value(db, key)
    if value is None:
        return None
    return [part.strip() for part in value.split(",") if part.strip()]


async def _get_bool_setting(db, key: str, default: bool) -> bool:
    value = await _get_setting_value(db, key)
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


async def _write_xmp_background(image_id: str):
    """Write XMP sidecar for an image (background task)."""
    try:
        db = await get_db()
        img_path = await _get_image_path(db, image_id)
        if not img_path or not img_path.exists():
            return
        cursor = await db.execute(
            """
            SELECT t.name FROM image_tags it
            JOIN tags t ON t.id = it.tag_id
            WHERE it.image_id = ?
            ORDER BY t.name
            """,
            (image_id,),
        )
        rows = await cursor.fetchall()
        tags = [r["name"] for r in rows]
        await asyncio.to_thread(write_tags_to_xmp, img_path, tags)
    except Exception:
        logger.exception("XMP background write failed for %s", image_id)


# ---------------------------------------------------------------------------
# Endpoints: batch operations
# ---------------------------------------------------------------------------


@router.post("/images/batch/tags", status_code=200)
async def batch_add_tags(request: BatchTagRequest, background_tasks: BackgroundTasks):
    """Add one or more tags to multiple images."""
    db = await get_db()

    tag_ids: list[int] = []
    for name in request.tags:
        tid = await _get_or_create_tag(db, name)
        tag_ids.append(tid)

    for image_id in request.image_ids:
        for tid in tag_ids:
            await db.execute(
                """
                INSERT OR IGNORE INTO image_tags (image_id, tag_id, source)
                VALUES (?, ?, 'manual')
                """,
                (image_id, tid),
            )
        background_tasks.add_task(_write_xmp_background, image_id)

    await db.commit()
    return {"updated": len(request.image_ids), "tags": request.tags}


@router.delete("/images/batch/tags", status_code=200)
async def batch_remove_tags(request: BatchTagRequest, background_tasks: BackgroundTasks):
    """Remove one or more tags from multiple images."""
    db = await get_db()

    placeholders = ",".join("?" for _ in request.tags)
    for image_id in request.image_ids:
        await db.execute(
            f"""
            DELETE FROM image_tags
            WHERE image_id = ?
              AND tag_id IN (
                  SELECT id FROM tags WHERE name IN ({placeholders}) COLLATE NOCASE
              )
            """,
            (image_id, *request.tags),
        )
        background_tasks.add_task(_write_xmp_background, image_id)

    await db.commit()
    return {"updated": len(request.image_ids), "tags": request.tags}


# ---------------------------------------------------------------------------
# Endpoints: per-image tag management
# ---------------------------------------------------------------------------


@router.get("/images/{image_id}/tags", response_model=list[ImageTagOut])
async def get_image_tags(image_id: str):
    """Return all tags applied to an image."""
    db = await get_db()
    cursor = await db.execute("SELECT id FROM images WHERE id = ?", (image_id,))
    if not await cursor.fetchone():
        raise HTTPException(status_code=404, detail="Image not found")

    cursor = await db.execute(
        """
        SELECT t.name, it.source, it.confidence
        FROM image_tags it
        JOIN tags t ON t.id = it.tag_id
        WHERE it.image_id = ?
        ORDER BY t.name
        """,
        (image_id,),
    )
    rows = await cursor.fetchall()
    return [ImageTagOut(name=r["name"], source=r["source"], confidence=r["confidence"]) for r in rows]


@router.post("/images/{image_id}/tags", response_model=ImageTagOut, status_code=201)
async def add_image_tag(image_id: str, request: AddTagRequest, background_tasks: BackgroundTasks):
    """Add a tag to an image. Creates the tag in the registry if needed."""
    db = await get_db()
    cursor = await db.execute("SELECT id FROM images WHERE id = ?", (image_id,))
    if not await cursor.fetchone():
        raise HTTPException(status_code=404, detail="Image not found")

    tag_id = await _get_or_create_tag(db, request.name)

    # Upsert – update source/confidence if the tag already exists on this image
    await db.execute(
        """
        INSERT INTO image_tags (image_id, tag_id, source, confidence)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(image_id, tag_id) DO UPDATE SET source = excluded.source, confidence = excluded.confidence
        """,
        (image_id, tag_id, request.source, request.confidence),
    )
    await db.commit()

    # Write XMP sidecar in the background
    background_tasks.add_task(_write_xmp_background, image_id)

    return ImageTagOut(name=request.name, source=request.source, confidence=request.confidence)


@router.delete("/images/{image_id}/tags/{tag_name}", status_code=204)
async def remove_image_tag(image_id: str, tag_name: str, background_tasks: BackgroundTasks):
    """Remove a tag from an image."""
    db = await get_db()

    cursor = await db.execute(
        """
        DELETE FROM image_tags
        WHERE image_id = ?
          AND tag_id = (SELECT id FROM tags WHERE name = ? COLLATE NOCASE)
        """,
        (image_id, tag_name),
    )
    await db.commit()

    if cursor.rowcount == 0:
        raise HTTPException(status_code=404, detail="Tag not found on this image")

    background_tasks.add_task(_write_xmp_background, image_id)


# ---------------------------------------------------------------------------
# Endpoints: tag registry
# ---------------------------------------------------------------------------


@router.get("/tags", response_model=list[TagOut])
async def list_tags(
    q: str | None = Query(None, description="Prefix search"),
    limit: int = Query(30, ge=1, le=200),
):
    """List all tags with usage counts (optionally filtered by prefix)."""
    db = await get_db()

    if q:
        cursor = await db.execute(
            """
            SELECT t.id, t.name, COUNT(it.image_id) as usage_count
            FROM tags t
            LEFT JOIN image_tags it ON it.tag_id = t.id
            WHERE t.name LIKE ? COLLATE NOCASE
            GROUP BY t.id
            ORDER BY usage_count DESC, t.name ASC
            LIMIT ?
            """,
            (f"{q}%", limit),
        )
    else:
        cursor = await db.execute(
            """
            SELECT t.id, t.name, COUNT(it.image_id) as usage_count
            FROM tags t
            LEFT JOIN image_tags it ON it.tag_id = t.id
            GROUP BY t.id
            ORDER BY usage_count DESC, t.name ASC
            LIMIT ?
            """,
            (limit,),
        )

    rows = await cursor.fetchall()
    return [TagOut(id=r["id"], name=r["name"], usage_count=r["usage_count"]) for r in rows]


@router.put("/tags/{tag_id}", response_model=TagOut)
async def rename_tag(tag_id: int, request: RenameTagRequest):
    """Rename a tag globally (updates all image associations automatically)."""
    db = await get_db()
    cursor = await db.execute("SELECT id FROM tags WHERE id = ?", (tag_id,))
    if not await cursor.fetchone():
        raise HTTPException(status_code=404, detail="Tag not found")

    # Check new name not already in use
    cursor = await db.execute(
        "SELECT id FROM tags WHERE name = ? COLLATE NOCASE AND id != ?", (request.name, tag_id)
    )
    if await cursor.fetchone():
        raise HTTPException(status_code=409, detail="A tag with that name already exists")

    await db.execute("UPDATE tags SET name = ? WHERE id = ?", (request.name, tag_id))
    await db.commit()

    cursor = await db.execute(
        """
        SELECT t.id, t.name, COUNT(it.image_id) as usage_count
        FROM tags t LEFT JOIN image_tags it ON it.tag_id = t.id
        WHERE t.id = ? GROUP BY t.id
        """,
        (tag_id,),
    )
    row = await cursor.fetchone()
    return TagOut(id=row["id"], name=row["name"], usage_count=row["usage_count"])


@router.delete("/tags/{tag_id}", status_code=204)
async def delete_tag(tag_id: int):
    """Delete a tag from the registry (cascades to all image_tags)."""
    db = await get_db()
    cursor = await db.execute("SELECT id FROM tags WHERE id = ?", (tag_id,))
    if not await cursor.fetchone():
        raise HTTPException(status_code=404, detail="Tag not found")

    await db.execute("DELETE FROM tags WHERE id = ?", (tag_id,))
    await db.commit()


# ---------------------------------------------------------------------------
# Endpoints: suggestions
# ---------------------------------------------------------------------------


@router.get("/tags/suggestions/{image_id}", response_model=list[SuggestionOut])
async def get_tag_suggestions(image_id: str):
    """
    Return EXIF, YOLO, and CLIP suggestions in a single merged response.
    Already-applied tags are marked with already_applied=True.
    """
    db = await get_db()
    cursor = await db.execute("SELECT * FROM images WHERE id = ?", (image_id,))
    row = await cursor.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Image not found")

    applied = await _image_tag_names(db, image_id)

    enabled_pack_ids = await _get_csv_setting(db, "enabled_tag_packs")
    yolo_enabled = await _get_bool_setting(db, "enable_yolo", settings.ENABLE_YOLO)
    suggestions: list[TagSuggestion] = await get_image_suggestions(
        dict(row),
        enabled_pack_ids=enabled_pack_ids,
        yolo_enabled=yolo_enabled,
    )

    result = [
        SuggestionOut(
            name=s.name,
            source=s.source,
            confidence=s.confidence,
            already_applied=s.name.lower() in applied,
        )
        for s in suggestions
    ]
    return sorted(result, key=lambda x: (x.already_applied, -x.confidence, x.name.lower()))


@router.get("/tags/packs", response_model=list[TagPackOut])
async def list_tag_packs():
    """Return all available tag packs with metadata."""
    return [
        TagPackOut(
            id=p.id,
            name=p.name,
            description=p.description,
            source=p.source,
            tag_count=len(p.tags),
            default_enabled=p.default_enabled,
        )
        for p in get_tag_packs()
    ]


@router.get("/tags/ai-status", response_model=AiStatusOut)
async def get_ai_status():
    """Report whether the CLIP model is available and/or downloading."""
    return AiStatusOut(
        available=clip_model_available(),
        downloading=_download_task_running,
        progress=_download_progress.get("clip"),
        model_size_bytes=clip_model_size_bytes() or None,
    )


@router.delete("/tags/ai-model", status_code=200)
async def delete_ai_model():
    """Delete the downloaded CLIP model files and reset the in-memory session."""
    from app.core.tag_suggestions import _CLIP_TEXT_FILE, _CLIP_TOKENIZER_FILE, _CLIP_VISUAL_FILE

    any_found = any(p.exists() for p in (_CLIP_VISUAL_FILE, _CLIP_TEXT_FILE, _CLIP_TOKENIZER_FILE))
    if not any_found:
        return {"status": "not_found"}

    # Reset sessions BEFORE unlinking — onnxruntime holds OS-level file locks on Windows
    reset_clip_session()

    errors: list[str] = []
    for path in (_CLIP_VISUAL_FILE, _CLIP_TEXT_FILE, _CLIP_TOKENIZER_FILE):
        try:
            path.unlink(missing_ok=True)
        except Exception as exc:
            errors.append(f"{path.name}: {exc}")

    if errors:
        logger.error("Failed to delete some AI model files: %s", errors)
        raise HTTPException(status_code=500, detail="Could not delete: " + "; ".join(errors))

    logger.info("AI model files deleted by user")
    return {"status": "deleted"}


@router.post("/tags/ai-download", status_code=202)
async def trigger_ai_download(background_tasks: BackgroundTasks):
    """Trigger download of the CLIP ONNX model in the background."""
    global _download_task_running

    if clip_model_available():
        return {"status": "already_available"}

    if _download_task_running:
        return {"status": "already_downloading"}

    async def _do_download():
        global _download_task_running
        _download_task_running = True
        try:
            def _progress(downloaded: int, total: int):
                if total > 0:
                    _download_progress["clip"] = downloaded / total

            await download_clip_model(progress_callback=_progress)
        finally:
            _download_task_running = False
            _download_progress.pop("clip", None)

    background_tasks.add_task(_do_download)
    return {"status": "download_started"}
