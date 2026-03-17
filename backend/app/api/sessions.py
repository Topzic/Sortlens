"""
Session management API endpoints.
"""

import hashlib
import json
import logging
from datetime import datetime

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.core.database import get_db

router = APIRouter()
logger = logging.getLogger(__name__)

# Whitelist of allowed sort modes to prevent SQL injection
_SORT_MODES = {
    "path": "i.path ASC",
    "date": "i.exif_date ASC, i.path ASC",
    "size": "i.size DESC",
    "filename": "i.filename ASC",
    "random": "RANDOM()",
}


class SessionStartRequest(BaseModel):
    folder_path: str
    sort_mode: str = "path"  # "path" or "date"


class SessionResponse(BaseModel):
    id: str
    folder_path: str
    sort_mode: str
    cursor_position: int
    total_images: int
    reviewed_count: int
    created_at: str


class DecisionRequest(BaseModel):
    image_id: str
    decision: str  # "keep", "reject", "skip", "favorite"


class NextImageResponse(BaseModel):
    id: str
    path: str
    filename: str
    folder: str
    size: int
    format: str
    width: int | None = None
    height: int | None = None
    camera_make: str | None = None
    camera_model: str | None = None
    iso: int | None = None
    shutter_speed: str | None = None
    aperture: str | None = None
    exif_date: str | None = None
    cursor_position: int
    total_images: int
    has_next: bool
    has_previous: bool


class SessionQueueResponse(BaseModel):
    images: list[NextImageResponse]


class DecisionResponse(BaseModel):
    success: bool
    image_id: str
    decision: str
    cursor_position: int
    remaining: int
    next_image: NextImageResponse | None = None


class UndoResponse(BaseModel):
    success: bool
    undone_image_id: str | None
    undone_decision: str | None
    cursor_position: int
    restored_image: NextImageResponse | None = None


def generate_session_id(folder_path: str, sort_mode: str) -> str:
    """Generate a stable session ID based on folder and settings."""
    key = f"{folder_path}:{sort_mode}"
    return hashlib.sha256(key.encode()).hexdigest()[:16]


def _build_next_image_response(image, position: int, total_images: int) -> NextImageResponse:
    return NextImageResponse(
        id=image["id"],
        path=image["path"],
        filename=image["filename"],
        folder=image["folder"],
        size=image["size"] or 0,
        format=image["format"] or "",
        width=image["width"],
        height=image["height"],
        camera_make=image["camera_make"],
        camera_model=image["camera_model"],
        iso=image["iso"],
        shutter_speed=image["shutter_speed"],
        aperture=image["aperture"],
        exif_date=image["exif_date"],
        cursor_position=position,
        total_images=total_images,
        has_next=position < total_images - 1,
        has_previous=position > 0,
    )


@router.post("/session/start", response_model=SessionResponse)
async def start_session(request: SessionStartRequest):
    """Start or resume a review session for a folder."""
    db = await get_db()
    
    session_id = generate_session_id(request.folder_path, request.sort_mode)
    
    # Check if session already exists
    cursor = await db.execute(
        "SELECT * FROM sessions WHERE id = ?",
        (session_id,)
    )
    existing = await cursor.fetchone()
    
    # Count images in this folder
    cursor = await db.execute(
        "SELECT COUNT(*) as count FROM images WHERE folder LIKE ?",
        (f"{request.folder_path}%",)
    )
    row = await cursor.fetchone()
    total_images = row["count"] if row else 0
    
    # Count already reviewed images in this session
    cursor = await db.execute(
        "SELECT COUNT(*) as count FROM decisions WHERE session_id = ?",
        (session_id,)
    )
    row = await cursor.fetchone()
    reviewed_count = row["count"] if row else 0
    
    if existing:
        # Resume existing session
        return SessionResponse(
            id=session_id,
            folder_path=request.folder_path,
            sort_mode=request.sort_mode,
            cursor_position=existing["cursor_position"],
            total_images=total_images,
            reviewed_count=reviewed_count,
            created_at=existing["created_at"]
        )
    
    # Create new session
    now = datetime.utcnow().isoformat()
    await db.execute(
        """
        INSERT INTO sessions (id, folder_path, sort_mode, cursor_position, total_images, created_at, updated_at)
        VALUES (?, ?, ?, 0, ?, ?, ?)
        """,
        (session_id, request.folder_path, request.sort_mode, total_images, now, now)
    )
    await db.commit()
    
    return SessionResponse(
        id=session_id,
        folder_path=request.folder_path,
        sort_mode=request.sort_mode,
        cursor_position=0,
        total_images=total_images,
        reviewed_count=0,
        created_at=now
    )


