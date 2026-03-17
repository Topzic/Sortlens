"""Library management API – export / import database, detect missing files, remap paths."""

import json
import logging
import os
import shutil
import tempfile
from datetime import datetime, timezone
from pathlib import Path

import aiosqlite
from fastapi import APIRouter, UploadFile, File
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from app.core.config import settings
from app.core.database import get_db

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/library")

# ─── Export ────────────────────────────────────────────────────────────────────

EXPORT_TABLES = [
    "images",
    "folders",
    "collections",
    "collection_members",
    "sessions",
    "decisions",
    "quality_scores",
    "duplicate_groups",
    "duplicate_group_members",
    "audit_log",
    "settings",
]


@router.get("/export")
async def export_database():
    """Export the entire catalogue as a JSON file download."""
    db = await get_db()
    payload: dict[str, list[dict]] = {}

    for table in EXPORT_TABLES:
        try:
            cursor = await db.execute(f"SELECT * FROM {table}")  # noqa: S608  – table names are hardcoded above
            cols = [d[0] for d in cursor.description]
            rows = await cursor.fetchall()
            payload[table] = [dict(zip(cols, row)) for row in rows]
        except Exception:
            logger.warning("Skipping table %s during export", table, exc_info=True)

    data = json.dumps(payload, indent=2, default=str).encode("utf-8")
    stamp = datetime.now(tz=timezone.utc).strftime("%Y%m%d_%H%M%S")
    filename = f"sortlens_export_{stamp}.json"

    return StreamingResponse(
        iter([data]),
        media_type="application/json",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


# ─── Import ───────────────────────────────────────────────────────────────────

class ImportResult(BaseModel):
    success: bool
    tables_imported: list[str]
    rows_imported: dict[str, int]
    message: str


@router.post("/import", response_model=ImportResult)
async def import_database(file: UploadFile = File(...)):
    """Import a previously exported JSON catalogue, replacing current data."""
    content = await file.read()
    try:
        payload = json.loads(content)
    except (json.JSONDecodeError, ValueError) as exc:
        return ImportResult(
            success=False,
            tables_imported=[],
            rows_imported={},
            message=f"Invalid JSON: {exc}",
        )

    if not isinstance(payload, dict):
        return ImportResult(
            success=False,
            tables_imported=[],
            rows_imported={},
            message="Expected a JSON object at the top level.",
        )

    # Back up existing DB before overwriting
    db_path = settings.DATABASE_PATH
    backup_path = db_path.with_suffix(f".backup_{datetime.now(tz=timezone.utc).strftime('%Y%m%d_%H%M%S')}.db")
    if db_path.exists():
        shutil.copy2(str(db_path), str(backup_path))
        logger.info("Database backed up to %s", backup_path)

    db = await get_db()
    imported_tables: list[str] = []
    row_counts: dict[str, int] = {}

    for table in EXPORT_TABLES:
        rows = payload.get(table)
        if rows is None or not isinstance(rows, list):
            continue
        if len(rows) == 0:
            imported_tables.append(table)
            row_counts[table] = 0
            continue

        # Clear existing data
        await db.execute(f"DELETE FROM {table}")  # noqa: S608

        cols = list(rows[0].keys())
        # Verify columns exist in actual table
        cursor = await db.execute(f"PRAGMA table_info({table})")  # noqa: S608
        valid_cols = {r[1] for r in await cursor.fetchall()}
        cols = [c for c in cols if c in valid_cols]

        placeholders = ", ".join(["?"] * len(cols))
        col_names = ", ".join(cols)
        insert_sql = f"INSERT OR REPLACE INTO {table} ({col_names}) VALUES ({placeholders})"  # noqa: S608

        count = 0
        for row in rows:
            values = [row.get(c) for c in cols]
            try:
                await db.execute(insert_sql, values)
                count += 1
            except Exception:
                logger.warning("Skipping row in %s: %s", table, row, exc_info=True)

        imported_tables.append(table)
        row_counts[table] = count

    await db.commit()
    logger.info("Import complete: %s", row_counts)

    return ImportResult(
        success=True,
        tables_imported=imported_tables,
        rows_imported=row_counts,
        message=f"Imported {sum(row_counts.values())} rows across {len(imported_tables)} tables. A backup was saved.",
    )


# ─── Missing files ────────────────────────────────────────────────────────────

class MissingFolder(BaseModel):
    id: str
    path: str
    label: str | None
    image_count: int


class MissingImage(BaseModel):
    id: str
    path: str
    filename: str
    folder: str


class MissingFilesResponse(BaseModel):
    missing_folders: list[MissingFolder]
    missing_images_count: int
    total_images: int


@router.get("/missing", response_model=MissingFilesResponse)
async def check_missing_files():
    """Scan folders and images to detect which ones no longer exist on disk."""
    db = await get_db()

    # Check folders
    cursor = await db.execute("SELECT id, path, label, image_count FROM folders")
    folder_rows = await cursor.fetchall()
    missing_folders: list[MissingFolder] = []
    for row in folder_rows:
        if not os.path.isdir(row["path"]):
            missing_folders.append(MissingFolder(
                id=row["id"],
                path=row["path"],
                label=row["label"],
                image_count=row["image_count"] or 0,
            ))

    # Count missing images (spot check – files whose path no longer exists)
    cursor = await db.execute("SELECT COUNT(*) FROM images")
    total = (await cursor.fetchone())[0]

    cursor = await db.execute("SELECT id, path FROM images")
    image_rows = await cursor.fetchall()
    missing_count = 0
    for row in image_rows:
        if not os.path.isfile(row["path"]):
            missing_count += 1

    return MissingFilesResponse(
        missing_folders=missing_folders,
        missing_images_count=missing_count,
        total_images=total,
    )


# ─── Missing images detail (paginated) ────────────────────────────────────────

class MissingImagesResponse(BaseModel):
    images: list[MissingImage]
    total: int
    page: int
    page_size: int


@router.get("/missing/images", response_model=MissingImagesResponse)
async def get_missing_images(page: int = 1, page_size: int = 100):
    """Return paginated list of images whose files are missing from disk."""
    db = await get_db()
    cursor = await db.execute("SELECT id, path, filename, folder FROM images")
    all_rows = await cursor.fetchall()

    missing: list[MissingImage] = []
    for row in all_rows:
        if not os.path.isfile(row["path"]):
            missing.append(MissingImage(
                id=row["id"],
                path=row["path"],
                filename=row["filename"],
                folder=row["folder"],
            ))

    total = len(missing)
    start = (page - 1) * page_size
    page_items = missing[start : start + page_size]

    return MissingImagesResponse(images=page_items, total=total, page=page, page_size=page_size)


# ─── Remap folder path ────────────────────────────────────────────────────────

class RemapFolderRequest(BaseModel):
    folder_id: str
    new_path: str


class RemapFolderResponse(BaseModel):
    success: bool
    folder_id: str
    old_path: str
    new_path: str
    images_updated: int
    message: str


@router.post("/remap-folder", response_model=RemapFolderResponse)
async def remap_folder(req: RemapFolderRequest):
    """Change a folder's root path and update all image paths underneath it."""
    new_path = req.new_path.rstrip("/\\")
    if not os.path.isdir(new_path):
        return RemapFolderResponse(
            success=False,
            folder_id=req.folder_id,
            old_path="",
            new_path=new_path,
            images_updated=0,
            message="The new path does not exist or is not a directory.",
        )

    db = await get_db()
    cursor = await db.execute("SELECT id, path FROM folders WHERE id = ?", (req.folder_id,))
    row = await cursor.fetchone()
    if not row:
        return RemapFolderResponse(
            success=False,
            folder_id=req.folder_id,
            old_path="",
            new_path=new_path,
            images_updated=0,
            message="Folder not found in database.",
        )

    old_path = row["path"]

    # Update folder record
    await db.execute("UPDATE folders SET path = ? WHERE id = ?", (new_path, req.folder_id))

    # Update every image whose path starts with old_path
    cursor = await db.execute(
        "SELECT id, path FROM images WHERE path LIKE ? OR folder = ?",
        (old_path + "%", old_path),
    )
    images = await cursor.fetchall()

    count = 0
    for img in images:
        img_old = img["path"]
        if img_old.startswith(old_path):
            img_new = new_path + img_old[len(old_path):]
        else:
            img_new = img_old.replace(old_path, new_path, 1)

        new_folder = new_path
        await db.execute(
            "UPDATE images SET path = ?, folder = ? WHERE id = ?",
            (img_new, new_folder, img["id"]),
        )
        count += 1

    # Also update sessions that reference the old folder path
    await db.execute(
        "UPDATE sessions SET folder_path = ? WHERE folder_path = ?",
        (new_path, old_path),
    )

    # Update current_folder_path setting if it matches
    await db.execute(
        "UPDATE settings SET value = ? WHERE key = 'current_folder_path' AND value = ?",
        (new_path, old_path),
    )

    await db.commit()
    logger.info("Remapped folder %s → %s (%d images)", old_path, new_path, count)

    return RemapFolderResponse(
        success=True,
        folder_id=req.folder_id,
        old_path=old_path,
        new_path=new_path,
        images_updated=count,
        message=f"Remapped {count} images from {old_path} → {new_path}",
    )


# ─── Remove missing folder (and its images) ──────────────────────────────────

class RemoveMissingResponse(BaseModel):
    success: bool
    removed_folders: int
    removed_images: int
    message: str


@router.post("/remove-missing")
async def remove_missing_folder(folder_id: str | None = None):
    """Remove a specific missing folder (or all missing folders) and their orphaned images."""
    db = await get_db()

    if folder_id:
        # Remove a single folder
        cursor = await db.execute("SELECT path FROM folders WHERE id = ?", (folder_id,))
        row = await cursor.fetchone()
        if not row:
            return RemoveMissingResponse(success=False, removed_folders=0, removed_images=0, message="Folder not found.")

        folder_path = row["path"]
        cursor = await db.execute("DELETE FROM images WHERE folder = ? OR path LIKE ?", (folder_path, folder_path + "%"))
        img_count = cursor.rowcount
        await db.execute("DELETE FROM collection_members WHERE image_id NOT IN (SELECT id FROM images)")
        await db.execute("DELETE FROM folders WHERE id = ?", (folder_id,))
        await db.commit()

        return RemoveMissingResponse(
            success=True,
            removed_folders=1,
            removed_images=img_count,
            message=f"Removed folder and {img_count} images.",
        )
    else:
        # Remove ALL missing folders
        cursor = await db.execute("SELECT id, path FROM folders")
        all_folders = await cursor.fetchall()
        removed_f = 0
        removed_i = 0
        for f in all_folders:
            if not os.path.isdir(f["path"]):
                cursor = await db.execute("DELETE FROM images WHERE folder = ? OR path LIKE ?", (f["path"], f["path"] + "%"))
                removed_i += cursor.rowcount
                await db.execute("DELETE FROM folders WHERE id = ?", (f["id"],))
                removed_f += 1

        await db.execute("DELETE FROM collection_members WHERE image_id NOT IN (SELECT id FROM images)")
        await db.commit()
        return RemoveMissingResponse(
            success=True,
            removed_folders=removed_f,
            removed_images=removed_i,
            message=f"Removed {removed_f} missing folders and {removed_i} orphaned images.",
        )


# ─── Remove individual missing images ─────────────────────────────────────────

@router.post("/remove-missing-images")
async def remove_missing_images():
    """Remove all image records whose files no longer exist on disk."""
    db = await get_db()
    cursor = await db.execute("SELECT id, path FROM images")
    all_images = await cursor.fetchall()

    missing_ids = []
    for img in all_images:
        if not os.path.isfile(img["path"]):
            missing_ids.append(img["id"])

    removed = len(missing_ids)

    # Batch delete in chunks to avoid SQL parameter limits
    chunk_size = 500
    for i in range(0, len(missing_ids), chunk_size):
        chunk = missing_ids[i:i + chunk_size]
        placeholders = ",".join("?" * len(chunk))
        await db.execute(f"DELETE FROM decisions WHERE image_id IN ({placeholders})", chunk)
        await db.execute(f"DELETE FROM duplicate_group_members WHERE image_id IN ({placeholders})", chunk)
        await db.execute(f"DELETE FROM quality_scores WHERE image_id IN ({placeholders})", chunk)
        await db.execute(f"DELETE FROM collection_members WHERE image_id IN ({placeholders})", chunk)
        await db.execute(f"DELETE FROM images WHERE id IN ({placeholders})", chunk)

    # Update folder image counts
    await db.execute("""
        UPDATE folders SET image_count = (
            SELECT COUNT(*) FROM images WHERE images.folder = folders.path
        )
    """)

    await db.commit()
    return {"success": True, "removed": removed, "message": f"Removed {removed} missing image records."}
