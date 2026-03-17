"""
Actions (preview + execute) API endpoints.
"""

import asyncio
import logging
from datetime import datetime
from pathlib import Path
from typing import Literal

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from send2trash import send2trash as _send2trash

from app.core.config import settings
from app.core.database import get_db

logger = logging.getLogger(__name__)

router = APIRouter()


class ActionsPreviewRequest(BaseModel):
    decision: Literal["reject", "keep", "skip"] = "reject"
    folder_path: str | None = None


class ActionItem(BaseModel):
    source_path: str
    destination_path: str | None
    size: int


class ActionsPreviewResponse(BaseModel):
    total_files: int
    total_size: int
    items: list[ActionItem]


class ActionsExecuteRequest(BaseModel):
    decision: Literal["reject", "keep", "skip"] = "reject"
    folder_path: str | None = None


class ActionsExecuteResponse(BaseModel):
    success: bool
    processed: int
    failed: int


class ActionDeleteRequest(BaseModel):
    image_id: str


class ActionDeleteResponse(BaseModel):
    success: bool
    processed: int
    failed: int


def get_sidecar_paths(image_path: Path) -> list[Path]:
    base = image_path.with_suffix("")
    candidates = [
        image_path.with_suffix(image_path.suffix + ".xmp"),
        image_path.with_suffix(image_path.suffix + ".json"),
        base.with_suffix(".xmp"),
        base.with_suffix(".json"),
    ]
    return [p for p in candidates if p.exists()]


def get_rejected_folder(folder_path: str) -> Path:
    return Path(folder_path) / "Rejected"


def build_action_items(path: str, size: int, folder_path: str) -> list[ActionItem]:
    items: list[ActionItem] = []
    source = Path(path)

    if settings.DELETION_MODE == "rejected_folder":
        dest_folder = get_rejected_folder(folder_path)
        dest_folder.mkdir(parents=True, exist_ok=True)
        dest = dest_folder / source.name
        items.append(ActionItem(source_path=str(source), destination_path=str(dest), size=size))
    else:
        items.append(ActionItem(source_path=str(source), destination_path=None, size=size))

    if settings.INCLUDE_SIDECARS:
        for sidecar in get_sidecar_paths(source):
            sidecar_size = sidecar.stat().st_size if sidecar.exists() else 0
            if settings.DELETION_MODE == "rejected_folder":
                dest_folder = get_rejected_folder(folder_path)
                dest = dest_folder / sidecar.name
                items.append(
                    ActionItem(
                        source_path=str(sidecar),
                        destination_path=str(dest),
                        size=sidecar_size,
                    )
                )
            else:
                items.append(
                    ActionItem(
                        source_path=str(sidecar),
                        destination_path=None,
                        size=sidecar_size,
                    )
                )

    return items


async def execute_action_items(db, items: list[ActionItem]) -> tuple[int, int]:
    processed = 0
    failed = 0

    for item in items:
        src = Path(item.source_path)
        if not src.exists():
            failed += 1
            await db.execute(
                """
                INSERT INTO audit_log (action, source_path, destination_path, file_size, success, error_message)
                VALUES (?, ?, ?, ?, ?, ?)
                """,
                ("missing", item.source_path, item.destination_path, item.size, 0, "File not found"),
            )
            continue

        try:
            if settings.DELETION_MODE == "trash":
                await asyncio.to_thread(_send2trash, str(src))
                action = "move_to_trash"
                dest_path = None
            elif settings.DELETION_MODE == "rejected_folder":
                dest = Path(item.destination_path) if item.destination_path else None
                if dest is None:
                    raise RuntimeError("Missing destination for rejected folder mode")
                dest.parent.mkdir(parents=True, exist_ok=True)
                await asyncio.to_thread(src.replace, dest)
                action = "move_to_folder"
                dest_path = str(dest)
            else:
                await asyncio.to_thread(src.unlink, True)
                action = "delete"
                dest_path = None

            processed += 1
            await db.execute(
                """
                INSERT INTO audit_log (action, source_path, destination_path, file_size, success)
                VALUES (?, ?, ?, ?, ?)
                """,
                (action, item.source_path, dest_path, item.size, 1),
            )
        except Exception as exc:
            failed += 1
            await db.execute(
                """
                INSERT INTO audit_log (action, source_path, destination_path, file_size, success, error_message)
                VALUES (?, ?, ?, ?, ?, ?)
                """,
                ("error", item.source_path, item.destination_path, item.size, 0, str(exc)),
            )

    return processed, failed


