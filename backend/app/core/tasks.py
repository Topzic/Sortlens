"""
Lightweight background-task tracker.

FastAPI's BackgroundTasks are fire-and-forget; this module adds a thin
layer so the frontend can poll task progress.
"""

import asyncio
import logging
import uuid
from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from typing import Any, Callable, Coroutine

logger = logging.getLogger(__name__)


class TaskStatus(str, Enum):
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"


@dataclass
class TaskInfo:
    id: str
    name: str
    status: TaskStatus = TaskStatus.PENDING
    progress: int = 0
    total: int = 0
    message: str = ""
    created_at: str = field(default_factory=lambda: datetime.utcnow().isoformat())
    started_at: str | None = None
    finished_at: str | None = None
    result: Any = None
    error: str | None = None


# In-memory registry – fine for a single-worker desktop app.
_tasks: dict[str, TaskInfo] = {}


def create_task(name: str) -> TaskInfo:
    """Register a new pending task and return it."""
    task = TaskInfo(id=uuid.uuid4().hex[:12], name=name)
    _tasks[task.id] = task
    logger.info("Task created: %s (%s)", task.id, name)
    return task


def get_task(task_id: str) -> TaskInfo | None:
    return _tasks.get(task_id)


def list_tasks(limit: int = 20) -> list[TaskInfo]:
    """Return most recently created tasks."""
    return sorted(_tasks.values(), key=lambda t: t.created_at, reverse=True)[:limit]


def clear_finished() -> int:
    """Remove completed / failed tasks from the registry. Returns count removed."""
    to_remove = [
        tid
        for tid, t in _tasks.items()
        if t.status in (TaskStatus.COMPLETED, TaskStatus.FAILED)
    ]
    for tid in to_remove:
        del _tasks[tid]
    return len(to_remove)


async def run_task(
    task: TaskInfo,
    coro_fn: Callable[..., Coroutine],
    *args: Any,
    **kwargs: Any,
) -> None:
    """Execute *coro_fn* while updating *task* status in-place."""
    task.status = TaskStatus.RUNNING
    task.started_at = datetime.utcnow().isoformat()
    try:
        task.result = await coro_fn(*args, task=task, **kwargs)
        task.status = TaskStatus.COMPLETED
        logger.info("Task %s completed", task.id)
    except asyncio.CancelledError:
        task.status = TaskStatus.FAILED
        task.error = "Cancelled"
        logger.warning("Task %s cancelled", task.id)
    except Exception as exc:  # noqa: BLE001
        task.status = TaskStatus.FAILED
        task.error = str(exc)
        logger.exception("Task %s failed: %s", task.id, exc)
    finally:
        task.finished_at = datetime.utcnow().isoformat()
