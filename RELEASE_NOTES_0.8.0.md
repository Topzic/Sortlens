# Sortlens v0.8.0

## Highlights

- Added full media support so videos now live alongside photos across Browse, Swipe, and Map, with generated previews, browser playback, and richer metadata.
- Added the complete tagging stack: manual tags, batch tagging, XMP sidecar write-back, AI suggestions, tag packs, and Settings controls for model download and YOLO toggles.
- Expanded library organization with folder and collection favorites, custom colors, search and sort tools, and better handling for offline external drives and devices.
- Added converted export options for selected items in Browse so image selections can now be exported as original files, JPEGs, or PNGs.

## New Features

### Unified Photo And Video Workflow

- Videos are now indexed in the main library alongside still images instead of being excluded from the main workflows.
- Browse, Swipe, and Map now display video items with playback support and video-aware thumbnails.
- Media details panels now show video-specific metadata such as duration, frame rate, and codec information.
- Opening a video now respects the default OS handler instead of forcing the photo viewer path.

### Tagging And AI Suggestions

- Added manual image tags with autocomplete and reusable tag history.
- Added batch tagging from Browse for multi-selection workflows.
- Added non-destructive XMP sidecar write-back so tags can flow into Lightroom and other XMP-aware tools.
- Added AI tag suggestions powered by EXIF hints, YOLO object detection, and a downloadable CLIP model.
- Added configurable tag packs for photography, wildlife, food, scene, and event suggestions.
- Added Settings controls to download or remove the AI model, enable or disable YOLO object suggestions, and choose which tag packs are active.
- Added tag filters in Browse with comma-separated matching and ANY or ALL mode.

### Better Library Organization

- Added folder and collection favorites.
- Added custom folder and collection colors in the sidebar and context menus.
- Added search and sort controls for both folders and collections.
- Added offline indicators and safer handling for libraries stored on disconnected external devices.
- Added a shared Library Health panel and surfaced it directly inside Settings.

### Browse And Review Workflow Improvements

- Added export of selected items from Browse as original files, JPEG, or PNG, with conversion applied to image files.
- Added move, delete, reveal-in-Explorer, and batch action improvements across Browse.
- Added a keyboard shortcuts overlay and expanded keyboard-driven browsing controls.
- Browse now opens as the default landing page instead of Swipe.

### Settings And App Infrastructure

- Settings now uses a sectioned layout with dedicated areas for review, appearance, AI tagging, library health, data, and updates.
- Added release history to Settings so recent versions can be reviewed in-app.
- Startup now rebuilds stale backend virtual environments more safely and resyncs dependencies when the backend project changes.
- Dev and packaged builds now support dynamic backend port discovery more reliably.

## Fixes

- Fixed intermittent tag loss caused by frontend async race conditions while adding or removing tags.
- Fixed stale tag fetches overwriting newer tag changes in Browse and Swipe.
- Fixed packaged builds missing AI and video runtime pieces by bundling the required assets and dependencies.
- Fixed installer and release packaging docs to match the current build and release pipeline.
