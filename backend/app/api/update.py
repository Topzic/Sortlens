"""
Auto-update endpoints — check for new releases on GitHub and download installer.
"""

import asyncio
import logging
import os
import re
import subprocess
import sys
import tempfile
import zipfile
from pathlib import Path

import httpx
from fastapi import APIRouter
from pydantic import BaseModel

from app.core.config import settings

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/update")

GITHUB_OWNER = "Topzic"
GITHUB_REPO = "Sortlens"
# Matches installer zips like SortlensSetup-0.3.5.zip
ASSET_PATTERN = re.compile(r"^SortlensSetup-[\d.]+\.zip$", re.IGNORECASE)


class UpdateCheckResponse(BaseModel):
    update_available: bool
    current_version: str
    latest_version: str | None = None
    download_url: str | None = None
    release_notes: str | None = None
    asset_size: int | None = None


class UpdateApplyResponse(BaseModel):
    success: bool
    message: str


class ReleaseInfo(BaseModel):
    version: str
    tag: str
    release_notes: str | None = None
    published_at: str | None = None
    asset_size: int | None = None


def _parse_version(v: str) -> tuple[int, ...]:
    """Parse a version string like '0.1.0' or 'v0.1.0' into a comparable tuple."""
    v = v.lstrip("vV")
    parts = []
    for p in v.split("."):
        try:
            parts.append(int(p))
        except ValueError:
            parts.append(0)
    return tuple(parts)


@router.get("/check", response_model=UpdateCheckResponse)
async def check_for_update():
    """Check GitHub for a newer release."""
    current = settings.VERSION
    api_url = f"https://api.github.com/repos/{GITHUB_OWNER}/{GITHUB_REPO}/releases/latest"

    try:
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.get(api_url, headers={"Accept": "application/vnd.github+json"})
            resp.raise_for_status()
            data = resp.json()
    except Exception as exc:
        logger.warning("Failed to check for updates: %s", exc)
        return UpdateCheckResponse(
            update_available=False,
            current_version=current,
        )

    latest_tag: str = data.get("tag_name", "")
    latest_ver = latest_tag.lstrip("vV")

    # Find the installer zip asset (SortlensSetup-x.x.x.zip)
    download_url = None
    asset_size = None
    for asset in data.get("assets", []):
        if ASSET_PATTERN.match(asset["name"]):
            download_url = asset["browser_download_url"]
            asset_size = asset["size"]
            break

    update_available = _parse_version(latest_ver) > _parse_version(current) and download_url is not None

    return UpdateCheckResponse(
        update_available=update_available,
        current_version=current,
        latest_version=latest_ver or None,
        download_url=download_url,
        release_notes=data.get("body"),
        asset_size=asset_size,
    )


@router.get("/history", response_model=list[ReleaseInfo])
async def get_release_history():
    """Fetch all releases from GitHub (most recent first)."""
    api_url = f"https://api.github.com/repos/{GITHUB_OWNER}/{GITHUB_REPO}/releases"

    try:
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.get(
                api_url,
                headers={"Accept": "application/vnd.github+json"},
                params={"per_page": 50},
            )
            resp.raise_for_status()
            data = resp.json()
    except Exception as exc:
        logger.warning("Failed to fetch release history: %s", exc)
        return []

    releases: list[ReleaseInfo] = []
    for release in data:
        tag = release.get("tag_name", "")
        version = tag.lstrip("vV")
        asset_size = None
        for asset in release.get("assets", []):
            if ASSET_PATTERN.match(asset["name"]):
                asset_size = asset["size"]
                break
        releases.append(ReleaseInfo(
            version=version,
            tag=tag,
            release_notes=release.get("body"),
            published_at=release.get("published_at"),
            asset_size=asset_size,
        ))
    return releases


@router.post("/apply", response_model=UpdateApplyResponse)
async def apply_update():
    """Download the latest installer, extract it, launch it, and close the app."""
    if not getattr(sys, "frozen", False):
        return UpdateApplyResponse(
            success=False,
            message="Updates can only be applied to the packaged (exe) build. "
                    "For development, pull the latest code from GitHub.",
        )

    check = await check_for_update()
    if not check.update_available or not check.download_url:
        return UpdateApplyResponse(success=False, message="No update available.")

    download_url = check.download_url
    logger.info("Downloading installer from %s", download_url)

    try:
        zip_path = await asyncio.to_thread(_download_installer_zip, download_url)
    except Exception as exc:
        logger.error("Download failed: %s", exc)
        return UpdateApplyResponse(success=False, message=f"Download failed: {exc}")

    # Extract installer exe from the zip
    try:
        installer_path = await asyncio.to_thread(_extract_installer, zip_path)
    except Exception as exc:
        logger.error("Extract failed: %s", exc)
        return UpdateApplyResponse(success=False, message=f"Extract failed: {exc}")
    finally:
        try:
            Path(zip_path).unlink(missing_ok=True)
        except Exception:
            pass

    # Launch the installer (detached) and shut down the app
    logger.info("Launching installer: %s", installer_path)
    try:
        subprocess.Popen(
            [str(installer_path)],
            creationflags=subprocess.DETACHED_PROCESS | subprocess.CREATE_NEW_PROCESS_GROUP,
        )
    except Exception as exc:
        logger.error("Failed to launch installer: %s", exc)
        return UpdateApplyResponse(success=False, message=f"Failed to launch installer: {exc}")

    # Schedule shutdown so the response is returned first
    asyncio.get_event_loop().call_later(1.5, _shutdown)

    return UpdateApplyResponse(
        success=True,
        message="Installer launched. Sortlens will close — follow the installer to complete the update.",
    )


def _shutdown():
    """Exit the process so the installer can replace files."""
    os._exit(0)


def _download_installer_zip(url: str) -> str:
    """Download the release zip to a temp file (runs in thread)."""
    import urllib.request

    tmp = tempfile.mktemp(suffix=".zip", prefix="sortlens_update_")
    urllib.request.urlretrieve(url, tmp)  # noqa: S310 — trusted GitHub URL
    return tmp


def _extract_installer(zip_path: str) -> Path:
    """Extract the .exe installer from the zip to a temp directory."""
    tmp_dir = Path(tempfile.mkdtemp(prefix="sortlens_installer_"))
    with zipfile.ZipFile(zip_path, "r") as zf:
        exe_names = [n for n in zf.namelist() if n.lower().endswith(".exe")]
        if not exe_names:
            raise RuntimeError("No .exe found in installer zip")
        # Extract the first exe found
        zf.extract(exe_names[0], tmp_dir)
        return tmp_dir / exe_names[0]
