"""
Image serving and preview generation API endpoints.
"""

import asyncio
import hashlib
import io
import logging
from pathlib import Path

from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse, StreamingResponse
from PIL import Image, ImageDraw, ImageFont
from pydantic import BaseModel

from app.core.config import settings
from app.core.database import get_db

logger = logging.getLogger(__name__)

router = APIRouter()

# EXIF orientation tag number
_ORIENTATION_TAG = 0x0112

# RAW file extensions that need special handling
RAW_EXTENSIONS = {'.nef', '.cr2', '.cr3', '.arw', '.raf', '.orf', '.rw2', '.dng', '.raw'}

# Limit concurrent RAW processing to avoid memory spikes
_raw_semaphore = asyncio.Semaphore(3)


def get_preview_path(image_id: str) -> Path:
    """Get the cache path for a preview image."""
    return settings.PREVIEW_DIR / f"{image_id}.jpg"


def open_raw_image(source_path: Path) -> Image.Image:
    """Open a RAW image file using rawpy, falling back to embedded thumbnail."""
    try:
        import rawpy
        with rawpy.imread(str(source_path)) as raw:
            try:
                rgb = raw.postprocess(
                    use_camera_wb=True,
                    half_size=True,
                    no_auto_bright=False,
                    output_bps=8,
                )
                return Image.fromarray(rgb)
            except Exception as postprocess_error:
                try:
                    thumb = raw.extract_thumb()
                    if thumb.format == rawpy.ThumbFormat.JPEG:
                        return Image.open(io.BytesIO(thumb.data))
                    if thumb.format == rawpy.ThumbFormat.BITMAP:
                        return Image.fromarray(thumb.data)
                except Exception as thumb_error:
                    logger.warning(
                        "RAW postprocess failed for %s: %s. Thumbnail extraction failed: %s",
                        source_path, postprocess_error, thumb_error,
                    )
                    raise
    except ImportError:
        logger.error("rawpy not installed. Install with: pip install rawpy")
        raise
    except Exception as e:
        logger.warning("Error opening RAW file %s: %s", source_path, e)
        raise


def generate_preview(source_path: Path, preview_path: Path, max_size: int = 1600) -> bool:
    """Generate a preview image from source (sync, run via to_thread)."""
    try:
        ext = source_path.suffix.lower()

        if ext in RAW_EXTENSIONS:
            img = open_raw_image(source_path)
        else:
            img = Image.open(source_path)

        with img:
            # Handle EXIF orientation using tag number directly
            if ext not in RAW_EXTENSIONS:
                try:
                    exif = img._getexif()
                    if exif is not None:
                        orientation_value = exif.get(_ORIENTATION_TAG)
                        if orientation_value == 2:
                            img = img.transpose(Image.Transpose.FLIP_LEFT_RIGHT)
                        elif orientation_value == 3:
                            img = img.rotate(180, expand=True)
                        elif orientation_value == 4:
                            img = img.transpose(Image.Transpose.FLIP_TOP_BOTTOM)
                        elif orientation_value == 5:
                            img = img.transpose(Image.Transpose.FLIP_LEFT_RIGHT).rotate(270, expand=True)
                        elif orientation_value == 6:
                            img = img.rotate(270, expand=True)
                        elif orientation_value == 7:
                            img = img.transpose(Image.Transpose.FLIP_LEFT_RIGHT).rotate(90, expand=True)
                        elif orientation_value == 8:
                            img = img.rotate(90, expand=True)
                except (AttributeError, KeyError, IndexError):
                    pass

            # Convert to RGB if necessary
            if img.mode in ('RGBA', 'LA', 'P'):
                background = Image.new('RGB', img.size, (255, 255, 255))
                if img.mode == 'P':
                    img = img.convert('RGBA')
                background.paste(img, mask=img.split()[-1] if img.mode == 'RGBA' else None)
                img = background
            elif img.mode != 'RGB':
                img = img.convert('RGB')

            # Resize maintaining aspect ratio
            img.thumbnail((max_size, max_size), Image.Resampling.LANCZOS)

            # Save preview
            preview_path.parent.mkdir(parents=True, exist_ok=True)
            img.save(preview_path, 'JPEG', quality=settings.PREVIEW_QUALITY)

            return True
    except Exception as e:
        logger.warning("Error generating preview for %s: %s", source_path, e)
        return False


