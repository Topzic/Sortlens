# Sortlens - Product Specification

> **Version**: 1.0.0  
> **Last Updated**: January 22, 2026

---

## 1. Overview

Sortlens is a local-first photo management application that helps users quickly sort, review, and clean up their photo libraries through an intuitive swipe-based interface and intelligent detection of blurry/duplicate images.

---

## 2. Supported Inputs

| Source Type           | Support Level | Notes                            |
| --------------------- | ------------- | -------------------------------- |
| Local folders         | ✅ Full       | Primary use case                 |
| External drives       | ✅ Full       | Any mounted drive (USB, SSD)     |
| SD cards              | ✅ Full       | Appears as mounted drive         |
| Mounted phone storage | ✅ Full       | When phone mounts as filesystem  |
| MTP devices           | 🔄 Future     | Requires OS-specific integration |
| Network drives        | ✅ Full       | If accessible as filesystem path |

### Supported Image Formats

- `.jpg`, `.jpeg` - Full support
- `.png` - Full support
- `.webp` - Full support
- `.heic`, `.heif` - Full support (with system codec)
- `.tif`, `.tiff` - Full support
- `.raw`, `.cr2`, `.nef`, `.arw` - Preview only (no editing)

---

## 3. Core Actions

### 3.1 Keep

- Mark image as "keep" - will remain in place
- Keyboard: `→` (Right Arrow) or `K`
- Gesture: Swipe right

### 3.2 Reject

- Mark image for removal (staged, not immediate)
- Keyboard: `←` (Left Arrow) or `X`
- Gesture: Swipe left

### 3.3 Undo

- Revert the last action (up to 20 actions deep)
- Keyboard: `Backspace` or `Ctrl+Z`
- Gesture: Swipe up

### 3.4 Review Later

- Skip without decision, add to review queue
- Keyboard: `↓` (Down Arrow) or `S`
- Gesture: Swipe down

### 3.5 Favorite

- Mark as favorite (independent of keep/reject)
- Keyboard: `F` or `Star`

---

## 4. Safety Guarantees

### 4.1 No Silent Deletion

- **NEVER** delete files without explicit user confirmation
- All deletions require a confirmation modal showing:
  - Number of files to be affected
  - Total size
  - List preview (first 10 items)

### 4.2 Default Behavior: Move to Trash

- Default action moves files to OS Trash/Recycle Bin
- Files can be restored via OS file recovery
- User can optionally choose "Move to Rejected folder" instead

### 4.3 Staging Area

- All "reject" decisions are **staged**, not executed
- User must explicitly "Apply Actions" to execute
- Preview shows exactly what will happen before execution

### 4.4 Audit Log

- Every file operation logged to `~/.sortlens/audit.log`
- Log format: `[timestamp] [action] [source_path] [destination_path]`
- Logs retained for 90 days minimum

### 4.5 Sidecar Handling

- When deleting `IMG_001.jpg`, prompt to also handle:
  - `IMG_001.xmp`
  - `IMG_001.jpg.xmp`
  - `IMG_001.json` (Google Photos metadata)
- Default: Include sidecars (with checkbox to exclude)

---

## 5. Swipe Mode Constraints

### 5.1 Sequential Order

- Images presented in consistent, deterministic order
- Default sort: folder path + filename (alphabetical)
- Optional: EXIF capture date (when available)

### 5.2 No Repeats in Session

- Each image shown exactly once per session
- Session cursor persisted to database
- Closing app does not lose progress

### 5.3 Session Definition

A session is uniquely identified by:

```
SessionID = hash(folderPath + sortMode + filterSettings)
```

### 5.4 Session Resume

- On app restart, prompt: "Continue previous session? (1,234 / 5,678 reviewed)"
- User can choose to continue or start fresh

### 5.5 Session Reset

- User can manually reset session to start over
- Resets cursor but preserves previous decisions in history

---

## 6. Data Storage

### 6.1 Database: SQLite

- Location: `~/.sortlens/sortlens.db`
- Portable, single-file, no server required

### 6.2 Core Schema

