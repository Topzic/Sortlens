"""Map API – return geotagged images for the interactive map view."""

import logging

from fastapi import APIRouter, Query
from pydantic import BaseModel

from app.core.database import get_db

logger = logging.getLogger(__name__)

router = APIRouter()


class MapImage(BaseModel):
    id: str
    filename: str
    latitude: float
    longitude: float
    exif_date: str | None = None
    media_type: str = "image"


class MapResponse(BaseModel):
    images: list[MapImage]
    total: int


@router.get("/map/images", response_model=MapResponse)
async def get_map_images(
    folder_ids: str | None = Query(None, description="Comma-separated folder IDs"),
    collection_id: str | None = None,
):
    """Return all geotagged images for the selected folders/collection."""
    db = await get_db()

    joins: list[str] = []
    filters: list[str] = [
        "i.latitude IS NOT NULL",
        "i.longitude IS NOT NULL",
        "i.filename NOT LIKE '._%'",
    ]
    params: list[object] = []

    if collection_id:
        joins.append("JOIN collection_members cm ON cm.image_id = i.id")
        filters.append("cm.collection_id = ?")
        params.append(collection_id)

    if folder_ids:
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

    join_clause = " ".join(joins)
    where = "WHERE " + " AND ".join(filters)

    cursor = await db.execute(
        f"""
        SELECT i.id, i.filename, i.latitude, i.longitude, i.exif_date,
               COALESCE(i.media_type, 'image') AS media_type
        FROM images i
        {join_clause}
        {where}
        ORDER BY i.exif_date DESC
        """,
        tuple(params),
    )
    rows = await cursor.fetchall()

    images = [
        MapImage(
            id=row["id"],
            filename=row["filename"],
            latitude=row["latitude"],
            longitude=row["longitude"],
            exif_date=row["exif_date"],
            media_type=row["media_type"],
        )
        for row in rows
    ]

    return MapResponse(images=images, total=len(images))