@router.get("/session/{session_id}", response_model=SessionResponse)
async def get_session(session_id: str):
    """Get session status."""
    db = await get_db()
    
    cursor = await db.execute(
        "SELECT * FROM sessions WHERE id = ?",
        (session_id,)
    )
    session = await cursor.fetchone()
    
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    
    # Count reviewed
    cursor = await db.execute(
        "SELECT COUNT(*) as count FROM decisions WHERE session_id = ?",
        (session_id,)
    )
    row = await cursor.fetchone()
    reviewed_count = row["count"] if row else 0
    
    return SessionResponse(
        id=session_id,
        folder_path=session["folder_path"],
        sort_mode=session["sort_mode"],
        cursor_position=session["cursor_position"],
        total_images=session["total_images"],
        reviewed_count=reviewed_count,
        created_at=session["created_at"]
    )


@router.get("/session/{session_id}/next", response_model=NextImageResponse)
async def get_next_image(session_id: str):
    """Get the next unreviewed image in the session."""
    db = await get_db()

    # Get session
    cursor = await db.execute(
        "SELECT * FROM sessions WHERE id = ?",
        (session_id,)
    )
    session = await cursor.fetchone()

    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    folder_path = session["folder_path"]
    sort_mode = session["sort_mode"]

    # Use whitelisted sort mode to prevent SQL injection
    order_by = _SORT_MODES.get(sort_mode, _SORT_MODES["path"])

    # Use LEFT JOIN instead of NOT IN for better performance
    cursor = await db.execute(
        f"""
        SELECT i.* FROM images i
        LEFT JOIN decisions d ON d.image_id = i.id AND d.session_id = ?
        WHERE i.folder LIKE ?
        AND i.filename NOT LIKE '._%'
        AND d.id IS NULL
        ORDER BY {order_by}
        LIMIT 1
        """,
        (session_id, f"{folder_path}%")
    )
    image = await cursor.fetchone()
    
    if not image:
        raise HTTPException(status_code=404, detail="No more images to review")
    
    # Get total and position
    cursor = await db.execute(
        "SELECT COUNT(*) as count FROM images WHERE folder LIKE ?",
        (f"{folder_path}%",)
    )
    row = await cursor.fetchone()
    total = row["count"] if row else 0
    
    cursor = await db.execute(
        "SELECT COUNT(*) as count FROM decisions WHERE session_id = ?",
        (session_id,)
    )
    row = await cursor.fetchone()
    reviewed = row["count"] if row else 0
    
    return _build_next_image_response(image, reviewed, total)


@router.get("/session/{session_id}/queue", response_model=SessionQueueResponse)
async def get_session_queue(
    session_id: str,
    limit: int = 4,
):
    """Get the current image plus upcoming unreviewed images for preview."""
    db = await get_db()

    cursor = await db.execute(
        "SELECT * FROM sessions WHERE id = ?",
        (session_id,)
    )
    session = await cursor.fetchone()

    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    safe_limit = max(1, min(limit, 10))
    order_by = _SORT_MODES.get(session["sort_mode"], _SORT_MODES["path"])

    cursor = await db.execute(
        "SELECT COUNT(*) as count FROM images WHERE folder LIKE ?",
        (f"{session['folder_path']}%",)
    )
    row = await cursor.fetchone()
    total_images = row["count"] if row else 0

    cursor = await db.execute(
        "SELECT COUNT(*) as count FROM decisions WHERE session_id = ?",
        (session_id,)
    )
    row = await cursor.fetchone()
    reviewed = row["count"] if row else 0

    cursor = await db.execute(
        f"""
        SELECT i.* FROM images i
        LEFT JOIN decisions d ON d.image_id = i.id AND d.session_id = ?
        WHERE i.folder LIKE ?
        AND i.filename NOT LIKE '._%'
        AND d.id IS NULL
        ORDER BY {order_by}
        LIMIT ?
        """,
        (session_id, f"{session['folder_path']}%", safe_limit)
    )
    rows = await cursor.fetchall()

    return SessionQueueResponse(
        images=[
            _build_next_image_response(image, reviewed + index, total_images)
            for index, image in enumerate(rows)
        ]
    )


