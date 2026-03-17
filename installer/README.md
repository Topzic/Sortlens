# Sortlens Installer Build Guide

## Overview

This folder contains an **Inno Setup** script that creates a single-file Windows installer
(`SortlensSetup-x.x.x.exe`) that users can double-click to install Sortlens with all prerequisites.

## What the Installer Does

1. Installs the full Sortlens application to `C:\Users\<user>\AppData\Local\Programs\Sortlens`
2. Automatically installs **Visual C++ Redistributable 2015-2022 (x64)** if missing
3. Automatically installs **Microsoft Edge WebView2 Runtime** if missing
4. Creates Start Menu and Desktop shortcuts
5. Creates a proper uninstaller (Add/Remove Programs)

## One-Time Setup

### 1. Install Inno Setup 6

Download and install from: https://jrsoftware.org/isdl.php

### 2. Download Prerequisites

Create a `prerequisites` folder inside this `installer` folder and download these two files into it:

```
installer/
  prerequisites/
    vc_redist.x64.exe
    MicrosoftEdgeWebview2Setup.exe
  sortlens_installer.iss
  README.md
```

**VC++ Redistributable x64:**

- https://aka.ms/vs/17/release/vc_redist.x64.exe

**WebView2 Evergreen Bootstrapper:**

- https://go.microsoft.com/fwlink/p/?LinkId=2124703
- Save as `MicrosoftEdgeWebview2Setup.exe`

### 3. Build the App First

Run `build.ps1` from the project root to generate the `backend\dist\Sortlens\` folder:

```powershell
.\build.ps1
```

## Building the Installer

### Option A: GUI

1. Open `sortlens_installer.iss` in Inno Setup Compiler
2. Click **Build > Compile** (or press Ctrl+F9)
3. The installer will be created at `installer\output\SortlensSetup-0.3.4.exe`

### Option B: Command Line

```powershell
# From the installer folder:
& "C:\Program Files (x86)\Inno Setup 6\ISCC.exe" sortlens_installer.iss
```

## Full Build Pipeline (build app + create installer)

From the project root:

```powershell
# 1. Build the app
.\build.ps1

# 2. Build the installer
& "C:\Program Files (x86)\Inno Setup 6\ISCC.exe" installer\sortlens_installer.iss
```

The final distributable installer will be at:

```
installer\output\SortlensSetup-0.3.4.exe
```

This single `.exe` file is all you need to give to users.

## Troubleshooting

- **"File not found" errors during compile** — Make sure you ran `build.ps1` first and that `backend\dist\Sortlens\` exists
- **Missing prerequisites** — Download the two files listed above into `installer\prerequisites\`
- **SmartScreen warning** — The installer is unsigned. Users will need to click "More info" > "Run anyway". To remove this, you'd need a code-signing certificate.
