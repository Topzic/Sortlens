# Sortlens v0.6.2

## Highlights

- Added the full tagging workflow across Browse and Swipe, including manual tags, autocomplete, batch tagging, AI suggestions, and XMP sidecar write-back.
- Added AI tag infrastructure with downloadable CLIP suggestions, optional YOLO object labels, configurable tag packs, and Settings controls for model management.
- Expanded library organization with folder and collection favorites, custom colors, search and sort controls, external-device awareness, offline folder detection, and safer rescan/removal cleanup.
- Improved Browse and review workflows with tag filters, delete and reveal actions, Photos viewer support, better EXIF panels, offline preview fallbacks, and Browse as the default landing page.
- Added release history in Settings, dynamic backend port discovery for dev and packaged builds, smarter startup environment repair, and updated packaging for the new AI dependencies.

## Tagging And AI

- New backend tag API for per-image tags, batch tag operations, tag registry management, AI status, AI downloads, and tag pack metadata.
- New XMP sidecar support keeps tag write-back non-destructive and Lightroom-compatible.
- New suggestion engine combines EXIF hints, YOLO object detection, and CLIP-based vocabulary packs for photography, wildlife, food, scene, and event tagging.
- Browse and Swipe now surface image tags directly, and Settings includes model download, model removal, YOLO toggle, and tag-pack enablement.
- Browse tag filters now support comma-separated tags with ANY or ALL matching.

## Library And UX

- Folders and collections now support favorites and color accents.
- Sidebar now supports folder and collection search, sorting, bulk selection, multi-folder range selection, offline indicators for external drives/devices, and scan progress toasts.
- Browse now supports deleting images, opening in Photos, revealing file location, batch tagging, and improved handling for unavailable previews.
- Swipe now includes integrated tagging, corrected overlay bounds, better offline behavior for disconnected external devices, and refined image/action layout.
- Blurry and Duplicates views were reworked to keep headers and controls stable while content scrolls.
- Registered folders now report accessibility so images remain in the library even when the source external device is disconnected.

## Platform And Release

- Backend now selects the first free port in a configured range and writes it to a `.port` file for the frontend and packaged app.
- Startup now validates Python 3.11+, rebuilds stale virtual environments, and resyncs dependencies when the backend project changes.
- Settings now includes release history from GitHub.
- Packaging now includes the AI tagging runtime dependencies and bundled YOLO model.

## Fixes

- Fixed tag filtering in Browse when using ALL mode by normalizing and deduplicating filter values before query generation.
- Fixed packaged icon path drift in the PyInstaller spec after the project move.
- Fixed the release automation so version bumps no longer overwrite unrelated TOML settings.
