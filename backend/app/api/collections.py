"""Collections API – CRUD for user collections and smart collections."""

import json
import logging
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

from app.core.database import get_db

logger = logging.getLogger(__name__)
router = APIRouter()


# ── Models ────────────────────────────────────────────────────────


class CollectionCreate(BaseModel):
    name: str
    description: str = ""
    is_smart: bool = False
    smart_rules: dict | None = None  # e.g. {"rating_min": 3, "color_label": "red"}


class CollectionUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    smart_rules: dict | None = None


class CollectionOut(BaseModel):
    id: str
    name: str
    description: str
    is_smart: bool
    smart_rules: dict | None
    image_count: int
    created_at: str
    updated_at: str


class MemberAddRequest(BaseModel):
    image_ids: list[str]


class MemberRemoveRequest(BaseModel):
    image_ids: list[str]


# ── Endpoints ─────────────────────────────────────────────────────


@router.get("/collections", response_model=list[CollectionOut])
async def list_collections():
    db = await get_db()
    cursor = await db.execute(
        """
        SELECT c.*, COALESCE(m.cnt, 0) AS image_count
        FROM collections c
        LEFT JOIN (
            SELECT collection_id, COUNT(*) AS cnt FROM collection_members GROUP BY collection_id
        ) m ON m.collection_id = c.id
        ORDER BY c.name
        """
    )
    rows = await cursor.fetchall()
    return [
        CollectionOut(
            id=r["id"],
            name=r["name"],
            description=r["description"] or "",
            is_smart=bool(r["is_smart"]),
            smart_rules=json.loads(r["smart_rules"]) if r["smart_rules"] else None,
            image_count=r["image_count"],
            created_at=r["created_at"],
            updated_at=r["updated_at"],
        )
        for r in rows
    ]


@router.post("/collections", response_model=CollectionOut, status_code=201)
async def create_collection(body: CollectionCreate):
    if not body.name or not body.name.strip():
        raise HTTPException(status_code=422, detail="Collection name is required")
    db = await get_db()
    cid = uuid.uuid4().hex[:12]
    now = datetime.now(timezone.utc).isoformat()
    rules_json = json.dumps(body.smart_rules) if body.smart_rules else None
    await db.execute(
        "INSERT INTO collections (id, name, description, is_smart, smart_rules, created_at, updated_at) VALUES (?,?,?,?,?,?,?)",
        (cid, body.name.strip(), body.description.strip(), int(body.is_smart), rules_json, now, now),
    )
    await db.commit()
    return CollectionOut(
        id=cid,
        name=body.name.strip(),
        description=body.description.strip(),
        is_smart=body.is_smart,
        smart_rules=body.smart_rules,
        image_count=0,
        created_at=now,
        updated_at=now,
    )


@router.get("/collections/{collection_id}", response_model=CollectionOut)
async def get_collection(collection_id: str):
    db = await get_db()
    cursor = await db.execute("SELECT * FROM collections WHERE id = ?", (collection_id,))
    row = await cursor.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Collection not found")
    cnt_cursor = await db.execute(
        "SELECT COUNT(*) AS cnt FROM collection_members WHERE collection_id = ?", (collection_id,)
    )
    cnt_row = await cnt_cursor.fetchone()
    return CollectionOut(
        id=row["id"],
        name=row["name"],
        description=row["description"] or "",
        is_smart=bool(row["is_smart"]),
        smart_rules=json.loads(row["smart_rules"]) if row["smart_rules"] else None,
        image_count=cnt_row["cnt"],
        created_at=row["created_at"],
        updated_at=row["updated_at"],
    )


@router.put("/collections/{collection_id}", response_model=CollectionOut)
async def update_collection(collection_id: str, body: CollectionUpdate):
    db = await get_db()
    cursor = await db.execute("SELECT * FROM collections WHERE id = ?", (collection_id,))
    row = await cursor.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Collection not found")

    updates: list[str] = []
    params: list[object] = []
    if body.name is not None:
        updates.append("name = ?")
        params.append(body.name.strip())
    if body.description is not None:
        updates.append("description = ?")
        params.append(body.description.strip())
    if body.smart_rules is not None:
        updates.append("smart_rules = ?")
        params.append(json.dumps(body.smart_rules))

    if updates:
        now = datetime.now(timezone.utc).isoformat()
        updates.append("updated_at = ?")
        params.append(now)
        params.append(collection_id)
        await db.execute(
            f"UPDATE collections SET {', '.join(updates)} WHERE id = ?", tuple(params)
        )
        await db.commit()

    return await get_collection(collection_id)


@router.delete("/collections/{collection_id}")
async def delete_collection(collection_id: str):
    db = await get_db()
    cursor = await db.execute("SELECT id FROM collections WHERE id = ?", (collection_id,))
    if not await cursor.fetchone():
        raise HTTPException(status_code=404, detail="Collection not found")
    await db.execute("DELETE FROM collection_members WHERE collection_id = ?", (collection_id,))
    await db.execute("DELETE FROM collections WHERE id = ?", (collection_id,))
    await db.commit()
    return {"deleted": collection_id}


# ── Membership ────────────────────────────────────────────────────


@router.get("/collections/{collection_id}/images")
async def list_collection_images(
    collection_id: str,
    page: int = Query(1, ge=1),
    page_size: int = Query(60, ge=1, le=200),
):
    db = await get_db()
    cursor = await db.execute("SELECT id FROM collections WHERE id = ?", (collection_id,))
    if not await cursor.fetchone():
        raise HTTPException(status_code=404, detail="Collection not found")

    offset = (page - 1) * page_size
    cnt_cursor = await db.execute(
        "SELECT COUNT(*) AS cnt FROM collection_members WHERE collection_id = ?", (collection_id,)
    )
    total = (await cnt_cursor.fetchone())["cnt"]

    img_cursor = await db.execute(
        """
        SELECT i.id, i.filename, i.folder, i.path, i.format, i.size, i.width, i.height,
               i.star_rating, i.color_label, i.flag, i.created_at
        FROM images i
        JOIN collection_members cm ON cm.image_id = i.id
        WHERE cm.collection_id = ?
        ORDER BY cm.added_at DESC
        LIMIT ? OFFSET ?
        """,
        (collection_id, page_size, offset),
    )
    rows = await img_cursor.fetchall()
    return {
        "images": [dict(r) for r in rows],
        "total": total,
        "page": page,
        "page_size": page_size,
    }


@router.post("/collections/{collection_id}/images")
async def add_images_to_collection(collection_id: str, body: MemberAddRequest):
    db = await get_db()
    cursor = await db.execute("SELECT id FROM collections WHERE id = ?", (collection_id,))
    if not await cursor.fetchone():
        raise HTTPException(status_code=404, detail="Collection not found")

    now = datetime.now(timezone.utc).isoformat()
    added = 0
    for image_id in body.image_ids:
        try:
            await db.execute(
                "INSERT OR IGNORE INTO collection_members (collection_id, image_id, added_at) VALUES (?,?,?)",
                (collection_id, image_id, now),
            )
            added += 1
        except Exception:
            pass
    await db.commit()
    return {"added": added}


@router.delete("/collections/{collection_id}/images")
async def remove_images_from_collection(collection_id: str, body: MemberRemoveRequest):
    db = await get_db()
    for image_id in body.image_ids:
        await db.execute(
            "DELETE FROM collection_members WHERE collection_id = ? AND image_id = ?",
            (collection_id, image_id),
        )
    await db.commit()
    return {"removed": len(body.image_ids)}

