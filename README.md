<div align="center">

# Sortlens

**Fast, local photo management for photographers who shoot thousands of images.**

Sort, rate, cull, and organize your photo library — entirely offline, no subscriptions, no cloud.

[![Version](https://img.shields.io/badge/version-0.1.0-blue)]()
[![Platform](https://img.shields.io/badge/platform-Windows-lightgrey)]()
[![License](https://img.shields.io/badge/license-Proprietary-orange)]()

[Download Latest Release](https://github.com/Topzic/Sortlens/releases/latest)

</div>

---

## What is Sortlens?

Sortlens is a desktop photo management tool built for photographers who need to quickly review, rate, and organize large batches of images. It runs 100% locally on your machine — your photos never leave your computer.

Whether you're coming back from a shoot with 2,000 images or managing a growing library of 50,000+, Sortlens helps you sort the keepers from the rejects fast.

---

## Installation

1. **Download** the latest `Sortlens-windows-x64.zip` from the [Releases page](https://github.com/Topzic/Sortlens/releases/latest)
2. **Extract** the zip to any folder on your computer (e.g. `C:\Sortlens`)
3. **Run** `Sortlens.exe`
4. **Add a folder** — click the ➕ in the sidebar to add a folder of photos
5. Start sorting!

> **Note:** Keep the `_internal` folder next to `Sortlens.exe` — it contains required files. Do not move or delete it.

### System Requirements

- Windows 10 or later (64-bit)
- 4 GB RAM minimum (8 GB recommended for large libraries)
- No internet connection required

---

## Features

### ⚡ Swipe Mode — Rapid Photo Review

Review photos fast with a Tinder-style swipe interface. Swipe right to keep, left to reject, down to skip. Use keyboard shortcuts for even faster culling:

| Action   | Keyboard    | Gesture     |
| -------- | ----------- | ----------- |
| Keep     | `→` or `K`  | Swipe right |
| Reject   | `←` or `X`  | Swipe left  |
| Skip     | `↓` or `S`  | Swipe down  |
| Undo     | `Backspace` | Swipe up    |
| Favorite | `F`         | —           |
| Zoom     | `1`–`4`     | —           |

- Resume sessions exactly where you left off
- Sort by filename or capture date
- Prefetches the next 3 images for instant loading

### 🖼️ Browse Mode — Grid & List View

View your entire library in a resizable grid or detailed list. Click any image to open the full-resolution lightbox.

- **Search** by filename
- **Filter** by star rating, color label, or flag
- **Sort** by name, size, date, rating, dimensions, or EXIF date
- **Batch select** with Ctrl+click to rate, label, or flag multiple images at once
- **Lightbox** with full EXIF metadata panel (camera, ISO, aperture, shutter speed, dimensions, GPS)

### ⭐ Rating, Labels & Flags

Organize images your way with three independent annotation systems:

- **Star Rating** — 1 to 5 stars
- **Color Labels** — Red, Yellow, Green, Blue, Purple
- **Flags** — Pick, Reject, or Unflagged

All annotations are saved locally and persist across sessions.

### 📦 Collections

Group images into custom collections for projects, client deliveries, or personal favorites.

- Create unlimited named collections
- Add images from any folder
- Quick-access from the sidebar
- Smart collections with auto-filtering rules

### 🔍 Blurry Detection

Automatically scan your library for out-of-focus images using Laplacian variance analysis.

- Adjustable sensitivity threshold
- Review detected images before taking action
- Batch scan entire folders

### 👯 Duplicate Finder

Find visually similar images using perceptual hashing — catches near-duplicates that pixel-perfect comparison would miss.

- Adjustable similarity threshold
- Groups duplicates together with a recommended "best" pick
- Batch select and delete duplicates

### 🗺️ Map View

See where your photos were taken on an interactive map. Requires GPS data in EXIF (most cameras and phones include this).

### 📊 Dashboard

At-a-glance stats about your library:

- Total images and library size
- Images reviewed, kept, rejected, skipped
- Rated and flagged counts
- Space freed from deletions

### 🏥 Library Health

Monitor the health of your library:

- Detect missing or moved files
- Track folder status
- Re-map folders if drives change

### ⚙️ Settings

- **Deletion mode** — Move to Trash (default & recoverable), move to a rejected folder, or permanent delete
- **Sidecar handling** — Optionally include XMP/JSON sidecars when deleting
- **Performance tuning** — Preview size, prefetch count, scan batch size
- **External editor** — Open images in your preferred editor
- **Themes** — Light, Dark, and Dark+ modes

---

## Supported File Formats

| Format      | Type            | Support              |
| ----------- | --------------- | -------------------- |
| JPEG / JPG  | Standard        | ✅ Full              |
| PNG         | Standard        | ✅ Full              |
| WebP        | Standard        | ✅ Full              |
| TIFF / TIF  | Standard        | ✅ Full              |
| HEIC / HEIF | Standard        | ✅ With system codec |
| NEF         | RAW (Nikon)     | ✅ Preview & EXIF    |
| CR2 / CR3   | RAW (Canon)     | ✅ Preview & EXIF    |
| ARW         | RAW (Sony)      | ✅ Preview & EXIF    |
| RAF         | RAW (Fujifilm)  | ✅ Preview & EXIF    |
| ORF         | RAW (Olympus)   | ✅ Preview & EXIF    |
| RW2         | RAW (Panasonic) | ✅ Preview & EXIF    |
| DNG         | RAW (Adobe)     | ✅ Preview & EXIF    |

---

## Privacy & Security

- **100% Local** — No data leaves your machine. Ever.
- **No Account Required** — No sign-up, no login, no cloud.
- **No Telemetry** — Zero tracking or analytics.
- **Portable Data** — Your library database is a single file at `~/.sortlens/sortlens.db` that you can back up or move.

---

## Safety

Sortlens is built with safety-first defaults:

- **All deletions are staged** — nothing happens until you confirm
- **Confirmation dialogs** show exactly what will be affected (file count, total size, file list)
- **Undo support** — undo up to 20 actions
- **Trash by default** — rejected files go to your OS recycling bin, not permanent delete
- **Audit log** — every destructive operation is logged to `~/.sortlens/audit.log`

---

## FAQ

**Q: Do I need to install anything else?**
No. Sortlens is fully self-contained. Just extract the zip and run `Sortlens.exe`.

**Q: Where is my data stored?**
Your library database and settings are stored in `C:\Users\<YourName>\.sortlens\`. Your actual photos are never moved or modified unless you explicitly choose to delete or copy them.

**Q: Can I use this with RAW files?**
Yes. Sortlens supports NEF, CR2, CR3, ARW, RAF, ORF, RW2, and DNG. It reads the embedded preview and full EXIF data from RAW files.

**Q: Will my images be uploaded anywhere?**
No. Sortlens is completely offline. There is no internet connectivity, no cloud storage, no telemetry.

**Q: Can I use multiple folders?**
Yes. Add as many source folders as you want from the sidebar. Switch between them or browse all at once.

---

## Version

**Current Release: v0.1.0**

---

<div align="center">

Made for photographers, by a photographer.

</div>
