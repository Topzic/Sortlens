"""Browse / gallery API – paginated media listing with basic filters."""

import asyncio
import logging
import math
from pathlib import Path

from fastapi import APIRouter, Query
from pydantic import BaseModel

from app.core.database import get_db
from app.core.media import RAW_EXTENSIONS, VIDEO_EXTENSIONS, extract_media_metadata, guess_media_type

logger = logging.getLogger(__name__)

router = APIRouter()


class BrowseImage(BaseModel):
    id: str
    filename: str
    folder: str
    path: str
    format: str | None = None
    media_type: str = "image"
    size: int | None = None
    width: int | None = None
    height: int | None = None
    duration: float | None = None
    fps: float | None = None
    video_codec: str | None = None
    audio_codec: str | None = None
    bitrate: int | None = None
    has_audio: bool = False
    camera_make: str | None = None
    camera_model: str | None = None
    iso: int | None = None
    shutter_speed: str | None = None
    aperture: str | None = None
    exposure_program: str | None = None
    focal_length: str | None = None
    star_rating: int = 0
    color_label: str | None = None
    flag: str = "unflagged"
    created_at: str | None = None
    latitude: float | None = None
    longitude: float | None = None
    tags: list[str] = []


class BrowseResponse(BaseModel):
    images: list[BrowseImage]
    total: int
    page: int
    page_size: int
    total_pages: int


def _needs_metadata_refresh(row) -> bool:
    media_type = guess_media_type(row["format"], row["media_type"])
    fmt = (row["format"] or "").lower()
    missing_size = row["width"] is None or row["height"] is None
    if media_type == "video":
        missing_video_fields = row["duration"] is None or row["video_codec"] is None
        return missing_size or missing_video_fields

    metadata_empty = all(
        row[key] is None for key in ("camera_make", "camera_model", "iso", "shutter_speed")
    )
    missing_extended_metadata = row["exposure_program"] is None or row["focal_length"] is None
    suspicious_raw_size = fmt in {ext.lstrip(".") for ext in RAW_EXTENSIONS} and (
        (row["width"] or 0) <= 320 or (row["height"] or 0) <= 320
    )
    return metadata_empty or missing_size or suspicious_raw_size or missing_extended_metadata


def _parse_tag_filter_names(tags_filter: str) -> list[str]:
    seen: set[str] = set()
    tag_names: list[str] = []
    for raw_name in tags_filter.split(","):
        name = raw_name.strip()
        normalized = name.lower()
        if not name or normalized in seen:
            continue
        seen.add(normalized)
        tag_names.append(name)
    return tag_names


def _tag_like_pattern(tag_name: str) -> str:
    escaped = tag_name.lower().replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
    return f"%{escaped}%"


async def _enrich_rows(rows, db):
    updated = False
    enriched_rows = []

    for row in rows:
        row_dict = dict(row)
        if _needs_metadata_refresh(row):
            metadata = await asyncio.to_thread(extract_media_metadata, Path(row["path"]))
            row_dict.update(metadata)
            await db.execute(
                """
                UPDATE images
                SET media_type = ?, width = ?, height = ?, exif_date = ?, camera_make = ?, camera_model = ?, iso = ?,
                    shutter_speed = ?, aperture = ?, exposure_program = ?, focal_length = ?, latitude = ?, longitude = ?, duration = ?, fps = ?,
                    video_codec = ?, audio_codec = ?, bitrate = ?, has_audio = ?, updated_at = CURRENT_TIMESTAMP
                WHERE id = ?
                """,
                (
                    metadata["media_type"],
                    metadata["width"],
                    metadata["height"],
                    metadata["exif_date"],
                    metadata["camera_make"],
                    metadata["camera_model"],
                    metadata["iso"],
                    metadata["shutter_speed"],
                    metadata["aperture"],
                    metadata["exposure_program"],
                    metadata["focal_length"],
                    metadata.get("latitude"),
                    metadata.get("longitude"),
                    metadata.get("duration"),
                    metadata.get("fps"),
                    metadata.get("video_codec"),
                    metadata.get("audio_codec"),
                    metadata.get("bitrate"),
                    1 if metadata.get("has_audio") else 0,
                    row["id"],
                ),
            )
            updated = True
        enriched_rows.append(row_dict)

    if updated:
        await db.commit()

    return enriched_rows


