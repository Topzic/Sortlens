"""
Folder scanning and indexing API endpoints.
Multi-folder management with add/remove/list/rescan.
"""

import asyncio
import hashlib
import logging
import os
from pathlib import Path

from fastapi import APIRouter, HTTPException

logger = logging.getLogger(__name__)
from pydantic import BaseModel

from app.core.config import settings
from app.core.database import get_db
from app.core.image_metadata import extract_image_metadata

router = APIRouter()


class FolderValidateRequest(BaseModel):
    path: str


class FolderValidateResponse(BaseModel):
    valid: bool
    path: str
    image_count: int
    total_size: int  # bytes
    error: str | None = None


class FolderScanRequest(BaseModel):
    path: str


class FolderScanResponse(BaseModel):
    success: bool
    folder_id: str
    path: str
    image_count: int
    message: str


class FolderStatusResponse(BaseModel):
    folder_id: str | None
    path: str | None
    image_count: int
    scanned: bool


class RegisteredFolder(BaseModel):
    id: str
    path: str
    label: str
    added_at: str | None = None
    last_scanned_at: str | None = None
    image_count: int


class FolderAddRequest(BaseModel):
    path: str
    label: str | None = None


class FolderUpdateRequest(BaseModel):
    label: str


class FolderListResponse(BaseModel):
    folders: list[RegisteredFolder]
    total_images: int


def get_folder_id(path: str) -> str:
    """Generate a stable ID for a folder path."""
    return hashlib.sha256(path.encode()).hexdigest()[:16]


def is_image_file(filename: str) -> bool:
    """Check if a file is a supported image format."""
    name = filename.lower()
    if name.startswith("._"):
        return False
    if name in {".ds_store", "thumbs.db"}:
        return False
    return name.endswith(settings.SUPPORTED_FORMATS)


def scan_folder_for_images(folder_path: Path) -> list[dict]:
    """Recursively scan a folder for image files (sync, run via to_thread)."""
    images = []

    for root, _, files in os.walk(folder_path):
        for filename in files:
            if is_image_file(filename):
                filepath = Path(root) / filename
                try:
                    stat = filepath.stat()
                    ext = filepath.suffix.lower().lstrip(".")
                    img_id = hashlib.sha256(str(filepath).encode()).hexdigest()[:16]
                    metadata = extract_image_metadata(filepath)

                    images.append({
                        "id": img_id,
                        "path": str(filepath),
                        "filename": filename,
                        "folder": root,
                        "size": stat.st_size,
                        "mtime": int(stat.st_mtime),
                        "format": ext,
                        "width": metadata["width"],
                        "height": metadata["height"],
                        "exif_date": metadata["exif_date"],
                        "camera_make": metadata["camera_make"],
                        "camera_model": metadata["camera_model"],
                        "iso": metadata["iso"],
                        "shutter_speed": metadata["shutter_speed"],
                        "aperture": metadata["aperture"],
                        "latitude": metadata.get("latitude"),
                        "longitude": metadata.get("longitude"),
                    })
                except (OSError, PermissionError):
                    continue

    return images


@router.post("/folders/validate", response_model=FolderValidateResponse)
async def validate_folder(request: FolderValidateRequest):
    """Validate a folder path and return image count via quick scan."""
    path = Path(request.path)

    if not path.exists():
        return FolderValidateResponse(
            valid=False, path=request.path, image_count=0, total_size=0,
            error="Folder does not exist",
        )

    if not path.is_dir():
        return FolderValidateResponse(
            valid=False, path=request.path, image_count=0, total_size=0,
            error="Path is not a folder",
        )

    # Run the sync scan in a thread so we don't block the event loop
    images = await asyncio.to_thread(scan_folder_for_images, path)
    total_size = sum(img["size"] for img in images)

    logger.info("Validated folder %s: %d images, %d bytes", path, len(images), total_size)

    return FolderValidateResponse(
        valid=True, path=str(path.resolve()), image_count=len(images),
        total_size=total_size, error=None,
    )


