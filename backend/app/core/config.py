"""
Application configuration settings.
"""

from pathlib import Path
from typing import Literal

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application settings with environment variable support."""

    # App info
    APP_NAME: str = "Sortlens"
    VERSION: str = "0.3.5"
    DEBUG: bool = True

    # Server
    HOST: str = "127.0.0.1"
    PORT: int = 8000

    # Paths
    DATA_DIR: Path = Path.home() / ".sortlens"
    DATABASE_PATH: Path = DATA_DIR / "sortlens.db"
    CACHE_DIR: Path = DATA_DIR / "cache"
    PREVIEW_DIR: Path = CACHE_DIR / "previews"
    LOG_DIR: Path = DATA_DIR / "logs"

    # Preview settings
    PREVIEW_MAX_SIZE: int = 1600  # Max dimension for preview images
    PREVIEW_QUALITY: int = 85  # JPEG quality for previews

    # Performance
    PREFETCH_COUNT: int = 3  # Number of images to prefetch
    SCAN_BATCH_SIZE: int = 100  # Files to process per batch during scan

    # Safety
    DELETION_MODE: Literal["trash", "rejected_folder", "permanent"] = "trash"
    UNDO_DEPTH: int = 20
    INCLUDE_SIDECARS: bool = True

    # Supported formats
    SUPPORTED_FORMATS: tuple[str, ...] = (
        ".jpg", ".jpeg", ".png", ".webp", ".heic", ".heif", ".tif", ".tiff",
        ".nef", ".cr2", ".cr3", ".arw", ".raf", ".orf", ".rw2", ".dng"  # RAW formats
    )

    model_config = SettingsConfigDict(env_prefix="SORTLENS_", env_file=".env")

    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        # Ensure directories exist
        self.DATA_DIR.mkdir(parents=True, exist_ok=True)
        self.CACHE_DIR.mkdir(parents=True, exist_ok=True)
        self.PREVIEW_DIR.mkdir(parents=True, exist_ok=True)
        self.LOG_DIR.mkdir(parents=True, exist_ok=True)


settings = Settings()
