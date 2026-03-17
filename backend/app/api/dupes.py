"""
Duplicate detection endpoints.
"""

import asyncio
from pathlib import Path

import numpy as np
from fastapi import APIRouter
from pydantic import BaseModel
from PIL import Image
import imagehash

from app.api.images import generate_preview, get_preview_path
from app.core.config import settings
from app.core.database import get_db

router = APIRouter()


class DupesScanRequest(BaseModel):
    folder_path: str | None = None
    force: bool = False


class DupesScanResponse(BaseModel):
    scanned: int
    skipped: int


class DupeMember(BaseModel):
    id: str
    filename: str
    folder: str
    phash: str
    hamming_distance: int


class DupeGroup(BaseModel):
    group_id: int
    members: list[DupeMember]


class DupeGroupsResponse(BaseModel):
    groups: list[DupeGroup]


def compute_phash(image_path: Path, hash_size: int = 8) -> str:
    with Image.open(image_path) as img:
        return str(imagehash.phash(img, hash_size=hash_size))


def hamming_distance(a: str, b: str) -> int:
    return bin(int(a, 16) ^ int(b, 16)).count("1")


@router.post("/dupes/scan", response_model=DupesScanResponse)
async def scan_dupes(request: DupesScanRequest):
    db = await get_db()

    folder_filter = ""
    params: list[str] = []
    if request.folder_path:
        folder_filter = "WHERE folder LIKE ? AND filename NOT LIKE '._%'"
        params.append(f"{request.folder_path}%")
    else:
        folder_filter = "WHERE filename NOT LIKE '._%'"

    cursor = await db.execute(
        f"SELECT id, path FROM images {folder_filter}",
        tuple(params),
    )
    rows = await cursor.fetchall()

    scanned = 0
    skipped = 0

    for row in rows:
        image_id = row["id"]
        source_path = Path(row["path"])
        if not source_path.exists():
            skipped += 1
            continue

        if not request.force:
            existing = await db.execute(
                "SELECT phash FROM quality_scores WHERE image_id = ?",
                (image_id,),
            )
            row = await existing.fetchone()
            if row and row["phash"]:
                skipped += 1
                continue

        preview_path = get_preview_path(image_id)
        if not preview_path.exists():
            await asyncio.to_thread(
                generate_preview, source_path, preview_path, settings.PREVIEW_MAX_SIZE
            )

        target_path = preview_path if preview_path.exists() else source_path

        try:
            phash = await asyncio.to_thread(compute_phash, target_path)
            await db.execute(
                """
                INSERT INTO quality_scores (image_id, phash, phash_scanned_at)
                VALUES (?, ?, CURRENT_TIMESTAMP)
                ON CONFLICT(image_id) DO UPDATE SET
                    phash = excluded.phash,
                    phash_scanned_at = CURRENT_TIMESTAMP
                """,
                (image_id, phash),
            )
            scanned += 1
        except Exception:
            skipped += 1

    await db.commit()

    return DupesScanResponse(scanned=scanned, skipped=skipped)


@router.get("/dupes/groups", response_model=DupeGroupsResponse)
async def get_dupe_groups(folder_path: str | None = None, threshold: int = 12):
    db = await get_db()

    filters = ["q.phash IS NOT NULL", "i.filename NOT LIKE '._%'"]
    params: list[object] = []
    if folder_path:
        filters.append("i.folder LIKE ?")
        params.append(f"{folder_path}%")

    where_clause = f"WHERE {' AND '.join(filters)}"

    cursor = await db.execute(
        f"""
        SELECT i.id, i.filename, i.folder, q.phash
        FROM quality_scores q
        JOIN images i ON i.id = q.image_id
        {where_clause}
        """,
        tuple(params),
    )
    rows = await cursor.fetchall()

    items = [
        {
            "id": row["id"],
            "filename": row["filename"],
            "folder": row["folder"],
            "phash": row["phash"],
        }
        for row in rows
    ]

    # --- Union-Find based grouping (replaces O(n^2) naive approach) ---
    parent: dict[str, str] = {}  # image_id -> root image_id

    def find(x: str) -> str:
        while parent[x] != x:
            parent[x] = parent[parent[x]]  # path compression
            x = parent[x]
        return x

    def union(a: str, b: str) -> None:
        ra, rb = find(a), find(b)
        if ra != rb:
            parent[ra] = rb

    for item in items:
        parent[item["id"]] = item["id"]

    # Compare all pairs — still O(n^2) in comparisons but with fast union-find grouping
    for i, item in enumerate(items):
        for j in range(i + 1, len(items)):
            other = items[j]
            if hamming_distance(item["phash"], other["phash"]) <= threshold:
                union(item["id"], other["id"])

    # Collect groups
    group_map: dict[str, list[dict]] = {}
    for item in items:
        root = find(item["id"])
        group_map.setdefault(root, []).append(item)

    groups = [g for g in group_map.values() if len(g) > 1]

    await db.execute("DELETE FROM duplicate_group_members")
    await db.execute("DELETE FROM duplicate_groups")

    response_groups: list[DupeGroup] = []

    for group in groups:
        cur = await db.execute(
            "INSERT INTO duplicate_groups (group_hash) VALUES (?)",
            (group[0]["phash"],),
        )
        group_id = cur.lastrowid
        members: list[DupeMember] = []

        for member in group:
            distance = hamming_distance(group[0]["phash"], member["phash"])
            await db.execute(
                """
                INSERT INTO duplicate_group_members (group_id, image_id, hamming_distance)
                VALUES (?, ?, ?)
                """,
                (group_id, member["id"], distance),
            )
            members.append(
                DupeMember(
                    id=member["id"],
                    filename=member["filename"],
                    folder=member["folder"],
                    phash=member["phash"],
                    hamming_distance=distance,
                )
            )

        response_groups.append(DupeGroup(group_id=group_id, members=members))

    await db.commit()

    return DupeGroupsResponse(groups=response_groups)