@router.get("/browse", response_model=BrowseResponse)
async def browse_images(
    folder: str | None = None,
    folder_ids: str | None = Query(None, description="Comma-separated folder IDs to filter by"),
    search: str | None = None,
    sort: str = Query("filename", pattern="^(filename|size|created_at|width|height|star_rating|exif_date)$"),
    order: str = Query("asc", pattern="^(asc|desc)$"),
    page: int = Query(1, ge=1),
    page_size: int = Query(60, ge=1, le=200),
    rating_min: int | None = Query(None, ge=0, le=5),
    rating_max: int | None = Query(None, ge=0, le=5),
    color_label: str | None = Query(None, pattern="^(red|yellow|green|blue|purple)$"),
    flag: str | None = Query(None, pattern="^(pick|reject|unflagged)$"),
    collection_id: str | None = None,
    tags_filter: str | None = Query(None, description="Comma-separated tag names to filter by"),
    tags_mode: str = Query("any", pattern="^(any|all)$"),
):
    db = await get_db()

    joins: list[str] = []
    filters: list[str] = ["i.filename NOT LIKE '._%'"]
    params: list[object] = []

    if collection_id:
        joins.append("JOIN collection_members cm ON cm.image_id = i.id")
        filters.append("cm.collection_id = ?")
        params.append(collection_id)

    if folder:
        filters.append("i.folder LIKE ?")
        params.append(f"{folder}%")

    if folder_ids:
        # Resolve folder_ids to paths
        id_list = [fid.strip() for fid in folder_ids.split(",") if fid.strip()]
        if id_list:
            placeholders = ",".join("?" for _ in id_list)
            folder_cursor = await db.execute(
                f"SELECT path FROM folders WHERE id IN ({placeholders})", tuple(id_list)
            )
            folder_rows = await folder_cursor.fetchall()
            if folder_rows:
                folder_conditions = []
                for fr in folder_rows:
                    folder_conditions.append("i.folder LIKE ?")
                    params.append(f"{fr['path']}%")
                filters.append(f"({' OR '.join(folder_conditions)})")

    if search:
        filters.append("i.filename LIKE ?")
        params.append(f"%{search}%")

    if rating_min is not None:
        filters.append("COALESCE(i.star_rating, 0) >= ?")
        params.append(rating_min)

    if rating_max is not None:
        filters.append("COALESCE(i.star_rating, 0) <= ?")
        params.append(rating_max)

    if color_label:
        filters.append("i.color_label = ?")
        params.append(color_label)

    if flag:
        filters.append("COALESCE(i.flag, 'unflagged') = ?")
        params.append(flag)

    # Tag filtering
    if tags_filter:
        tag_names = _parse_tag_filter_names(tags_filter)
        if tag_names:
            if tags_mode == "all":
                for tag_name in tag_names:
                    filters.append(
                        """
                        EXISTS (
                            SELECT 1
                            FROM image_tags it2
                            JOIN tags t2 ON t2.id = it2.tag_id
                            WHERE it2.image_id = i.id
                              AND LOWER(t2.name) LIKE ? ESCAPE '\\'
                        )
                        """
                    )
                    params.append(_tag_like_pattern(tag_name))
            else:
                clauses = [("LOWER(t2.name) LIKE ? ESCAPE '\\'") for _ in tag_names]
                filters.append(
                    f"""
                    EXISTS (
                        SELECT 1
                        FROM image_tags it2
                        JOIN tags t2 ON t2.id = it2.tag_id
                        WHERE it2.image_id = i.id
                          AND ({' OR '.join(clauses)})
                    )
                    """
                )
                params.extend(_tag_like_pattern(tag_name) for tag_name in tag_names)

    join_clause = " ".join(joins)
    where = "WHERE " + " AND ".join(filters) if filters else ""

    # Count
    count_cursor = await db.execute(
        f"SELECT COUNT(*) as cnt FROM images i {join_clause} {where}", tuple(params)
    )
    count_row = await count_cursor.fetchone()
    total = count_row["cnt"]
    total_pages = max(1, math.ceil(total / page_size))

    # Fetch page
    safe_sort_map = {
        "filename": "i.filename",
        "size": "i.size",
        "created_at": "i.created_at",
        "width": "i.width",
        "height": "i.height",
        "star_rating": "COALESCE(i.star_rating, 0)",
        "exif_date": "i.exif_date",
    }
    safe_sort = safe_sort_map.get(sort, "i.filename")
    safe_order = "DESC" if order == "desc" else "ASC"
    offset = (page - 1) * page_size

    cursor = await db.execute(
        f"""
        SELECT i.id, i.filename, i.folder, i.path, i.format, i.size, i.width, i.height,
             COALESCE(i.media_type, 'image') AS media_type, i.duration, i.fps, i.video_codec,
             i.audio_codec, i.bitrate, COALESCE(i.has_audio, 0) AS has_audio,
                             i.camera_make, i.camera_model, i.iso, i.shutter_speed, i.aperture, i.exposure_program, i.focal_length,
               i.star_rating, i.color_label, i.flag, i.created_at,
               i.latitude, i.longitude,
               (SELECT GROUP_CONCAT(t3.name, '||')
                FROM image_tags it3 JOIN tags t3 ON t3.id = it3.tag_id
                WHERE it3.image_id = i.id) AS tags_concat
        FROM images i
        {join_clause}
        {where}
        ORDER BY {safe_sort} {safe_order}
        LIMIT ? OFFSET ?
        """,
        (*params, page_size, offset),
    )
    rows = await cursor.fetchall()
    enriched_rows = await _enrich_rows(rows, db)

    images = [
        BrowseImage(
            id=r["id"],
            filename=r["filename"],
            folder=r["folder"],
            path=r["path"],
            format=r["format"],
            media_type=r.get("media_type") or guess_media_type(r.get("format")),
            size=r["size"],
            width=r["width"],
            height=r["height"],
            duration=r.get("duration"),
            fps=r.get("fps"),
            video_codec=r.get("video_codec"),
            audio_codec=r.get("audio_codec"),
            bitrate=r.get("bitrate"),
            has_audio=bool(r.get("has_audio")),
            camera_make=r["camera_make"],
            camera_model=r["camera_model"],
            iso=r["iso"],
            shutter_speed=r["shutter_speed"],
            aperture=r.get("aperture"),
            exposure_program=r.get("exposure_program"),
            focal_length=r.get("focal_length"),
            star_rating=r.get("star_rating") or 0,
            color_label=r.get("color_label"),
            flag=r.get("flag") or "unflagged",
            created_at=r["created_at"],
            latitude=r["latitude"],
            longitude=r["longitude"],
            tags=[t for t in (r.get("tags_concat") or "").split("||")] if r.get("tags_concat") else [],
        )
        for r in enriched_rows
    ]

    return BrowseResponse(
        images=images,
        total=total,
        page=page,
        page_size=page_size,
        total_pages=total_pages,
    )
