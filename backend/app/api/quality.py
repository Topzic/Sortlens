"""
Quality analysis endpoints (blur detection).
"""

import asyncio
from pathlib import Path
from typing import Literal

import numpy as np
from fastapi import APIRouter
from pydantic import BaseModel
from PIL import Image

from app.api.images import generate_preview, get_preview_path
from app.core.config import settings
from app.core.database import get_db
from app.core.tasks import create_task, run_task, TaskInfo

router = APIRouter()


class BlurScanRequest(BaseModel):
    folder_path: str | None = None
    force: bool = False


class BlurScanResponse(BaseModel):
    scanned: int
    skipped: int


class BlurScanAsyncResponse(BaseModel):
    task_id: str


class BlurResult(BaseModel):
    id: str
    path: str
    filename: str
    folder: str
    blur_score: float


class BlurResultsResponse(BaseModel):
    results: list[BlurResult]


def compute_blur_score(image_path: Path) -> float:
    with Image.open(image_path) as img:
        img = img.convert("L")
        img.thumbnail((512, 512))
        arr = np.asarray(img, dtype=np.float32)

    lap = (
        np.roll(arr, 1, axis=0)
        + np.roll(arr, -1, axis=0)
        + np.roll(arr, 1, axis=1)
        + np.roll(arr, -1, axis=1)
        - 4 * arr
    )
    return float(lap.var())


async def _blur_scan_worker(
    folder_path: str | None,
    force: bool,
    task: TaskInfo,
) -> dict:
    """Background worker that scans images for blur and reports progress."""
    db = await get_db()

    folder_filter = ""
    params: list[str] = []
    if folder_path:
        folder_filter = "WHERE folder LIKE ?"
        params.append(f"{folder_path}%")

    cursor = await db.execute(
        f"SELECT id, path FROM images {folder_filter}",
        tuple(params),
    )
    rows = await cursor.fetchall()

    task.total = len(rows)
    task.message = f"0 / {task.total} images"

    scanned = 0
    skipped = 0

    for idx, row in enumerate(rows, 1):
        image_id = row["id"]
        source_path = Path(row["path"])
        if not source_path.exists():
            skipped += 1
            task.progress = idx
            task.message = f"{idx} / {task.total} images ({scanned} analysed)"
            continue

        # Skip if already scanned unless forced
        if not force:
            existing = await db.execute(
                "SELECT blur_score FROM quality_scores WHERE image_id = ?",
                (image_id,),
            )
            if await existing.fetchone():
                skipped += 1
                task.progress = idx
                task.message = f"{idx} / {task.total} images ({scanned} analysed)"
                continue

        # Ensure a preview exists (helps with RAW files)
        preview_path = get_preview_path(image_id)
        if not preview_path.exists():
            await asyncio.to_thread(
                generate_preview, source_path, preview_path, settings.PREVIEW_MAX_SIZE
            )

        target_path = preview_path if preview_path.exists() else source_path

        try:
            score = await asyncio.to_thread(compute_blur_score, target_path)
            await db.execute(
                """
                INSERT INTO quality_scores (image_id, blur_score, blur_scanned_at)
                VALUES (?, ?, CURRENT_TIMESTAMP)
                ON CONFLICT(image_id) DO UPDATE SET
                    blur_score = excluded.blur_score,
                    blur_scanned_at = CURRENT_TIMESTAMP
                """,
                (image_id, score),
            )
            scanned += 1
        except Exception:
            skipped += 1

        task.progress = idx
        task.message = f"{idx} / {task.total} images ({scanned} analysed)"

        # Commit in batches so partial results are queryable
        if idx % 20 == 0:
            await db.commit()

    await db.commit()
    task.message = f"Done — {scanned} analysed, {skipped} skipped"
    return {"scanned": scanned, "skipped": skipped}


@router.post("/quality/blur/scan", response_model=BlurScanAsyncResponse)
async def scan_blur(request: BlurScanRequest):
    task = create_task("blur_scan")
    asyncio.ensure_future(
        run_task(task, _blur_scan_worker, request.folder_path, request.force)
    )
    return BlurScanAsyncResponse(task_id=task.id)


@router.get("/quality/blur/results", response_model=BlurResultsResponse)
async def blur_results(folder_path: str | None = None, threshold: float | None = None, limit: int = 200):
    db = await get_db()

    filters = []
    params: list[object] = []

    if folder_path:
        filters.append("i.folder LIKE ?")
        params.append(f"{folder_path}%")

    if threshold is not None:
        filters.append("q.blur_score <= ?")
        params.append(threshold)

    where_clause = f"WHERE {' AND '.join(filters)}" if filters else ""

    cursor = await db.execute(
        f"""
        SELECT i.id, i.path, i.filename, i.folder, q.blur_score
        FROM quality_scores q
        JOIN images i ON i.id = q.image_id
        {where_clause}
        ORDER BY q.blur_score ASC
        LIMIT ?
        """,
        tuple(params + [limit]),
    )
    rows = await cursor.fetchall()

    results = [
        BlurResult(
            id=row["id"],
            path=row["path"],
            filename=row["filename"],
            folder=row["folder"],
            blur_score=float(row["blur_score"]),
        )
        for row in rows
    ]

    return BlurResultsResponse(results=results)
