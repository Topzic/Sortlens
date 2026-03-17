# Sortlens Build Plan

## Phase 0 — Define "Done" and guardrails (1–2 hrs)

### Deliverables

A one-page spec with:

- **Supported inputs**: local folders + external drives/SD + any "mounted" phone/camera storage
- **Core actions**: Keep / Reject / Undo / Review later
- **Safety**: never delete without confirmation; default to "Move to Trash" not permanent delete
- **Swipe constraints**: sequential order, no repeats in a session unless user reselects folder

### Decisions

- **Storage of decisions**: local SQLite (recommended) or JSON file per folder
- **Deletion behavior**: move to OS trash vs move to a user-selected "Rejected" folder

---

## Phase 1 — Repo setup + basic local app skeleton (Half day)

### Backend

- Create `backend/` with FastAPI
- Create endpoints:
  - `GET /health`
  - `GET /api/version`

### Frontend

- Create `frontend/` with React + Vite
- Add Tailwind CSS
- Basic layout with tabs:
  - Swipe
  - Blurry
  - Duplicates
  - Browse
  - Settings

### Deliverable

Run one command, app opens at `http://localhost:xxxx` and shows the UI shell.

---

## Phase 2 — Folder selection + file indexing (1–2 days)

This is the foundation.

### Backend

Implement folder selection strategy (local-first):

- **Option A** (best UX): Tauri or Electron wrapper → native folder picker
- **Option B** (pure local web): user pastes/enters path + you validate

Build an indexer:

- Recursively scan folder(s)
- Collect image files (`.jpg` `.jpeg` `.png` `.heic`? `.webp` `.tif`? as you choose)
- Save a local index in SQLite:
  ```
  images(id, path, mtime, size, width, height, sha1_quick, session_seen, rating, decision, decision_time)
  ```

Generate stable sort order:

- default: by folder path + filename (or EXIF capture date if available)

### Frontend

- Folder picker UI
- Show:
  - image count
  - estimated scan time (based on file count)
  - "Start session" button

### Constraints to implement now

- A "session" is defined by: `(folderSelectionId + sortMode + filters)`
- Each session has a cursor pointer; do not repeat unless session resets.

### Deliverable

Select a folder → backend indexes → frontend shows "Ready: 3,482 images".

---

## Phase 3 — Image serving + fast preview pipeline (1–2 days)

This is where performance matters.

### Backend

- Endpoint: `GET /api/images/{id}/preview`
  - Returns a resized JPEG preview (e.g., max 1600px)
  - Cache previews on disk (`.cache/previews/<id>.jpg`)
- Endpoint: `GET /api/images/{id}/full` (optional)
- Endpoint: `GET /api/session/{sessionId}/next`
  - Returns the next unseen image id + metadata

### Frontend

- Image viewer component
- Prefetch next 1–3 previews to make swiping instant
- Keyboard shortcuts:
  - Right arrow = keep
  - Left arrow = reject
  - Backspace = undo
  - Space = toggle zoom/fit

### Deliverable

Swiping feels snappy on a folder of 5k+ photos.

---

## Phase 4 — Swipe mode core logic (1–2 days)

### Backend

Session model:

- `POST /api/session/start` with folder + options
- `POST /api/session/{id}/decision` (keep/reject)
- `POST /api/session/{id}/undo`

Enforce constraints:

- sequential order
- never repeat within session
- persist cursor and decisions so app can close/reopen

### Frontend

Tinder-like UI:

- Swipe gestures on trackpad/touch (optional)
- Big Keep/Reject buttons (for mouse)

Progress indicator:

- seen / total
- "End session" and "Reset session"

### Deliverable

A complete swipe workflow that never repeats and supports undo + resume.

---

## Phase 5 — Safe delete / move workflow (1 day)

### Backend

Create "apply actions" pipeline:

- decisions are staged until user confirms
- `POST /api/actions/preview` → shows what would happen
- `POST /api/actions/execute` → move to trash or move to folder

Make it safe:

- default to OS trash (cross-platform libraries exist)
- log every operation