def _generate_placeholder(preview_path: Path, filename: str) -> None:
    """Generate a dark placeholder image for files that fail preview generation."""
    img = Image.new('RGB', (400, 300), (40, 40, 48))
    draw = ImageDraw.Draw(img)
    # Draw filename text centered
    try:
        font = ImageFont.load_default()
    except Exception:
        font = None
    text = filename if len(filename) < 35 else filename[:32] + '...'
    bbox = draw.textbbox((0, 0), text, font=font)
    tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
    draw.text(((400 - tw) / 2, (300 - th) / 2), text, fill=(160, 160, 170), font=font)
    preview_path.parent.mkdir(parents=True, exist_ok=True)
    img.save(preview_path, 'JPEG', quality=80)


@router.get("/images/{image_id}/preview")
async def get_image_preview(image_id: str):
    """Get a preview (resized) version of an image."""
    db = await get_db()
    
    # Get image info from database
    cursor = await db.execute(
        "SELECT * FROM images WHERE id = ?",
        (image_id,)
    )
    image = await cursor.fetchone()
    
    if not image:
        raise HTTPException(status_code=404, detail="Image not found")
    
    source_path = Path(image["path"])
    
    if not source_path.exists():
        raise HTTPException(status_code=404, detail="Image file not found on disk")
    
    # Check if preview exists in cache
    preview_path = get_preview_path(image_id)

    if not preview_path.exists():
        ext = source_path.suffix.lower()
        is_raw = ext in RAW_EXTENSIONS

        # Throttle concurrent RAW processing
        if is_raw:
            async with _raw_semaphore:
                success = await asyncio.to_thread(
                    generate_preview, source_path, preview_path, settings.PREVIEW_MAX_SIZE
                )
        else:
            success = await asyncio.to_thread(
                generate_preview, source_path, preview_path, settings.PREVIEW_MAX_SIZE
            )

        if not success:
            if is_raw:
                # Generate a placeholder so we don't retry every request
                await asyncio.to_thread(
                    _generate_placeholder, preview_path, image["filename"]
                )
            else:
                # Fall back to serving original for non-RAW files
                return FileResponse(
                    source_path,
                    media_type=f"image/{image['format'] or 'jpeg'}",
                )
    
    return FileResponse(
        preview_path,
        media_type="image/jpeg",
        headers={"Cache-Control": "public, max-age=86400, immutable"},
    )


@router.get("/images/{image_id}/full")
async def get_image_full(image_id: str):
    """Get the full-resolution original image."""
    db = await get_db()
    
    cursor = await db.execute(
        "SELECT * FROM images WHERE id = ?",
        (image_id,)
    )
    image = await cursor.fetchone()
    
    if not image:
        raise HTTPException(status_code=404, detail="Image not found")
    
    source_path = Path(image["path"])
    
    if not source_path.exists():
        raise HTTPException(status_code=404, detail="Image file not found on disk")
    
    # Determine media type
    format_map = {
        "jpg": "image/jpeg",
        "jpeg": "image/jpeg",
        "png": "image/png",
        "webp": "image/webp",
        "gif": "image/gif",
        "tif": "image/tiff",
        "tiff": "image/tiff",
        "heic": "image/heic",
        "heif": "image/heif",
        "nef": "image/x-nikon-nef",
        "cr2": "image/x-canon-cr2",
        "arw": "image/x-sony-arw",
    }
    
    media_type = format_map.get(image["format"], "application/octet-stream")
    
    return FileResponse(source_path, media_type=media_type)


@router.get("/images/{image_id}/info")
async def get_image_info(image_id: str):
    """Get metadata about an image."""
    db = await get_db()
    
    cursor = await db.execute(
        "SELECT * FROM images WHERE id = ?",
        (image_id,)
    )
    image = await cursor.fetchone()
    
    if not image:
        raise HTTPException(status_code=404, detail="Image not found")
    
    return {
        "id": image["id"],
        "path": image["path"],
        "filename": image["filename"],
        "folder": image["folder"],
        "size": image["size"],
        "width": image["width"],
        "height": image["height"],
        "format": image["format"],
        "mtime": image["mtime"],
        "exif_date": image["exif_date"],
        "camera_make": image["camera_make"],
        "camera_model": image["camera_model"],
        "iso": image["iso"],
        "shutter_speed": image["shutter_speed"],
        "aperture": image["aperture"],
    }


