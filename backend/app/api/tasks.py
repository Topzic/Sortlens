"""Task polling endpoints."""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.core.tasks import TaskInfo, get_task, list_tasks, clear_finished

router = APIRouter()


class TaskResponse(BaseModel):
    id: str
    name: str
    status: str
    progress: int
    total: int
    message: str
    created_at: str
    started_at: str | None = None
    finished_at: str | None = None
    error: str | None = None


def _to_response(t: TaskInfo) -> TaskResponse:
    return TaskResponse(
        id=t.id,
        name=t.name,
        status=t.status.value,
        progress=t.progress,
        total=t.total,
        message=t.message,
        created_at=t.created_at,
        started_at=t.started_at,
        finished_at=t.finished_at,
        error=t.error,
    )


@router.get("/tasks", response_model=list[TaskResponse])
async def get_tasks():
    return [_to_response(t) for t in list_tasks()]


@router.get("/tasks/{task_id}", response_model=TaskResponse)
async def get_task_status(task_id: str):
    t = get_task(task_id)
    if not t:
        raise HTTPException(status_code=404, detail="Task not found")
    return _to_response(t)


@router.post("/tasks/clear")
async def clear_tasks():
    removed = clear_finished()
    return {"removed": removed}