@router.post("/actions/preview", response_model=ActionsPreviewResponse)
async def preview_actions(request: ActionsPreviewRequest):
    db = await get_db()

    folder_filter = ""
    params: list[str] = [request.decision]
    if request.folder_path:
        folder_filter = "AND i.folder LIKE ?"
        params.append(f"{request.folder_path}%")

    cursor = await db.execute(
        f"""
        SELECT i.path, i.size, i.folder
        FROM decisions d
        JOIN images i ON i.id = d.image_id
        WHERE d.decision = ?
        AND d.applied_at IS NULL
        {folder_filter}
        ORDER BY d.decided_at ASC
        """,
        tuple(params),
    )
    rows = await cursor.fetchall()

    items: list[ActionItem] = []
    for row in rows:
        items.extend(build_action_items(row["path"], row["size"] or 0, row["folder"]))

    total_size = sum(item.size for item in items)

    return ActionsPreviewResponse(
        total_files=len(items),
        total_size=total_size,
        items=items[:50],
    )


@router.post("/actions/execute", response_model=ActionsExecuteResponse)
async def execute_actions(request: ActionsExecuteRequest):
    db = await get_db()

    folder_filter = ""
    params: list[str] = [request.decision]
    if request.folder_path:
        folder_filter = "AND i.folder LIKE ?"
        params.append(f"{request.folder_path}%")

    cursor = await db.execute(
        f"""
        SELECT d.id as decision_id, i.path, i.size, i.folder
        FROM decisions d
        JOIN images i ON i.id = d.image_id
        WHERE d.decision = ?
        AND d.applied_at IS NULL
        {folder_filter}
        ORDER BY d.decided_at ASC
        """,
        tuple(params),
    )
    rows = await cursor.fetchall()

    processed = 0
    failed = 0
    now = datetime.utcnow().isoformat()

    for row in rows:
        image_path = Path(row["path"])
        items = build_action_items(row["path"], row["size"] or 0, row["folder"])

        item_processed, item_failed = await execute_action_items(db, items)
        processed += item_processed
        failed += item_failed

        if item_failed == 0:
            # Clean up all DB records for the deleted image
            cursor2 = await db.execute(
                "SELECT i.id FROM images i WHERE i.path = ?", (row["path"],)
            )
            img_row = await cursor2.fetchone()
            if img_row:
                img_id = img_row["id"]
                await db.execute("DELETE FROM decisions WHERE image_id = ?", (img_id,))
                await db.execute("DELETE FROM duplicate_group_members WHERE image_id = ?", (img_id,))
                await db.execute("DELETE FROM quality_scores WHERE image_id = ?", (img_id,))
                await db.execute("DELETE FROM collection_members WHERE image_id = ?", (img_id,))
                await db.execute("DELETE FROM images WHERE id = ?", (img_id,))
        else:
            await db.execute(
                "UPDATE decisions SET applied_at = ? WHERE id = ?",
                (now, row["decision_id"]),
            )

    # Update folder image counts to stay in sync
    await db.execute("""
        UPDATE folders SET image_count = (
            SELECT COUNT(*) FROM images WHERE images.folder = folders.path
        )
    """)

    await db.commit()

    return ActionsExecuteResponse(success=failed == 0, processed=processed, failed=failed)


@router.post("/actions/delete", response_model=ActionDeleteResponse)
async def delete_single(request: ActionDeleteRequest):
    db = await get_db()

    cursor = await db.execute("SELECT * FROM images WHERE id = ?", (request.image_id,))
    image = await cursor.fetchone()
    if not image:
        raise HTTPException(status_code=404, detail="Image not found")

    items = build_action_items(image["path"], image["size"] or 0, image["folder"])
    processed, failed = await execute_action_items(db, items)

    if failed == 0:
        await db.execute("DELETE FROM decisions WHERE image_id = ?", (request.image_id,))
        await db.execute("DELETE FROM duplicate_group_members WHERE image_id = ?", (request.image_id,))
        await db.execute("DELETE FROM quality_scores WHERE image_id = ?", (request.image_id,))
        await db.execute("DELETE FROM collection_members WHERE image_id = ?", (request.image_id,))
        await db.execute("DELETE FROM images WHERE id = ?", (request.image_id,))
        logger.info("Deleted image %s and related records", request.image_id)

    await db.commit()

    return ActionDeleteResponse(success=failed == 0, processed=processed, failed=failed)