@router.post("/folders/scan", response_model=FolderScanResponse)
async def scan_folder(request: FolderScanRequest):
    """Scan a folder and index all images into the database."""
    path = Path(request.path)

    if not path.exists() or not path.is_dir():
        raise HTTPException(status_code=400, detail="Invalid folder path")

    resolved_path = str(path.resolve())
    folder_id = get_folder_id(resolved_path)

    # Run sync file-system scan in a thread
    images = await asyncio.to_thread(scan_folder_for_images, path)

    if not images:
        return FolderScanResponse(
            success=True, folder_id=folder_id, path=resolved_path,
            image_count=0, message="No images found in folder",
        )

    # Store in database
    db = await get_db()

    # Clear previous entries for this folder
    await db.execute(
        "DELETE FROM images WHERE folder LIKE ?",
        (f"{resolved_path}%",)
    )

    # Batch insert using executemany
    rows = [
        (
            img["id"], img["path"], img["filename"], img["folder"],
            img["mtime"], img["size"], img["format"],
            img["width"], img["height"], img["exif_date"],
            img["camera_make"], img["camera_model"], img["iso"], img["shutter_speed"],
            img["aperture"], img.get("latitude"), img.get("longitude"),
        )
        for img in images
    ]
    await db.executemany(
        """
        INSERT OR REPLACE INTO images
            (id, path, filename, folder, mtime, size, format, width, height, exif_date, camera_make, camera_model, iso, shutter_speed, aperture, latitude, longitude, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        """,
        rows,
    )
    await db.commit()

    # Save the current folder in settings
    await db.execute(
        "INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES ('current_folder_path', ?, CURRENT_TIMESTAMP)",
        (resolved_path,),
    )
    await db.execute(
        "INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES ('current_folder_id', ?, CURRENT_TIMESTAMP)",
        (folder_id,),
    )
    await db.commit()

    logger.info("Scanned folder %s: indexed %d images", resolved_path, len(images))

    return FolderScanResponse(
        success=True, folder_id=folder_id, path=resolved_path,
        image_count=len(images), message=f"Successfully indexed {len(images)} images",
    )


@router.get("/folders/current", response_model=FolderStatusResponse)
async def get_current_folder():
    """
    Get the currently selected folder status.
    """
    db = await get_db()
    
    # Get current folder from settings
    cursor = await db.execute(
        "SELECT value FROM settings WHERE key = 'current_folder_path'"
    )
    path_row = await cursor.fetchone()
    
    cursor = await db.execute(
        "SELECT value FROM settings WHERE key = 'current_folder_id'"
    )
    id_row = await cursor.fetchone()
    
    if path_row and path_row["value"]:
        current_path = path_row["value"]
        current_id = id_row["value"] if id_row else get_folder_id(current_path)
        
        # Count images for the current folder only
        cursor = await db.execute(
            "SELECT COUNT(*) as count FROM images WHERE folder LIKE ?",
            (f"{current_path}%",)
        )
        row = await cursor.fetchone()
        count = row["count"] if row else 0
        
        return FolderStatusResponse(
            folder_id=current_id,
            path=current_path,
            image_count=count,
            scanned=count > 0
        )
    
    return FolderStatusResponse(
        folder_id=None,
        path=None,
        image_count=0,
        scanned=False
    )


# --- Multi-folder management endpoints ---

@router.get("/folders", response_model=FolderListResponse)
async def list_folders():
    """List all registered folders with image counts."""
    db = await get_db()
    cursor = await db.execute(
        "SELECT id, path, label, added_at, last_scanned_at, image_count FROM folders ORDER BY added_at DESC"
    )
    rows = await cursor.fetchall()

    folders = []
    for row in rows:
        # Get live image count from images table
        count_cursor = await db.execute(
            "SELECT COUNT(*) as cnt FROM images WHERE folder LIKE ?",
            (f"{row['path']}%",),
        )
        count_row = await count_cursor.fetchone()
        live_count = count_row["cnt"] if count_row else 0

        folders.append(
            RegisteredFolder(
                id=row["id"],
                path=row["path"],
                label=row["label"] or Path(row["path"]).name,
                added_at=row["added_at"],
                last_scanned_at=row["last_scanned_at"],
                image_count=live_count,
            )
        )

    # Total across all registered folders
    total_cursor = await db.execute("SELECT COUNT(*) as cnt FROM images")
    total_row = await total_cursor.fetchone()
    total_images = total_row["cnt"] if total_row else 0

    return FolderListResponse(folders=folders, total_images=total_images)


