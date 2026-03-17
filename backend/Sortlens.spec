# -*- mode: python ; coding: utf-8 -*-


a = Analysis(
    ['main.py'],
    pathex=[],
    binaries=[('C:\\Users\\Ian_C\\anaconda3\\Library\\bin\\libssl-3-x64.dll', '.'), ('C:\\Users\\Ian_C\\anaconda3\\Library\\bin\\libcrypto-3-x64.dll', '.'), ('C:\\Users\\Ian_C\\anaconda3\\Library\\bin\\liblzma.dll', '.'), ('C:\\Users\\Ian_C\\anaconda3\\Library\\bin\\libbz2.dll', '.'), ('C:\\Users\\Ian_C\\anaconda3\\Library\\bin\\libexpat.dll', '.'), ('C:\\Users\\Ian_C\\anaconda3\\Library\\bin\\ffi.dll', '.'), ('C:\\Users\\Ian_C\\anaconda3\\Library\\bin\\sqlite3.dll', '.')],
    datas=[('static', 'static'), ('app', 'app')],
    hiddenimports=['uvicorn.logging', 'uvicorn.lifespan', 'uvicorn.lifespan.on', 'uvicorn.lifespan.off', 'uvicorn.protocols', 'uvicorn.protocols.http', 'uvicorn.protocols.http.auto', 'uvicorn.protocols.http.h11_impl', 'uvicorn.protocols.http.httptools_impl', 'uvicorn.protocols.websockets', 'uvicorn.protocols.websockets.auto', 'uvicorn.protocols.websockets.wsproto_impl', 'uvicorn.protocols.websockets.websockets_impl', 'rawpy', 'aiosqlite', 'PIL', 'numpy', 'imagehash', 'webview'],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    noarchive=False,
    optimize=0,
)
pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name='Sortlens',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    console=False,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
    icon=['C:\\Users\\Ian_C\\Desktop\\ImageVerse\\backend\\sortlens.ico'],
)
coll = COLLECT(
    exe,
    a.binaries,
    a.datas,
    strip=False,
    upx=True,
    upx_exclude=[],
    name='Sortlens',
)
