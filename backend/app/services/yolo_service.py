"""YOLOv8 object detection support for AI tag suggestions."""

from __future__ import annotations

import importlib.util
import logging
import threading
from typing import List, Tuple

logger = logging.getLogger(__name__)

_MODEL_NAME = "yolov8n.pt"
_CONFIDENCE_THRESHOLD = 0.5

_model = None
_model_lock = threading.Lock()
_load_thread: threading.Thread | None = None
_missing_dependency_logged = False


def dependency_available() -> bool:
    """True when the optional ultralytics dependency is installed."""
    return importlib.util.find_spec("ultralytics") is not None


def _log_missing_dependency() -> None:
    global _missing_dependency_logged
    if _missing_dependency_logged:
        return
    _missing_dependency_logged = True
    logger.warning(
        "YOLO disabled: optional dependency 'ultralytics' is not installed in the backend environment"
    )


def model_loaded() -> bool:
    """True when the YOLO model is already loaded in memory."""
    return _model is not None


def model_loading() -> bool:
    """True when a background load is currently in progress."""
    return _load_thread is not None and _load_thread.is_alive()


def get_model():
    """Load and cache the YOLO model on first use."""
    global _model
    if _model is not None:
        return _model

    with _model_lock:
        if _model is not None:
            return _model

        if not dependency_available():
            _log_missing_dependency()
            return None

        try:
            from ultralytics import YOLO

            _model = YOLO(_MODEL_NAME)
            logger.info("YOLO model loaded")
            return _model
        except Exception:
            logger.exception("Failed to load YOLO model")
            return None


def ensure_model_loading() -> None:
    """Kick off a background model load if one is not already running."""
    global _load_thread

    if not dependency_available():
        _log_missing_dependency()
        return

    with _model_lock:
        if _model is not None:
            return
        if _load_thread is not None and _load_thread.is_alive():
            return

        def _load_in_background() -> None:
            get_model()

        _load_thread = threading.Thread(
            target=_load_in_background,
            name="sortlens-yolo-load",
            daemon=True,
        )
        _load_thread.start()
        logger.info("YOLO model load started in background")


def detect_objects(image_path: str) -> List[Tuple[str, float]]:
    """Return deduplicated lowercase labels with their best confidence."""
    try:
        model = get_model()
        if model is None:
            return []
        results = model.predict(
            source=image_path,
            conf=_CONFIDENCE_THRESHOLD,
            device="cpu",
            verbose=False,
        )

        labels: dict[str, float] = {}
        for result in results:
            names = result.names
            for box in result.boxes:
                confidence = float(box.conf.item())
                if confidence < _CONFIDENCE_THRESHOLD:
                    continue

                class_id = int(box.cls.item())
                raw_label = names.get(class_id, str(class_id))
                label = str(raw_label).strip().lower()
                if not label:
                    continue

                labels[label] = max(labels.get(label, 0.0), confidence)

        logger.info("YOLO inference complete for %s", image_path)
        return sorted(labels.items(), key=lambda item: (-item[1], item[0]))
    except Exception:
        logger.exception("YOLO inference failed for %s", image_path)
        return []