# Sortlens Release Guide

Step-by-step commands to build and publish a new release.

> **Do NOT push source code to GitHub.** The repo is release-only — only installer zips are uploaded via `gh release create`.

---

## Prerequisites

- **Inno Setup 6** — [Download](https://jrsoftware.org/isdl.php)
- **GitHub CLI** — [Download](https://cli.github.com/) (must be logged in: `gh auth login`)
- **Node.js / npm** — for frontend build
- **Python venv** — at `backend/venv` (run `.\start.ps1` once to set up)

---

## Step 1 — Bump Version

Update the version string in these 3 files:

| File                               | Find                           | Replace with |
| ---------------------------------- | ------------------------------ | ------------ |
| `backend/app/core/config.py`       | `VERSION: str = "x.x.x"`       | New version  |
| `backend/pyproject.toml`           | `version = "x.x.x"`            | New version  |
| `installer/sortlens_installer.iss` | `#define MyAppVersion "x.x.x"` | New version  |

---

## Step 2 — Build (Frontend + PyInstaller)

```powershell
.\build.ps1
```

This builds the Vite frontend, copies it to `backend/static`, and runs PyInstaller to create the standalone exe.

---

## Step 3 — Compile Installer (Inno Setup)

```powershell
& "$env:LOCALAPPDATA\Programs\Inno Setup 6\ISCC.exe" .\installer\sortlens_installer.iss
```

Output: `installer/output/SortlensSetup-x.x.x.exe`

---

## Step 4 — Zip the Installer

```powershell
Compress-Archive -Path .\installer\output\SortlensSetup-0.5.0.exe -DestinationPath .\installer\output\SortlensSetup-0.5.0.zip
```

Replace `0.5.0` with your version number.

---

## Step 5 — Create GitHub Release

```powershell
gh release create v0.5.0 .\installer\output\SortlensSetup-0.5.0.zip --repo Topzic/Sortlens --title "Sortlens v0.5.0" --notes "Release notes here"
```

Replace `0.5.0` and the notes with your values.

### Optional flags

| Flag       | Description                                            |
| ---------- | ------------------------------------------------------ |
| `--draft`  | Create as draft (not visible to users until published) |
| `--latest` | Mark as the latest release                             |

---

## Full Example (v0.5.0)

```powershell
# 1. Bump version in the 3 files (manually or via find-replace)

# 2. Build
.\build.ps1

# 3. Compile installer
& "$env:LOCALAPPDATA\Programs\Inno Setup 6\ISCC.exe" .\installer\sortlens_installer.iss

# 4. Zip
Compress-Archive -Path .\installer\output\SortlensSetup-0.5.0.exe -DestinationPath .\installer\output\SortlensSetup-0.5.0.zip

# 5. Publish
gh release create v0.5.0 .\installer\output\SortlensSetup-0.5.0.zip --repo Topzic/Sortlens --title "Sortlens v0.5.0" --notes "What's new in this release"
```

---

## Notes

- The in-app update checker looks for assets matching `SortlensSetup-*.zip`
- Inno Setup output dir is configured in `installer/sortlens_installer.iss` under `[Setup] OutputDir`
- If `.\build.ps1` fails, make sure the venv exists (`backend/venv`) — run `.\start.ps1` first