# --- Stats endpoint ---

class StatsResponse(BaseModel):
    total_images: int
    total_size: int
    total_reviewed: int
    total_kept: int
    total_rejected: int
    total_skipped: int
    total_favorited: int
    space_freed: int  # bytes freed from applied rejections (audit_log)
    rated_count: int
    flagged_pick_count: int
    flagged_reject_count: int
    collections_count: int
    folders_count: int


@router.get("/stats", response_model=StatsResponse)
async def get_stats():
    """Get aggregated cull/review statistics."""
    db = await get_db()

    cursor = await db.execute("SELECT COUNT(*) as c, COALESCE(SUM(size), 0) as s FROM images")
    row = await cursor.fetchone()
    total_images = row["c"]
    total_size = row["s"]

    cursor = await db.execute("SELECT COUNT(*) as c FROM decisions")
    decisions_count = (await cursor.fetchone())["c"]

    cursor = await db.execute("SELECT COUNT(*) as c FROM decisions WHERE decision = 'keep'")
    total_kept = (await cursor.fetchone())["c"]

    cursor = await db.execute("SELECT COUNT(*) as c FROM decisions WHERE decision = 'reject'")
    pending_rejected = (await cursor.fetchone())["c"]

    cursor = await db.execute("SELECT COUNT(*) as c FROM decisions WHERE decision = 'skip'")
    total_skipped = (await cursor.fetchone())["c"]

    cursor = await db.execute("SELECT COUNT(*) as c FROM decisions WHERE decision = 'favorite'")
    total_favorited = (await cursor.fetchone())["c"]

    # Count applied rejections from audit_log (decisions are deleted after apply)
    cursor = await db.execute(
        "SELECT COUNT(*) as c, COALESCE(SUM(file_size), 0) as s FROM audit_log WHERE success = 1"
    )
    audit_row = await cursor.fetchone()
    applied_rejected = audit_row["c"]
    space_freed = audit_row["s"]

    total_rejected = pending_rejected + applied_rejected
    total_reviewed = decisions_count + applied_rejected

    cursor = await db.execute("SELECT COUNT(*) as c FROM images WHERE star_rating > 0")
    rated_count = (await cursor.fetchone())["c"]

    cursor = await db.execute("SELECT COUNT(*) as c FROM images WHERE flag = 'pick'")
    flagged_pick_count = (await cursor.fetchone())["c"]

    cursor = await db.execute("SELECT COUNT(*) as c FROM images WHERE flag = 'reject'")
    flagged_reject_count = (await cursor.fetchone())["c"]

    cursor = await db.execute("SELECT COUNT(*) as c FROM collections")
    collections_count = (await cursor.fetchone())["c"]

    cursor = await db.execute("SELECT COUNT(*) as c FROM folders")
    folders_count = (await cursor.fetchone())["c"]

    return StatsResponse(
        total_images=total_images,
        total_size=total_size,
        total_reviewed=total_reviewed,
        total_kept=total_kept,
        total_rejected=total_rejected,
        total_skipped=total_skipped,
        total_favorited=total_favorited,
        space_freed=space_freed,
        rated_count=rated_count,
        flagged_pick_count=flagged_pick_count,
        flagged_reject_count=flagged_reject_count,
        collections_count=collections_count,
        folders_count=folders_count,
    )


# --- Copy/export endpoint ---

class CopyExportRequest(BaseModel):
    image_ids: list[str]
    destination: str


class CopyExportResponse(BaseModel):
    success: bool
    copied: int
    failed: int