### Frontend

- "Review Rejected" list
- Confirmation modal:
  - "Move 312 photos to Trash"
  - checkbox: "Also remove sidecars .xmp" (optional)

### Deliverable

Users trust it because nothing destructive happens accidentally.

---

## Phase 6 — Blurry detection (2–4 days)

### Backend

Implement blur scoring:

- Start with classic: variance of Laplacian (fast)
- Store score in DB (`blur_score`)

Add scan endpoint:

- `POST /api/quality/blur/scan` (folder or session)
- background job queue locally (simple worker thread/process)

Results endpoint:

- `GET /api/quality/blur/results?threshold=...`

### Frontend

Blurry tab:

- threshold slider
- sort by blur score
- quick keep/reject in grid view

### Deliverable

"Find blurry photos" works and is adjustable per camera/lighting.

---

## Phase 7 — Duplicate detection (3–6 days)

### Backend

Compute perceptual hash:

- pHash or dHash
- store in DB (`phash`)

Grouping:

- exact match groups
- near-duplicate groups using Hamming distance <= N

Endpoints:

- `POST /api/dupes/scan`
- `GET /api/dupes/groups`

### Frontend

Duplicate groups UI:

- Show best candidate larger (auto-pick based on resolution/sharpness)
- "Keep best, reject others"
- manual override

### Deliverable

Clear grouping + one-click cleanup per group.

---

## Phase 8 — Browse mode + jump-to-folder (1–2 days)

### Backend

- `GET /api/folders/tree` or `GET /api/images?folder=...`
- `POST /api/system/open`:
  - opens file location in Explorer/Finder (optional, OS-dependent)

### Frontend

- Folder tree + gallery grid
- Clicking an image opens detail view
- Buttons:
  - Open containing folder
  - Mark as favorite
  - Add to swipe queue (optional)

### Deliverable

A normal photo browser that complements AI tabs.

---

## Phase 9 — External device support (1–3 days, depends on OS)

Reality check: if the phone/camera mounts as a drive, it's easy. True MTP is trickier.

### Plan

- **MVP**: support anything that appears as a filesystem path (SD cards, external drives, mounted devices)
- **Later**: optional MTP integration per OS

### Frontend

"Sources" panel:

- This Computer
- External Drives
- Removable Media

If you can't list devices reliably, just let users select paths.

### Deliverable

Plug in SD card / external drive → select folder → works.

---

## Phase 10 — Performance + reliability hardening (2–5 days)

### Must-haves

- Lazy loading everywhere
- Preview caching
- Don't compute hashes/scores twice
- Handle corrupted images gracefully
- Pause/resume scanning
- Cancel scan

### Testing

Test sets:

- 500 images
- 10k images
- mixed formats
- nested folders like Canon structure

### Deliverable

Doesn't crash, doesn't hang, handles big libraries.

---

## Phase 11 — Packaging & distribution (2–4 days)

You have two realistic paths:

### Option A: Desktop app wrapper (recommended)

- Tauri (Rust) + your local web UI
- Gives native folder picker + better "local app" feel

### Option B: Pure local server

- `pipx install` / one-click installer
- launches browser automatically

### Deliverable

Non-technical user can install and run it.

---

## Phase 12 — Cloud-ready prep (future)

Not building cloud now, but structure for it:

- Isolate processing layer (`core/quality`, `core/dupes`, `core/indexing`)
- Define a "job" interface so later you can run jobs remotely
- Add a storage abstraction (local FS vs S3)

---

## Recommended constraints & suggestions

- **Undo depth**: at least last 20 actions (not just last 1)
- **Session resume**: on restart, user can continue where they left off
- **Never delete originals by default**: default to Trash or move to "Rejected"
- **Don't block UI while scanning**: scanning runs in background locally
- **Sidecar awareness**: if deleting `IMG_001.jpg`, optionally include `IMG_001.xmp`
- **Config profiles**: presets per device (Canon vs iPhone blur threshold differs)
- **Audit log**: every move/delete recorded to a log file for trust