```sql
-- Images table
CREATE TABLE images (
    id TEXT PRIMARY KEY,           -- SHA256 of absolute path
    path TEXT UNIQUE NOT NULL,     -- Absolute file path
    filename TEXT NOT NULL,        -- Just the filename
    folder TEXT NOT NULL,          -- Parent folder path
    mtime INTEGER,                 -- File modification time
    size INTEGER,                  -- File size in bytes
    width INTEGER,                 -- Image width
    height INTEGER,                -- Image height
    format TEXT,                   -- File format (jpg, png, etc.)
    sha1_quick TEXT,               -- Quick hash (first 64KB)
    exif_date TEXT,                -- EXIF capture date
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- Sessions table
CREATE TABLE sessions (
    id TEXT PRIMARY KEY,
    folder_path TEXT NOT NULL,
    sort_mode TEXT DEFAULT 'path',
    filter_settings TEXT,          -- JSON
    cursor_position INTEGER DEFAULT 0,
    total_images INTEGER,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- Decisions table
CREATE TABLE decisions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL,
    image_id TEXT NOT NULL,
    decision TEXT NOT NULL,        -- 'keep', 'reject', 'skip', 'favorite'
    decided_at TEXT DEFAULT CURRENT_TIMESTAMP,
    applied_at TEXT,               -- NULL until executed
    FOREIGN KEY (session_id) REFERENCES sessions(id),
    FOREIGN KEY (image_id) REFERENCES images(id)
);

-- Quality scores table
CREATE TABLE quality_scores (
    image_id TEXT PRIMARY KEY,
    blur_score REAL,               -- Variance of Laplacian
    blur_scanned_at TEXT,
    phash TEXT,                    -- Perceptual hash
    phash_scanned_at TEXT,
    FOREIGN KEY (image_id) REFERENCES images(id)
);

-- Duplicate groups table
CREATE TABLE duplicate_groups (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    group_hash TEXT NOT NULL,      -- Hash identifying the group
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- Duplicate group members
CREATE TABLE duplicate_group_members (
    group_id INTEGER NOT NULL,
    image_id TEXT NOT NULL,
    is_best_candidate INTEGER DEFAULT 0,
    hamming_distance INTEGER,
    PRIMARY KEY (group_id, image_id),
    FOREIGN KEY (group_id) REFERENCES duplicate_groups(id),
    FOREIGN KEY (image_id) REFERENCES images(id)
);

-- Audit log table
CREATE TABLE audit_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    action TEXT NOT NULL,          -- 'move_to_trash', 'move_to_folder', 'delete'
    source_path TEXT NOT NULL,
    destination_path TEXT,
    file_size INTEGER,
    executed_at TEXT DEFAULT CURRENT_TIMESTAMP,
    success INTEGER DEFAULT 1,
    error_message TEXT
);
```

---

## 7. Configuration

### 7.1 User Settings

Location: `~/.sortlens/config.json`

```json
{
  "deletion_mode": "trash", // "trash" | "rejected_folder" | "permanent"
  "rejected_folder": null, // Custom path or null for trash
  "include_sidecars": true,
  "undo_depth": 20,
  "preview_cache_size_mb": 500,
  "blur_threshold_default": 100,
  "duplicate_hamming_threshold": 8,
  "theme": "system", // "light" | "dark" | "system"
  "keyboard_shortcuts": {
    "keep": ["ArrowRight", "k"],
    "reject": ["ArrowLeft", "x"],
    "undo": ["Backspace", "ctrl+z"],
    "skip": ["ArrowDown", "s"],
    "favorite": ["f"],
    "zoom": ["Space"]
  }
}
```

### 7.2 Device Profiles

For camera/device-specific thresholds:

```json
{
  "device_profiles": {
    "Canon EOS R5": {
      "blur_threshold": 150
    },
    "iPhone 15 Pro": {
      "blur_threshold": 80
    }
  }
}
```

---

## 8. Performance Requirements

| Metric                   | Target           |
| ------------------------ | ---------------- |
| App startup              | < 2 seconds      |
| Folder scan (10k images) | < 30 seconds     |
| Image preview load       | < 100ms (cached) |
| Swipe response           | < 50ms           |
| Preview prefetch         | Next 3 images    |
| Memory usage             | < 500MB typical  |

---

## 9. Security & Privacy

- **100% local**: No data sent to external servers
- **No telemetry**: No usage tracking
- **No account required**: Works completely offline
- **Portable data**: SQLite database can be backed up/moved

---

## 10. Glossary

| Term           | Definition                                             |
| -------------- | ------------------------------------------------------ |
| **Session**    | A review workflow for a specific folder with settings  |
| **Decision**   | A user's keep/reject/skip choice for an image          |
| **Staged**     | A decision recorded but not yet executed               |
| **Applied**    | A decision that has been executed (file moved/deleted) |
| **Sidecar**    | Metadata file associated with an image (XMP, JSON)     |
| **pHash**      | Perceptual hash for finding visually similar images    |
| **Blur score** | Variance of Laplacian - lower = blurrier               |