@router.post("/images/{image_id}/reveal")
async def reveal_image_in_explorer(image_id: str):
    """Open the file explorer with the image file selected."""
    import os
    import subprocess
    import platform
    
    db = await get_db()
    
    cursor = await db.execute(
        "SELECT path FROM images WHERE id = ?",
        (image_id,)
    )
    image = await cursor.fetchone()
    
    if not image:
        raise HTTPException(status_code=404, detail="Image not found")
    
    file_path = Path(image["path"]).resolve(strict=False)
    
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="File not found on disk")
    
    try:
        system = platform.system()
        if system == "Windows":
            windows_path = os.path.normpath(str(file_path))
            subprocess.Popen(["explorer.exe", "/select,", windows_path])
        elif system == "Darwin":
            # macOS: Use open -R to reveal in Finder
            subprocess.Popen(['open', '-R', str(file_path)])
        else:
            # Linux: Try xdg-open on the parent folder
            subprocess.Popen(['xdg-open', str(file_path.parent)])
        
        return {"success": True, "path": str(file_path)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to open file explorer: {str(e)}")


# ── Open in external editor ──────────────────────────────────────


class OpenInEditorRequest(BaseModel):
    editor: str | None = None  # "default", preset name, custom path, or None (uses setting)


# Well-known editor executable names per platform
_EDITOR_PRESETS: dict[str, dict[str, list[str]]] = {
    "affinity": {
        "Windows": [
            r"C:\Program Files\Affinity\Photo 2\Photo.exe",
            r"C:\Program Files\Affinity\Photo\Photo.exe",
        ],
        "Darwin": ["/Applications/Affinity Photo 2.app/Contents/MacOS/Affinity Photo 2"],
    },
    "darktable": {
        "Windows": [r"C:\Program Files\darktable\bin\darktable.exe"],
        "Darwin": ["/Applications/darktable.app/Contents/MacOS/darktable"],
        "Linux": ["darktable"],
    },
    "rawtherapee": {
        "Windows": [r"C:\Program Files\RawTherapee\5.10\rawtherapee.exe",
                     r"C:\Program Files\RawTherapee\rawtherapee.exe"],
        "Darwin": ["/Applications/RawTherapee.app/Contents/MacOS/rawtherapee"],
        "Linux": ["rawtherapee"],
    },
    "gimp": {
        "Windows": [r"C:\Program Files\GIMP 2\bin\gimp-2.10.exe",
                     r"C:\Program Files\GIMP 2\bin\gimp.exe"],
        "Darwin": ["/Applications/GIMP-2.10.app/Contents/MacOS/gimp"],
        "Linux": ["gimp"],
    },
    "photoshop": {
        "Windows": [r"C:\Program Files\Adobe\Adobe Photoshop 2024\Photoshop.exe",
                     r"C:\Program Files\Adobe\Adobe Photoshop 2023\Photoshop.exe",
                     r"C:\Program Files\Adobe\Adobe Photoshop CC 2019\Photoshop.exe"],
        "Darwin": ["/Applications/Adobe Photoshop 2024/Adobe Photoshop 2024.app/Contents/MacOS/Adobe Photoshop 2024"],
    },
}


def _resolve_editor(name: str, system: str) -> str | None:
    """Resolve a preset editor name to an executable path that exists."""
    import shutil

    candidates = _EDITOR_PRESETS.get(name, {}).get(system, [])
    for path in candidates:
        if Path(path).exists():
            return path
    # Try as a command on PATH
    for path in candidates:
        exe_name = Path(path).name
        found = shutil.which(exe_name)
        if found:
            return found
    # Last resort: just try shutil.which with the preset name itself
    found = shutil.which(name)
    return found


@router.post("/images/{image_id}/open-editor")
async def open_in_editor(image_id: str, body: OpenInEditorRequest | None = None):
    """Open an image in an external photo editor."""
    import os
    import platform
    import subprocess

    db = await get_db()
    cursor = await db.execute("SELECT path FROM images WHERE id = ?", (image_id,))
    image = await cursor.fetchone()
    if not image:
        raise HTTPException(status_code=404, detail="Image not found")

    file_path = Path(image["path"]).resolve(strict=False)
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="File not found on disk")

    # Determine editor
    editor = (body.editor if body else None) or None
    if not editor or editor == "default":
        # Check user setting
        cur = await db.execute("SELECT value FROM settings WHERE key = 'editor_command'")
        row = await cur.fetchone()
        editor = row["value"] if row else "default"

    try:
        system = platform.system()
        if editor == "default":
            # Use OS default handler
            if system == "Windows":
                os.startfile(str(file_path))  # noqa: S606
            elif system == "Darwin":
                subprocess.Popen(["open", str(file_path)])
            else:
                subprocess.Popen(["xdg-open", str(file_path)])
        else:
            # Check if it's a preset name
            resolved = _resolve_editor(editor, system)
            exe = resolved or editor
            subprocess.Popen([exe, str(file_path)])

        return {"success": True, "path": str(file_path), "editor": editor}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to open editor: {e}")