@router.post("/folders/add", response_model=RegisteredFolder)
async def add_folder(request: FolderAddRequest):
    """Register a new folder, validate & scan it."""
    path = Path(request.path)

    if not path.exists() or not path.is_dir():
        raise HTTPException(status_code=400, detail="Invalid folder path")

    resolved_path = str(path.resolve())
    folder_id = get_folder_id(resolved_path)
    label = request.label or path.name

    db = await get_db()

    # Check if already registered
    cursor = await db.execute("SELECT id FROM folders WHERE id = ?", (folder_id,))
    existing = await cursor.fetchone()
    if existing:
        raise HTTPException(status_code=409, detail="Folder already registered")

    # Scan images
    images = await asyncio.to_thread(scan_folder_for_images, path)

    # Register folder
    await db.execute(
        "INSERT INTO folders (id, path, label, added_at, last_scanned_at, image_count) VALUES (?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, ?)",
        (folder_id, resolved_path, label, len(images)),
    )

    # Index images
    if images:
        rows = [
            (
                img["id"], img["path"], img["filename"], img["folder"],
                img["mtime"], img["size"], img["format"],
                img["width"], img["height"], img["exif_date"],
                img["camera_make"], img["camera_model"], img["iso"], img["shutter_speed"],
                img["aperture"],
            )
            for img in images
        ]
        await db.executemany(
            """
            INSERT OR REPLACE INTO images
                (id, path, filename, folder, mtime, size, format, width, height, exif_date, camera_make, camera_model, iso, shutter_speed, aperture, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
            """,
            rows,
        )

    # Set as current folder
    await db.execute(
        "INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES ('current_folder_path', ?, CURRENT_TIMESTAMP)",
        (resolved_path,),
    )
    await db.execute(
        "INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES ('current_folder_id', ?, CURRENT_TIMESTAMP)",
        (folder_id,),
    )
    await db.commit()

    logger.info("Added folder %s: indexed %d images", resolved_path, len(images))

    return RegisteredFolder(
        id=folder_id,
        path=resolved_path,
        label=label,
        image_count=len(images),
    )


@router.get("/folders/{folder_id}/collection-impact")
async def get_folder_collection_impact(folder_id: str):
    """Return how many images in this folder are part of collections."""
    db = await get_db()

    cursor = await db.execute("SELECT path FROM folders WHERE id = ?", (folder_id,))
    row = await cursor.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Folder not found")

    folder_path = row["path"]
    cursor = await db.execute(
        """
        SELECT COUNT(DISTINCT cm.image_id) as count
        FROM collection_members cm
        JOIN images i ON cm.image_id = i.id
        WHERE i.folder LIKE ?
        """,
        (f"{folder_path}%",),
    )
    result = await cursor.fetchone()
    return {"collection_image_count": result["count"] if result else 0}


@router.delete("/folders/{folder_id}")
async def remove_folder(folder_id: str):
    """Unregister a folder and optionally remove its images from the database."""
    db = await get_db()

    cursor = await db.execute("SELECT path FROM folders WHERE id = ?", (folder_id,))
    row = await cursor.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Folder not found")

    folder_path = row["path"]

    # Remove images belonging to this folder (CASCADE will clean collection_members)
    await db.execute("DELETE FROM images WHERE folder LIKE ?", (f"{folder_path}%",))
    # Safety net: clean up any orphaned collection_members
    await db.execute("DELETE FROM collection_members WHERE image_id NOT IN (SELECT id FROM images)")
    # Remove the folder registration
    await db.execute("DELETE FROM folders WHERE id = ?", (folder_id,))

    # If this was the current folder, clear it
    cursor = await db.execute(
        "SELECT value FROM settings WHERE key = 'current_folder_id'"
    )
    current = await cursor.fetchone()
    if current and current["value"] == folder_id:
        await db.execute("DELETE FROM settings WHERE key IN ('current_folder_path', 'current_folder_id')")

    await db.commit()
    logger.info("Removed folder %s (%s)", folder_id, folder_path)

    return {"success": True, "folder_id": folder_id}


