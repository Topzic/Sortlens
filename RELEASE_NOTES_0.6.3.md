# Sortlens v0.6.3

## Hotfix

- Fixed the packaged app failing to open after the in-app update to v0.6.2.
- Added `pywebview` as an explicit backend dependency so the packaged desktop window includes the correct native webview API.
- Added a startup fallback so if the native window layer fails, Sortlens opens in the browser instead of exiting.

## Context

- The backend itself was starting successfully in v0.6.2, but the packaged app crashed when creating the desktop window.
- External-device, tagging, AI suggestions, and offline-folder updates from v0.6.2 are unchanged in this hotfix.
