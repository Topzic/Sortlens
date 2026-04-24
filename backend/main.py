"""
Sortlens Backend - Main Application Entry Point
"""

import logging
import sys
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse

from app.api import actions, browse, collections, dupes, health, images, library, map, quality, sessions, settings_api, tags, tasks, version, folders, update
from app.core.config import settings
from app.core.database import close_db, init_db

# Configure logging
logging.basicConfig(
    level=logging.DEBUG if settings.DEBUG else logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger(__name__)

# Silence noisy PIL/Pillow debug logging
logging.getLogger("PIL").setLevel(logging.INFO)
# Silence exifread warnings (e.g. "PNG file does not have exif data")
logging.getLogger("exifread").setLevel(logging.ERROR)

# Resolve static dir (works for both dev and PyInstaller bundle)
if getattr(sys, "frozen", False):
    _BASE_DIR = Path(sys._MEIPASS)
else:
    _BASE_DIR = Path(__file__).resolve().parent

_STATIC_DIR = _BASE_DIR / "static"


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan handler - startup and shutdown."""
    # Startup
    logger.info("Starting Sortlens backend v%s", settings.VERSION)
    await init_db()

    # Background GPS backfill for images scanned before GPS extraction was added
    import asyncio
    asyncio.create_task(_backfill_gps())

    yield
    # Shutdown
    logger.info("Shutting down Sortlens backend")
    await close_db()


async def _backfill_gps():
    """One-time background task: populate GPS for images with NULL coordinates."""
    import asyncio
    from pathlib import Path
    from app.core.database import get_db
    from app.core.image_metadata import _extract_exif_via_exifread

    try:
        db = await get_db()
        cursor = await db.execute(
            "SELECT id, path FROM images WHERE latitude IS NULL AND longitude IS NULL LIMIT 2000"
        )
        rows = await cursor.fetchall()
        if not rows:
            return

        logger.info("GPS backfill: checking %d images...", len(rows))
        updated = 0
        for row in rows:
            fpath = Path(row["path"])
            if not fpath.exists():
                continue
            er = await asyncio.to_thread(_extract_exif_via_exifread, fpath)
            lat, lng = er["latitude"], er["longitude"]
            if lat is not None and lng is not None:
                await db.execute(
                    "UPDATE images SET latitude = ?, longitude = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
                    (lat, lng, row["id"]),
                )
                updated += 1
        if updated:
            await db.commit()
        logger.info("GPS backfill complete: %d/%d images updated", updated, len(rows))
    except Exception:
        logger.exception("GPS backfill failed")


app = FastAPI(
    title="Sortlens API",
    description="Local-first photo management and organization",
    version=settings.VERSION,
    lifespan=lifespan,
)

# Configure CORS for local development
_cors_origins = [
    "http://localhost:5173",
    "http://localhost:5174",
    "http://127.0.0.1:5173",
    "http://127.0.0.1:5174",
]
# Allow the full backend port range so the packaged SPA always works
for _p in range(settings.PORT_RANGE_START, settings.PORT_RANGE_END + 1):
    _cors_origins.append(f"http://127.0.0.1:{_p}")

app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(health.router, tags=["Health"])
app.include_router(version.router, prefix="/api", tags=["Version"])
app.include_router(folders.router, prefix="/api", tags=["Folders"])
app.include_router(sessions.router, prefix="/api", tags=["Sessions"])
app.include_router(images.router, prefix="/api", tags=["Images"])
app.include_router(actions.router, prefix="/api", tags=["Actions"])
app.include_router(quality.router, prefix="/api", tags=["Quality"])
app.include_router(dupes.router, prefix="/api", tags=["Duplicates"])
app.include_router(browse.router, prefix="/api", tags=["Browse"])
app.include_router(map.router, prefix="/api", tags=["Map"])
app.include_router(collections.router, prefix="/api", tags=["Collections"])
app.include_router(settings_api.router, prefix="/api", tags=["Settings"])
app.include_router(tasks.router, prefix="/api", tags=["Tasks"])
app.include_router(library.router, prefix="/api", tags=["Library"])
app.include_router(tags.router, prefix="/api", tags=["Tags"])
app.include_router(update.router, prefix="/api", tags=["Update"])

# Serve built frontend when the static directory exists (packaged mode)
if _STATIC_DIR.is_dir():
    app.mount("/assets", StaticFiles(directory=str(_STATIC_DIR / "assets")), name="static-assets")

    @app.get("/{full_path:path}")
    async def serve_spa(full_path: str):
        """Serve the SPA index.html for all non-API routes."""
        file = _STATIC_DIR / full_path
        if file.is_file():
            return FileResponse(str(file))
        return FileResponse(str(_STATIC_DIR / "index.html"))


if __name__ == "__main__":
    import uvicorn
    import socket

    def _find_free_port():
        """Try ports in the configured range, return the first available one."""
        for port in range(settings.PORT_RANGE_START, settings.PORT_RANGE_END + 1):
            with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
                try:
                    s.bind((settings.HOST, port))
                    return port
                except OSError:
                    logger.info("Port %d is in use, trying next...", port)
        return None

    chosen_port = _find_free_port()
    if chosen_port is None:
        logger.error(
            "No free port found in range %d-%d!",
            settings.PORT_RANGE_START,
            settings.PORT_RANGE_END,
        )
        sys.exit(1)

    if chosen_port != settings.PORT:
        logger.info("Default port %d taken, using port %d", settings.PORT, chosen_port)
    settings.PORT = chosen_port

    # Write chosen port to .port file so the dev frontend can discover it
    _port_file = Path(__file__).resolve().parent / ".port"
    _port_file.write_text(str(chosen_port), encoding="utf-8")

    if getattr(sys, "frozen", False):
        import threading
        import time
        import traceback
        import urllib.request

        # ── Debug log to file ──────────────────────────────────────────
        _log_dir = settings.LOG_DIR
        _log_dir.mkdir(parents=True, exist_ok=True)
        _debug_log = _log_dir / "startup.log"
        _file_handler = logging.FileHandler(str(_debug_log), mode="w", encoding="utf-8")
        _file_handler.setLevel(logging.DEBUG)
        _file_handler.setFormatter(logging.Formatter(
            "%(asctime)s [%(levelname)s] %(name)s: %(message)s",
            datefmt="%Y-%m-%d %H:%M:%S",
        ))
        # Add file handler to root logger AND uvicorn loggers
        logging.getLogger().addHandler(_file_handler)
        for _uv_name in ("uvicorn", "uvicorn.error", "uvicorn.access"):
            logging.getLogger(_uv_name).addHandler(_file_handler)
        # Silence noisy debug loggers in frozen mode
        logging.getLogger("aiosqlite").setLevel(logging.WARNING)
        logging.getLogger("asyncio").setLevel(logging.WARNING)
        logger.info("=== Sortlens startup — log: %s ===", _debug_log)
        logger.info("Frozen exe base: %s", _BASE_DIR)
        logger.info("Static dir exists: %s (%s)", _STATIC_DIR.is_dir(), _STATIC_DIR)
        logger.info("Data dir: %s", settings.DATA_DIR)
        logger.info("Port: %s", settings.PORT)

        # ── Splash screen HTML (shown immediately) ─────────────────────
        _splash_html = """<!DOCTYPE html>
<html><head><meta charset="utf-8">
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body { background:#1e1e1e; color:#d4d4d4; font-family:'Segoe UI',system-ui,sans-serif;
         display:flex; align-items:center; justify-content:center; height:100vh;
         flex-direction:column; }
  .logo { font-size:2.4rem; font-weight:700; color:#0ea5e9; margin-bottom:1.2rem; }
  .status { font-size:1rem; margin-bottom:0.5rem; text-align:center; line-height:1.6; }
  .substatus { font-size:0.8rem; color:#888; margin-bottom:2rem; text-align:center; }
  .spinner { width:40px; height:40px; border:4px solid #333; border-top-color:#0ea5e9;
              border-radius:50%; animation:spin .8s linear infinite; margin-bottom:1.5rem; }
  @keyframes spin { to { transform:rotate(360deg); } }
  .error { color:#f87171; white-space:pre-wrap; font-size:.85rem; max-width:600px;
            background:#2a1515; padding:1rem; border-radius:8px; margin-top:1rem; display:none; }
  .log { color:#888; font-size:.75rem; margin-top:.5rem; }
</style>
<script>
  var msgs = ['Starting server...', 'Initializing database...', 'Loading modules...', 'Almost ready...'];
  var idx = 0;
  setInterval(function(){
    if(idx < msgs.length - 1) { idx++; document.getElementById('status').textContent = msgs[idx]; }
  }, 3000);
  var dots = '';
  setInterval(function(){
    dots = dots.length >= 3 ? '' : dots + '.';
    document.getElementById('substatus').textContent = 'Connecting to backend' + dots;
  }, 500);
</script>
</head><body>
  <div class="logo">Sortlens</div>
  <div class="spinner" id="spinner"></div>
  <div class="status" id="status">Starting server...</div>
  <div class="substatus" id="substatus">Connecting to backend</div>
  <div class="log" id="log"></div>
  <div class="error" id="error"></div>
</body></html>"""

        # ── Start server in background thread ──────────────────────────
        _server_error = None

        def start_server():
            global _server_error
            try:
                import asyncio
                # Windows ProactorEventLoop doesn't work with uvicorn — force Selector
                asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
                logger.info("Starting uvicorn (SelectorEventLoop)...")
                _file_handler.flush()
                uvicorn.run(
                    app,
                    host=settings.HOST,
                    port=settings.PORT,
                    log_level="info",
                    log_config=None,  # Don't reconfigure logging (avoids deadlock)
                )
                logger.info("Uvicorn exited normally")
            except BaseException as exc:
                _server_error = exc
                logger.error("Server crashed: %s", exc)
                logger.error("Traceback:\n%s", traceback.format_exc())
            finally:
                _file_handler.flush()

        server_thread = threading.Thread(target=start_server, daemon=True)
        server_thread.start()
        logger.info("Server thread started (alive=%s)", server_thread.is_alive())
        _file_handler.flush()

        # Give uvicorn a moment, then check if thread is still alive
        time.sleep(3)
        logger.info("After 3s: thread alive=%s, error=%s", server_thread.is_alive(), _server_error)
        _file_handler.flush()

        # ── Open native window with splash screen immediately ──────────
        def _wait_for_server_ready(max_attempts: int = 120) -> bool:
            """Poll the backend health endpoint until it responds or times out."""
            _app_url = f"http://127.0.0.1:{settings.PORT}"
            for i in range(max_attempts):
                try:
                    r = urllib.request.urlopen(f"{_app_url}/health", timeout=1)
                    if r.status == 200:
                        logger.info("Server ready after %d attempts", i + 1)
                        _file_handler.flush()
                        return True
                except Exception:
                    pass
                time.sleep(1)
            logger.error("Server did not respond after %d attempts", max_attempts)
            _file_handler.flush()
            return False

        try:
            import webview
            logger.info("Opening pywebview window with splash screen")

            _window = webview.create_window(
                "Sortlens",
                html=_splash_html,
                width=1400,
                height=900,
                min_size=(900, 600),
            )

            def _wait_and_navigate():
                """Poll health endpoint from Python (avoids CORS), then navigate."""
                _app_url = f"http://127.0.0.1:{settings.PORT}"
                if _wait_for_server_ready():
                    _window.load_url(_app_url)
                    return
                _window.evaluate_js("""
                    document.getElementById('spinner').style.display='none';
                    document.getElementById('status').textContent='Server failed to start';
                    var e=document.getElementById('error');e.style.display='block';
                    e.textContent='The backend did not respond after 120 seconds.';
                """)

            webview.start(_wait_and_navigate)
        except ImportError:
            logger.warning("pywebview not installed, falling back to browser")
            # Wait for server readiness then open browser
            _wait_for_server_ready()
            import webbrowser
            webbrowser.open(f"http://127.0.0.1:{settings.PORT}")
            server_thread.join()
        except Exception as exc:
            logger.error("pywebview error: %s\n%s", exc, traceback.format_exc())
            logger.warning("Falling back to browser after pywebview failure")
            _wait_for_server_ready()
            import webbrowser
            webbrowser.open(f"http://127.0.0.1:{settings.PORT}")
            server_thread.join()
    else:
        uvicorn.run(
            "main:app",
            host=settings.HOST,
            port=settings.PORT,
            reload=settings.DEBUG,
        )