@router.post("/folders/{folder_id}/rescan", response_model=RegisteredFolder)
async def rescan_folder(folder_id: str):
    """Re-scan a registered folder to pick up new/changed files."""
    db = await get_db()

    cursor = await db.execute("SELECT path, label FROM folders WHERE id = ?", (folder_id,))
    row = await cursor.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Folder not found")

    folder_path = row["path"]
    label = row["label"]
    path = Path(folder_path)

    if not path.exists() or not path.is_dir():
        raise HTTPException(status_code=400, detail="Folder path no longer exists")

    images = await asyncio.to_thread(scan_folder_for_images, path)

    # Clear old images for this folder and re-insert
    await db.execute("DELETE FROM images WHERE folder LIKE ?", (f"{folder_path}%",))

    if images:
        rows = [
            (
                img["id"], img["path"], img["filename"], img["folder"],
                img["mtime"], img["size"], img["format"],
                img["width"], img["height"], img["exif_date"],
                img["camera_make"], img["camera_model"], img["iso"], img["shutter_speed"],
                img["aperture"], img.get("latitude"), img.get("longitude"),
            )
            for img in images
        ]
        await db.executemany(
            """
            INSERT OR REPLACE INTO images
                (id, path, filename, folder, mtime, size, format, width, height, exif_date, camera_make, camera_model, iso, shutter_speed, aperture, latitude, longitude, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
            """,
            rows,
        )

    await db.execute(
        "UPDATE folders SET last_scanned_at = CURRENT_TIMESTAMP, image_count = ? WHERE id = ?",
        (len(images), folder_id),
    )
    await db.commit()

    logger.info("Rescanned folder %s: %d images", folder_path, len(images))

    return RegisteredFolder(
        id=folder_id,
        path=folder_path,
        label=label or Path(folder_path).name,
        image_count=len(images),
    )


@router.post("/folders/{folder_id}/open")
async def open_folder_in_explorer(folder_id: str):
    """Open a registered folder in the OS file explorer."""
    import subprocess
    import platform

    db = await get_db()
    cursor = await db.execute("SELECT path FROM folders WHERE id = ?", (folder_id,))
    row = await cursor.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Folder not found")

    folder_path = Path(row["path"])
    if not folder_path.exists():
        raise HTTPException(status_code=404, detail="Folder no longer exists on disk")

    try:
        system = platform.system()
        if system == "Windows":
            subprocess.Popen(["explorer.exe", str(folder_path)])
        elif system == "Darwin":
            subprocess.Popen(["open", str(folder_path)])
        else:
            subprocess.Popen(["xdg-open", str(folder_path)])
        return {"success": True, "path": str(folder_path)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to open folder: {str(e)}")


@router.put("/folders/{folder_id}", response_model=RegisteredFolder)
async def update_folder(folder_id: str, request: FolderUpdateRequest):
    """Update folder label."""
    db = await get_db()

    cursor = await db.execute("SELECT path, image_count, added_at, last_scanned_at FROM folders WHERE id = ?", (folder_id,))
    row = await cursor.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Folder not found")

    await db.execute("UPDATE folders SET label = ? WHERE id = ?", (request.label, folder_id))
    await db.commit()

    return RegisteredFolder(
        id=folder_id,
        path=row["path"],
        label=request.label,
        added_at=row["added_at"],
        last_scanned_at=row["last_scanned_at"],
        image_count=row["image_count"],
    )
