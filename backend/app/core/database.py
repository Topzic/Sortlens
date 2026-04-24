"""
Database initialization and connection management.
"""

import logging

import aiosqlite

from app.core.config import settings

logger = logging.getLogger(__name__)

# Database connection instance
_db_connection: aiosqlite.Connection | None = None


async def get_db() -> aiosqlite.Connection:
    """Get the database connection."""
    global _db_connection
    if _db_connection is None:
        _db_connection = await aiosqlite.connect(settings.DATABASE_PATH)
        _db_connection.row_factory = aiosqlite.Row
        await _db_connection.execute("PRAGMA foreign_keys = ON")
        await _db_connection.execute("PRAGMA journal_mode = WAL")
        await _db_connection.execute("PRAGMA synchronous = NORMAL")
    return _db_connection


async def close_db():
    """Close the database connection."""
    global _db_connection
    if _db_connection is not None:
        await _db_connection.close()
        _db_connection = None


async def init_db():
    """Initialize the database schema."""
    db = await get_db()

    # Migration: if image_tags exists without tag_id (old schema), drop it and tags so they are recreated fresh
    cursor = await db.execute("PRAGMA table_info(image_tags)")
    it_columns = {row[1] for row in await cursor.fetchall()}
    if it_columns and "tag_id" not in it_columns:
        logger.info("Detected old image_tags schema — dropping image_tags and tags for migration")
        await db.execute("DROP TABLE IF EXISTS image_tags")
        await db.execute("DROP TABLE IF EXISTS tags")
        await db.commit()

    # Create tables
    await db.executescript(
        """
        -- Images table
        CREATE TABLE IF NOT EXISTS images (
            id TEXT PRIMARY KEY,
            path TEXT UNIQUE NOT NULL,
            filename TEXT NOT NULL,
            folder TEXT NOT NULL,
            mtime INTEGER,
            size INTEGER,
            width INTEGER,
            height INTEGER,
            format TEXT,
            media_type TEXT DEFAULT 'image',
            duration REAL,
            fps REAL,
            video_codec TEXT,
            audio_codec TEXT,
            bitrate INTEGER,
            has_audio INTEGER DEFAULT 0,
            sha1_quick TEXT,
            exif_date TEXT,
            camera_make TEXT,
            camera_model TEXT,
            iso INTEGER,
            shutter_speed TEXT,
            aperture TEXT,
            exposure_program TEXT,
            focal_length TEXT,
            star_rating INTEGER DEFAULT 0,
            color_label TEXT,
            flag TEXT DEFAULT 'unflagged',
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT DEFAULT CURRENT_TIMESTAMP
        );

        -- Registered folders table (multi-folder support)
        CREATE TABLE IF NOT EXISTS folders (
            id TEXT PRIMARY KEY,
            path TEXT UNIQUE NOT NULL,
            label TEXT,
            added_at TEXT DEFAULT CURRENT_TIMESTAMP,
            last_scanned_at TEXT,
            image_count INTEGER DEFAULT 0
        );

        -- Collections table (virtual groupings)
        CREATE TABLE IF NOT EXISTS collections (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            description TEXT,
            is_smart INTEGER DEFAULT 0,
            smart_rules TEXT,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT DEFAULT CURRENT_TIMESTAMP
        );

        -- Collection members (many-to-many)
        CREATE TABLE IF NOT EXISTS collection_members (
            collection_id TEXT NOT NULL,
            image_id TEXT NOT NULL,
            added_at TEXT DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (collection_id, image_id),
            FOREIGN KEY (collection_id) REFERENCES collections(id) ON DELETE CASCADE,
            FOREIGN KEY (image_id) REFERENCES images(id) ON DELETE CASCADE
        );

        -- Sessions table
        CREATE TABLE IF NOT EXISTS sessions (
            id TEXT PRIMARY KEY,
            folder_path TEXT NOT NULL,
            sort_mode TEXT DEFAULT 'path',
            filter_settings TEXT,
            cursor_position INTEGER DEFAULT 0,
            total_images INTEGER,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT DEFAULT CURRENT_TIMESTAMP
        );

        -- Decisions table
        CREATE TABLE IF NOT EXISTS decisions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            session_id TEXT NOT NULL,
            image_id TEXT NOT NULL,
            decision TEXT NOT NULL,
            decided_at TEXT DEFAULT CURRENT_TIMESTAMP,
            applied_at TEXT,
            FOREIGN KEY (session_id) REFERENCES sessions(id),
            FOREIGN KEY (image_id) REFERENCES images(id)
        );

        -- Quality scores table
        CREATE TABLE IF NOT EXISTS quality_scores (
            image_id TEXT PRIMARY KEY,
            blur_score REAL,
            blur_scanned_at TEXT,
            phash TEXT,
            phash_scanned_at TEXT,
            FOREIGN KEY (image_id) REFERENCES images(id)
        );

        -- Duplicate groups table
        CREATE TABLE IF NOT EXISTS duplicate_groups (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            group_hash TEXT NOT NULL,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP
        );

        -- Duplicate group members
        CREATE TABLE IF NOT EXISTS duplicate_group_members (
            group_id INTEGER NOT NULL,
            image_id TEXT NOT NULL,
            is_best_candidate INTEGER DEFAULT 0,
            hamming_distance INTEGER,
            PRIMARY KEY (group_id, image_id),
            FOREIGN KEY (group_id) REFERENCES duplicate_groups(id),
            FOREIGN KEY (image_id) REFERENCES images(id)
        );

        -- Audit log table
        CREATE TABLE IF NOT EXISTS audit_log (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            action TEXT NOT NULL,
            source_path TEXT NOT NULL,
            destination_path TEXT,
            file_size INTEGER,
            executed_at TEXT DEFAULT CURRENT_TIMESTAMP,
            success INTEGER DEFAULT 1,
            error_message TEXT
        );

        -- Settings table for app state
        CREATE TABLE IF NOT EXISTS settings (
            key TEXT PRIMARY KEY,
            value TEXT,
            updated_at TEXT DEFAULT CURRENT_TIMESTAMP
        );

        -- Tags registry (global unique tags)
        CREATE TABLE IF NOT EXISTS tags (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL UNIQUE COLLATE NOCASE,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP
        );

        -- Image-tag junction (many-to-many)
        CREATE TABLE IF NOT EXISTS image_tags (
            image_id TEXT NOT NULL,
            tag_id INTEGER NOT NULL,
            source TEXT NOT NULL DEFAULT 'manual',
            confidence REAL,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (image_id, tag_id),
            FOREIGN KEY (image_id) REFERENCES images(id) ON DELETE CASCADE,
            FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
        );

        -- Create indexes for common queries (only columns guaranteed to exist)
        CREATE INDEX IF NOT EXISTS idx_images_folder ON images(folder);
        CREATE INDEX IF NOT EXISTS idx_images_format ON images(format);
        CREATE INDEX IF NOT EXISTS idx_decisions_session ON decisions(session_id);
        CREATE INDEX IF NOT EXISTS idx_decisions_image ON decisions(image_id);
        CREATE INDEX IF NOT EXISTS idx_quality_blur ON quality_scores(blur_score);
        CREATE INDEX IF NOT EXISTS idx_collection_members_coll ON collection_members(collection_id);
        CREATE INDEX IF NOT EXISTS idx_collection_members_img ON collection_members(image_id);
        """
    )

    # Migration: add new columns to existing images table
    cursor = await db.execute("PRAGMA table_info(images)")
    columns = {row[1] for row in await cursor.fetchall()}

    if "camera_make" not in columns:
        await db.execute("ALTER TABLE images ADD COLUMN camera_make TEXT")
    if "camera_model" not in columns:
        await db.execute("ALTER TABLE images ADD COLUMN camera_model TEXT")
    if "media_type" not in columns:
        await db.execute("ALTER TABLE images ADD COLUMN media_type TEXT DEFAULT 'image'")
    if "duration" not in columns:
        await db.execute("ALTER TABLE images ADD COLUMN duration REAL")
    if "fps" not in columns:
        await db.execute("ALTER TABLE images ADD COLUMN fps REAL")
    if "video_codec" not in columns:
        await db.execute("ALTER TABLE images ADD COLUMN video_codec TEXT")
    if "audio_codec" not in columns:
        await db.execute("ALTER TABLE images ADD COLUMN audio_codec TEXT")
    if "bitrate" not in columns:
        await db.execute("ALTER TABLE images ADD COLUMN bitrate INTEGER")
    if "has_audio" not in columns:
        await db.execute("ALTER TABLE images ADD COLUMN has_audio INTEGER DEFAULT 0")
    if "iso" not in columns:
        await db.execute("ALTER TABLE images ADD COLUMN iso INTEGER")
    if "shutter_speed" not in columns:
        await db.execute("ALTER TABLE images ADD COLUMN shutter_speed TEXT")
    if "aperture" not in columns:
        await db.execute("ALTER TABLE images ADD COLUMN aperture TEXT")
    if "exposure_program" not in columns:
        await db.execute("ALTER TABLE images ADD COLUMN exposure_program TEXT")
    if "focal_length" not in columns:
        await db.execute("ALTER TABLE images ADD COLUMN focal_length TEXT")
    if "latitude" not in columns:
        await db.execute("ALTER TABLE images ADD COLUMN latitude REAL")
    if "longitude" not in columns:
        await db.execute("ALTER TABLE images ADD COLUMN longitude REAL")
    if "star_rating" not in columns:
        await db.execute("ALTER TABLE images ADD COLUMN star_rating INTEGER DEFAULT 0")
    if "color_label" not in columns:
        await db.execute("ALTER TABLE images ADD COLUMN color_label TEXT")
    if "flag" not in columns:
        await db.execute("ALTER TABLE images ADD COLUMN flag TEXT DEFAULT 'unflagged'")

    # Migration: add folder customization columns
    folder_cursor = await db.execute("PRAGMA table_info(folders)")
    folder_columns = {row[1] for row in await folder_cursor.fetchall()}
    if "is_favorite" not in folder_columns:
        await db.execute("ALTER TABLE folders ADD COLUMN is_favorite INTEGER DEFAULT 0")
    if "color" not in folder_columns:
        await db.execute("ALTER TABLE folders ADD COLUMN color TEXT")
    if "sort_order" not in folder_columns:
        await db.execute("ALTER TABLE folders ADD COLUMN sort_order INTEGER DEFAULT 0")

    # Migration: add collection customization columns
    coll_cursor = await db.execute("PRAGMA table_info(collections)")
    coll_columns = {row[1] for row in await coll_cursor.fetchall()}
    if "is_favorite" not in coll_columns:
        await db.execute("ALTER TABLE collections ADD COLUMN is_favorite INTEGER DEFAULT 0")
    if "color" not in coll_columns:
        await db.execute("ALTER TABLE collections ADD COLUMN color TEXT")

    # Create indexes on columns that may have been added by migration above
    await db.execute("CREATE INDEX IF NOT EXISTS idx_images_star_rating ON images(star_rating)")
    await db.execute("CREATE INDEX IF NOT EXISTS idx_images_color_label ON images(color_label)")
    await db.execute("CREATE INDEX IF NOT EXISTS idx_images_flag ON images(flag)")
    await db.execute("CREATE INDEX IF NOT EXISTS idx_images_media_type ON images(media_type)")
    await db.execute("CREATE INDEX IF NOT EXISTS idx_images_rating_label ON images(star_rating, color_label)")
    await db.execute("CREATE INDEX IF NOT EXISTS idx_images_filename ON images(filename)")
    await db.execute("CREATE INDEX IF NOT EXISTS idx_images_created_at ON images(created_at)")
    await db.execute("CREATE INDEX IF NOT EXISTS idx_images_exif_date ON images(exif_date)")
    await db.execute("CREATE INDEX IF NOT EXISTS idx_images_geo ON images(latitude, longitude)")
    await db.execute("CREATE INDEX IF NOT EXISTS idx_duplicate_groups_hash ON duplicate_groups(group_hash)")
    await db.execute("CREATE INDEX IF NOT EXISTS idx_image_tags_image ON image_tags(image_id)")
    await db.execute("CREATE INDEX IF NOT EXISTS idx_image_tags_tag ON image_tags(tag_id)")
    await db.execute("CREATE INDEX IF NOT EXISTS idx_tags_name ON tags(name)")

    await db.commit()
    logger.info("Database initialized at %s", settings.DATABASE_PATH)
