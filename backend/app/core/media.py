"""Shared media helpers for image and video files."""

from __future__ import annotations

import logging
import re
import shutil
import subprocess
from functools import lru_cache
from pathlib import Path
from typing import Any

from app.core.config import settings
from app.core.image_metadata import RAW_EXTENSIONS, extract_image_metadata

logger = logging.getLogger(__name__)

VIDEO_EXTENSIONS = frozenset(settings.SUPPORTED_VIDEO_FORMATS)

IMAGE_MIME_TYPES: dict[str, str] = {
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
    "cr3": "image/x-canon-cr3",
    "arw": "image/x-sony-arw",
    "raf": "image/x-fuji-raf",
    "orf": "image/x-olympus-orf",
    "rw2": "image/x-panasonic-rw2",
    "dng": "image/x-adobe-dng",
    "raw": "application/octet-stream",
}

VIDEO_MIME_TYPES: dict[str, str] = {
    "mp4": "video/mp4",
    "mov": "video/quicktime",
    "m4v": "video/x-m4v",
    "avi": "video/x-msvideo",
    "mkv": "video/x-matroska",
    "webm": "video/webm",
    "wmv": "video/x-ms-wmv",
    "mts": "video/mp2t",
    "m2ts": "video/mp2t",
    "3gp": "video/3gpp",
}

_DURATION_RE = re.compile(r"Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)")
_BITRATE_RE = re.compile(r"bitrate:\s*(\d+)\s*kb/s")
_RESOLUTION_RE = re.compile(r"(\d{2,5})x(\d{2,5})")
_FPS_RE = re.compile(r"(\d+(?:\.\d+)?)\s*fps")
_TBR_RE = re.compile(r"(\d+(?:\.\d+)?)\s*tbr")
_METADATA_RE = re.compile(r"^\s*([A-Za-z0-9_.\-]+)\s*:\s*(.+?)\s*$")
_ISO6709_RE = re.compile(r"([+-]\d+(?:\.\d+)?)([+-]\d+(?:\.\d+)?)(?:[+-]\d+(?:\.\d+)?)?/?")


def normalize_extension(file_or_ext: Path | str | None) -> str:
    if file_or_ext is None:
        return ""
    if isinstance(file_or_ext, Path):
        return file_or_ext.suffix.lower()
    value = str(file_or_ext).strip().lower()
    if not value:
        return ""
    return value if value.startswith(".") else f".{value}"


def is_video_path(file_or_ext: Path | str | None) -> bool:
    return normalize_extension(file_or_ext) in VIDEO_EXTENSIONS


def is_raw_path(file_or_ext: Path | str | None) -> bool:
    return normalize_extension(file_or_ext) in RAW_EXTENSIONS


def guess_media_type(file_or_ext: Path | str | None, stored_media_type: str | None = None) -> str:
    if stored_media_type in {"image", "video"}:
        return stored_media_type
    return "video" if is_video_path(file_or_ext) else "image"


def get_media_mime_type(format_name: str | None, media_type: str | None = None) -> str:
    fmt = (format_name or "").lower().lstrip(".")
    kind = guess_media_type(fmt, media_type)
    if kind == "video":
        return VIDEO_MIME_TYPES.get(fmt, "video/mp4")
    return IMAGE_MIME_TYPES.get(fmt, "application/octet-stream")


@lru_cache(maxsize=1)
def get_ffmpeg_executable() -> str | None:
    try:
        import imageio_ffmpeg

        return imageio_ffmpeg.get_ffmpeg_exe()
    except Exception:
        ffmpeg = shutil.which("ffmpeg")
        if ffmpeg:
            return ffmpeg
        logger.warning("FFmpeg is unavailable; video previews and metadata extraction are limited")
        return None


def _parse_duration_seconds(value: str) -> float | None:
    match = _DURATION_RE.search(value)
    if not match:
        return None
    hours = int(match.group(1))
    minutes = int(match.group(2))
    seconds = float(match.group(3))
    return round(hours * 3600 + minutes * 60 + seconds, 3)


def _normalize_timestamp(value: str) -> str | None:
    cleaned = value.strip()
    if not cleaned:
        return None
    if "T" in cleaned:
        cleaned = cleaned.replace("T", " ")
    if cleaned.endswith("Z"):
        cleaned = cleaned[:-1]
    if "." in cleaned:
        cleaned = cleaned.split(".", 1)[0]
    return cleaned


def _parse_iso6709_coordinates(value: str) -> tuple[float | None, float | None]:
    match = _ISO6709_RE.search(value.strip())
    if not match:
        return None, None
    try:
        return round(float(match.group(1)), 8), round(float(match.group(2)), 8)
    except ValueError:
        return None, None