# ── Rating / Label / Flag endpoints ──────────────────────────────


class RatingRequest(BaseModel):
    rating: int  # 0-5


class LabelRequest(BaseModel):
    label: str | None  # red, yellow, green, blue, purple, or null


class FlagRequest(BaseModel):
    flag: str  # pick, reject, unflagged


class BatchIdsRequest(BaseModel):
    image_ids: list[str]


class BatchRatingRequest(BatchIdsRequest):
    rating: int


class BatchLabelRequest(BatchIdsRequest):
    label: str | None


class BatchFlagRequest(BatchIdsRequest):
    flag: str


_VALID_LABELS = {"red", "yellow", "green", "blue", "purple", None}
_VALID_FLAGS = {"pick", "reject", "unflagged"}


@router.put("/images/{image_id}/rating")
async def set_rating(image_id: str, body: RatingRequest):
    if body.rating < 0 or body.rating > 5:
        raise HTTPException(status_code=422, detail="Rating must be 0-5")
    db = await get_db()
    cursor = await db.execute("SELECT id FROM images WHERE id = ?", (image_id,))
    if not await cursor.fetchone():
        raise HTTPException(status_code=404, detail="Image not found")
    await db.execute("UPDATE images SET star_rating = ? WHERE id = ?", (body.rating, image_id))
    await db.commit()
    return {"image_id": image_id, "star_rating": body.rating}


@router.put("/images/{image_id}/label")
async def set_label(image_id: str, body: LabelRequest):
    if body.label not in _VALID_LABELS:
        raise HTTPException(status_code=422, detail="Invalid color label")
    db = await get_db()
    cursor = await db.execute("SELECT id FROM images WHERE id = ?", (image_id,))
    if not await cursor.fetchone():
        raise HTTPException(status_code=404, detail="Image not found")
    await db.execute("UPDATE images SET color_label = ? WHERE id = ?", (body.label, image_id))
    await db.commit()
    return {"image_id": image_id, "color_label": body.label}


@router.put("/images/{image_id}/flag")
async def set_flag(image_id: str, body: FlagRequest):
    if body.flag not in _VALID_FLAGS:
        raise HTTPException(status_code=422, detail="Invalid flag value")
    db = await get_db()
    cursor = await db.execute("SELECT id FROM images WHERE id = ?", (image_id,))
    if not await cursor.fetchone():
        raise HTTPException(status_code=404, detail="Image not found")
    await db.execute("UPDATE images SET flag = ? WHERE id = ?", (body.flag, image_id))
    await db.commit()
    return {"image_id": image_id, "flag": body.flag}


@router.put("/images/batch/rating")
async def batch_set_rating(body: BatchRatingRequest):
    if body.rating < 0 or body.rating > 5:
        raise HTTPException(status_code=422, detail="Rating must be 0-5")
    db = await get_db()
    for image_id in body.image_ids:
        await db.execute("UPDATE images SET star_rating = ? WHERE id = ?", (body.rating, image_id))
    await db.commit()
    return {"updated": len(body.image_ids), "star_rating": body.rating}


@router.put("/images/batch/label")
async def batch_set_label(body: BatchLabelRequest):
    if body.label not in _VALID_LABELS:
        raise HTTPException(status_code=422, detail="Invalid color label")
    db = await get_db()
    for image_id in body.image_ids:
        await db.execute("UPDATE images SET color_label = ? WHERE id = ?", (body.label, image_id))
    await db.commit()
    return {"updated": len(body.image_ids), "color_label": body.label}


@router.put("/images/batch/flag")
async def batch_set_flag(body: BatchFlagRequest):
    if body.flag not in _VALID_FLAGS:
        raise HTTPException(status_code=422, detail="Invalid flag value")
    db = await get_db()
    for image_id in body.image_ids:
        await db.execute("UPDATE images SET flag = ? WHERE id = ?", (body.flag, image_id))
    await db.commit()
    return {"updated": len(body.image_ids), "flag": body.flag}