@router.post("/session/{session_id}/decision", response_model=DecisionResponse)
async def record_decision(session_id: str, request: DecisionRequest):
    """Record a keep/reject/skip/favorite decision for an image."""
    db = await get_db()

    # Validate decision type
    valid_decisions = {"keep", "reject", "skip", "favorite"}
    if request.decision not in valid_decisions:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid decision '{request.decision}'. Must be one of: {', '.join(valid_decisions)}",
        )

    # Verify session exists
    cursor = await db.execute(
        "SELECT * FROM sessions WHERE id = ?",
        (session_id,)
    )
    session = await cursor.fetchone()

    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    # Verify image exists
    cursor = await db.execute(
        "SELECT * FROM images WHERE id = ?",
        (request.image_id,)
    )
    image = await cursor.fetchone()

    if not image:
        raise HTTPException(status_code=404, detail="Image not found")

    # Check if decision already exists (prevent duplicates)
    cursor = await db.execute(
        "SELECT * FROM decisions WHERE session_id = ? AND image_id = ?",
        (session_id, request.image_id)
    )
    existing = await cursor.fetchone()

    if existing:
        # Update existing decision
        await db.execute(
            "UPDATE decisions SET decision = ?, decided_at = CURRENT_TIMESTAMP WHERE session_id = ? AND image_id = ?",
            (request.decision, session_id, request.image_id)
        )
    else:
        # Insert new decision
        await db.execute(
            "INSERT INTO decisions (session_id, image_id, decision) VALUES (?, ?, ?)",
            (session_id, request.image_id, request.decision)
        )

    # Update session cursor
    cursor = await db.execute(
        "SELECT COUNT(*) as count FROM decisions WHERE session_id = ?",
        (session_id,)
    )
    row = await cursor.fetchone()
    new_position = row["count"] if row else 0

    # Get total images for this folder
    cursor = await db.execute(
        "SELECT COUNT(*) as count FROM images WHERE folder LIKE ?",
        (f"{session['folder_path']}%",)
    )
    row = await cursor.fetchone()
    total_images = row["count"] if row else 0

    await db.execute(
        "UPDATE sessions SET cursor_position = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
        (new_position, session_id)
    )

    await db.commit()

    remaining = max(0, total_images - new_position)

    # Fetch next image inline to avoid extra round-trip
    next_image_data = None
    try:
        sort_mode = session["sort_mode"]
        order_by = _SORT_MODES.get(sort_mode, _SORT_MODES["path"])

        cursor = await db.execute(
            f"""
            SELECT i.* FROM images i
            LEFT JOIN decisions d ON d.image_id = i.id AND d.session_id = ?
            WHERE i.folder LIKE ?
            AND i.filename NOT LIKE '._%'
            AND d.id IS NULL
            ORDER BY {order_by}
            LIMIT 1
            """,
            (session_id, f"{session['folder_path']}%")
        )
        next_img = await cursor.fetchone()

        if next_img:
            next_image_data = _build_next_image_response(next_img, new_position, total_images)
    except Exception:
        logger.warning("Failed to prefetch next image for session %s", session_id)

    return DecisionResponse(
        success=True,
        image_id=request.image_id,
        decision=request.decision,
        cursor_position=new_position,
        remaining=remaining,
        next_image=next_image_data,
    )


@router.post("/session/{session_id}/undo", response_model=UndoResponse)
async def undo_decision(session_id: str):
    """Undo the last decision in the session."""
    db = await get_db()

    cursor = await db.execute(
        "SELECT * FROM sessions WHERE id = ?",
        (session_id,)
    )
    session = await cursor.fetchone()

    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    # Get the last decision
    cursor = await db.execute(
        """
        SELECT * FROM decisions
        WHERE session_id = ?
        ORDER BY id DESC
        LIMIT 1
        """,
        (session_id,)
    )
    last_decision = await cursor.fetchone()

    if not last_decision:
        return UndoResponse(
            success=False,
            undone_image_id=None,
            undone_decision=None,
            cursor_position=0,
        )

    # Delete the decision
    await db.execute(
        "DELETE FROM decisions WHERE id = ?",
        (last_decision["id"],)
    )

    # Update session cursor
    cursor = await db.execute(
        "SELECT COUNT(*) as count FROM decisions WHERE session_id = ?",
        (session_id,)
    )
    row = await cursor.fetchone()
    new_position = row["count"] if row else 0

    await db.execute(
        "UPDATE sessions SET cursor_position = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
        (new_position, session_id)
    )

    cursor = await db.execute(
        "SELECT COUNT(*) as count FROM images WHERE folder LIKE ?",
        (f"{session['folder_path']}%",)
    )
    row = await cursor.fetchone()
    total_images = row["count"] if row else 0

    cursor = await db.execute(
        "SELECT * FROM images WHERE id = ?",
        (last_decision["image_id"],)
    )
    image = await cursor.fetchone()

    await db.commit()
    logger.info("Undid decision %s for session %s", last_decision["decision"], session_id)

    return UndoResponse(
        success=True,
        undone_image_id=last_decision["image_id"],
        undone_decision=last_decision["decision"],
        cursor_position=new_position,
        restored_image=(
            _build_next_image_response(image, new_position, total_images)
            if image
            else None
        ),
    )


@router.post("/session/{session_id}/reset")
async def reset_session(session_id: str):
    """Reset a session - clear all decisions and start over."""
    db = await get_db()
    
    # Delete all decisions for this session
    await db.execute(
        "DELETE FROM decisions WHERE session_id = ?",
        (session_id,)
    )
    
    # Reset cursor
    await db.execute(
        "UPDATE sessions SET cursor_position = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
        (session_id,)
    )
    
    await db.commit()
    
    return {"success": True, "message": "Session reset"}