@router.post("/actions/copy", response_model=CopyExportResponse)
async def copy_images(request: CopyExportRequest):
    """Copy selected images to a destination folder."""
    dest = Path(request.destination)
    if not dest.is_dir():
        try:
            dest.mkdir(parents=True, exist_ok=True)
        except Exception as exc:
            raise HTTPException(status_code=400, detail=f"Cannot create destination: {exc}")

    db = await get_db()
    copied = 0
    failed = 0

    for image_id in request.image_ids:
        cursor = await db.execute("SELECT path FROM images WHERE id = ?", (image_id,))
        row = await cursor.fetchone()
        if not row:
            failed += 1
            continue
        src = Path(row["path"])
        if not src.exists():
            failed += 1
            continue
        try:
            import shutil
            target = dest / src.name
            # Avoid overwriting by appending a suffix
            counter = 1
            while target.exists():
                target = dest / f"{src.stem}_{counter}{src.suffix}"
                counter += 1
            await asyncio.to_thread(shutil.copy2, str(src), str(target))
            copied += 1
        except Exception:
            failed += 1

    return CopyExportResponse(success=failed == 0, copied=copied, failed=failed)


# --- Move kept/favorite images to a destination folder ---


class MoveKeptRequest(BaseModel):
    folder_path: str | None = None
    destination: str


class MoveKeptResponse(BaseModel):
    success: bool
    moved: int
    failed: int
    total_size: int


@router.post("/actions/move-kept", response_model=MoveKeptResponse)
async def move_kept_images(request: MoveKeptRequest):
    """Move all kept/favorite images to a destination folder (cut)."""
    import shutil

    dest = Path(request.destination)
    if not dest.is_dir():
        try:
            dest.mkdir(parents=True, exist_ok=True)
        except Exception as exc:
            raise HTTPException(status_code=400, detail=f"Cannot create destination: {exc}")

    db = await get_db()

    folder_filter = ""
    params: list[str] = []
    if request.folder_path:
        folder_filter = "AND i.folder LIKE ?"
        params.append(f"{request.folder_path}%")

    cursor = await db.execute(
        f"""
        SELECT d.id as decision_id, d.image_id, i.path, i.size, i.folder, i.filename
        FROM decisions d
        JOIN images i ON i.id = d.image_id
        WHERE d.decision IN ('keep', 'favorite')
        AND d.applied_at IS NULL
        {folder_filter}
        ORDER BY d.decided_at ASC
        """,
        tuple(params),
    )
    rows = await cursor.fetchall()

    moved = 0
    failed = 0
    total_size = 0
    now = datetime.utcnow().isoformat()

    for row in rows:
        src = Path(row["path"])
        if not src.exists():
            failed += 1
            continue

        try:
            target = dest / src.name
            counter = 1
            while target.exists():
                target = dest / f"{src.stem}_{counter}{src.suffix}"
                counter += 1

            await asyncio.to_thread(shutil.move, str(src), str(target))

            file_size = row["size"] or 0
            total_size += file_size
            moved += 1

            # Mark decision as applied
            await db.execute(
                "UPDATE decisions SET applied_at = ? WHERE id = ?",
                (now, row["decision_id"]),
            )

            # Update image path in database
            await db.execute(
                "UPDATE images SET path = ?, folder = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
                (str(target), str(dest), row["image_id"]),
            )

            await db.execute(
                """
                INSERT INTO audit_log (action, source_path, destination_path, file_size, success)
                VALUES (?, ?, ?, ?, ?)
                """,
                ("move_kept", str(src), str(target), file_size, 1),
            )

            # Also move sidecar files
            for sidecar in get_sidecar_paths(src):
                try:
                    sc_target = dest / sidecar.name
                    await asyncio.to_thread(shutil.move, str(sidecar), str(sc_target))
                except Exception:
                    pass

        except Exception as exc:
            failed += 1
            await db.execute(
                """
                INSERT INTO audit_log (action, source_path, destination_path, file_size, success, error_message)
                VALUES (?, ?, ?, ?, ?, ?)
                """,
                ("move_kept_error", str(src), str(dest), row["size"] or 0, 0, str(exc)),
            )

    await db.commit()

    return MoveKeptResponse(success=failed == 0, moved=moved, failed=failed, total_size=total_size)