def _parse_ffmpeg_probe_output(output: str) -> dict[str, Any]:
    metadata: dict[str, Any] = {
        "width": None,
        "height": None,
        "exif_date": None,
        "camera_make": None,
        "camera_model": None,
        "iso": None,
        "shutter_speed": None,
        "aperture": None,
        "exposure_program": None,
        "focal_length": None,
        "latitude": None,
        "longitude": None,
        "duration": None,
        "fps": None,
        "video_codec": None,
        "audio_codec": None,
        "bitrate": None,
        "has_audio": False,
    }

    for raw_line in output.splitlines():
        line = raw_line.strip()
        if not line:
            continue

        if metadata["duration"] is None and "Duration:" in line:
            metadata["duration"] = _parse_duration_seconds(line)

        if metadata["bitrate"] is None:
            bitrate_match = _BITRATE_RE.search(line)
            if bitrate_match:
                metadata["bitrate"] = int(bitrate_match.group(1)) * 1000

        if " Video:" in raw_line and metadata["video_codec"] is None:
            video_details = raw_line.split("Video:", 1)[1].strip()
            codec = video_details.split(",", 1)[0].strip()
            metadata["video_codec"] = codec.split("(", 1)[0].strip()

            resolution_match = _RESOLUTION_RE.search(video_details)
            if resolution_match:
                metadata["width"] = int(resolution_match.group(1))
                metadata["height"] = int(resolution_match.group(2))

            fps_match = _FPS_RE.search(video_details) or _TBR_RE.search(video_details)
            if fps_match:
                metadata["fps"] = float(fps_match.group(1))

        if " Audio:" in raw_line and metadata["audio_codec"] is None:
            audio_details = raw_line.split("Audio:", 1)[1].strip()
            codec = audio_details.split(",", 1)[0].strip()
            metadata["audio_codec"] = codec.split("(", 1)[0].strip()
            metadata["has_audio"] = True

        meta_match = _METADATA_RE.match(raw_line)
        if not meta_match:
            continue

        key = meta_match.group(1).lower()
        value = meta_match.group(2).strip()

        if metadata["exif_date"] is None and key in {"creation_time", "date"}:
            metadata["exif_date"] = _normalize_timestamp(value)
        elif metadata["camera_make"] is None and key in {"make", "com.apple.quicktime.make"}:
            metadata["camera_make"] = value
        elif metadata["camera_model"] is None and key in {"model", "com.apple.quicktime.model"}:
            metadata["camera_model"] = value
        elif key in {"location", "location-eng", "com.apple.quicktime.location.iso6709"}:
            lat, lng = _parse_iso6709_coordinates(value)
            if lat is not None and lng is not None:
                metadata["latitude"] = lat
                metadata["longitude"] = lng

    return metadata


def extract_video_metadata(file_path: Path) -> dict[str, Any]:
    metadata: dict[str, Any] = {
        "width": None,
        "height": None,
        "exif_date": None,
        "camera_make": None,
        "camera_model": None,
        "iso": None,
        "shutter_speed": None,
        "aperture": None,
        "exposure_program": None,
        "focal_length": None,
        "latitude": None,
        "longitude": None,
        "duration": None,
        "fps": None,
        "video_codec": None,
        "audio_codec": None,
        "bitrate": None,
        "has_audio": False,
        "media_type": "video",
    }

    ffmpeg = get_ffmpeg_executable()
    if ffmpeg is None:
        return metadata

    try:
        proc = subprocess.run(
            [ffmpeg, "-hide_banner", "-i", str(file_path)],
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="ignore",
            check=False,
        )
    except Exception as exc:
        logger.warning("Failed to probe video metadata for %s: %s", file_path, exc)
        return metadata

    output = proc.stderr or proc.stdout or ""
    if not output:
        return metadata

    metadata.update(_parse_ffmpeg_probe_output(output))
    return metadata


def extract_media_metadata(file_path: Path) -> dict[str, Any]:
    if is_video_path(file_path):
        return extract_video_metadata(file_path)

    metadata = extract_image_metadata(file_path)
    metadata.update(
        {
            "duration": None,
            "fps": None,
            "video_codec": None,
            "audio_codec": None,
            "bitrate": None,
            "has_audio": False,
            "media_type": "image",
        }
    )
    return metadata


def generate_video_preview(source_path: Path, preview_path: Path, max_size: int = 1600) -> bool:
    ffmpeg = get_ffmpeg_executable()
    if ffmpeg is None:
        return False

    preview_path.parent.mkdir(parents=True, exist_ok=True)
    scale = (
        f"thumbnail=24,scale='if(gt(iw,ih),min(iw,{max_size}),-2)':"
        f"'if(gt(iw,ih),-2,min(ih,{max_size}))'"
    )

    try:
        proc = subprocess.run(
            [
                ffmpeg,
                "-hide_banner",
                "-loglevel",
                "error",
                "-y",
                "-i",
                str(source_path),
                "-vf",
                scale,
                "-frames:v",
                "1",
                str(preview_path),
            ],
            capture_output=True,
            check=False,
        )
        if proc.returncode == 0 and preview_path.exists():
            return True

        fallback = subprocess.run(
            [
                ffmpeg,
                "-hide_banner",
                "-loglevel",
                "error",
                "-y",
                "-ss",
                "00:00:01",
                "-i",
                str(source_path),
                "-vf",
                scale.replace("thumbnail=24,", ""),
                "-frames:v",
                "1",
                str(preview_path),
            ],
            capture_output=True,
            check=False,
        )
        return fallback.returncode == 0 and preview_path.exists()
    except Exception as exc:
        logger.warning("Failed to generate video preview for %s: %s", source_path, exc)
        return False