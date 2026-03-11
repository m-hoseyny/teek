"""
Refactored FastAPI application with proper layered architecture.

This is the new main entry point with:
- Separated concerns (routes, services, repositories, workers)
- Async job queue with arq
- Real-time progress updates via SSE
- Thread pool for blocking operations
"""
from contextlib import asynccontextmanager
from pathlib import Path
import logging

from fastapi import FastAPI, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from sqlalchemy.ext.asyncio import AsyncSession

from .config import Config
from .database import init_db, close_db, get_db
from .workers.job_queue import JobQueue
from .api.routes import tasks
from .api.routes import settings
from .api.routes import subscriptions
from .api.routes import tasks_clips
from .api.routes import tasks_transcripts
from .api.routes import auth as auth_routes

# Ensure the log directory exists before configuring file logging.
log_dir = Path("logs")
log_dir.mkdir(parents=True, exist_ok=True)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.StreamHandler(),
        logging.FileHandler(log_dir / "backend.log")
    ]
)

logger = logging.getLogger(__name__)
config = Config()


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan: startup and shutdown events."""
    # Startup
    logger.info("🚀 Starting Teek API...")
    try:
        await init_db()
        logger.info("✅ Database initialized")

        # Initialize job queue
        await JobQueue.get_pool()
        logger.info("✅ Job queue initialized")

        yield

    finally:
        # Shutdown
        logger.info("🛑 Shutting down Teek API...")
        await close_db()
        await JobQueue.close_pool()
        logger.info("✅ Cleanup complete")


# Create FastAPI app
app = FastAPI(
    title="Teek API",
    description="Refactored Python backend for Teek with async job processing",
    version="0.2.0",
    lifespan=lifespan,
    redirect_slashes=False,
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount static files for serving clips
clips_dir = Path(config.temp_dir) / "clips"
clips_dir.mkdir(parents=True, exist_ok=True)
app.mount("/clips", StaticFiles(directory=str(clips_dir)), name="clips")

# Include routers - auth first, then settings (to avoid shadowing by tasks/{task_id} catch-all)
app.include_router(auth_routes.router)
app.include_router(settings.router)
app.include_router(tasks.router)
app.include_router(subscriptions.router)
app.include_router(tasks_clips.router)
app.include_router(tasks_transcripts.router)

# Keep existing utility endpoints
from .api.routes.media import router as media_router
app.include_router(media_router)


@app.get("/")
def read_root():
    """Root endpoint."""
    return {
        "name": "Teek API",
        "version": "0.2.0",
        "status": "running",
        "docs": "/docs",
        "architecture": "refactored with job queue"
    }


@app.get("/health")
async def health_check():
    """Basic health check."""
    return {"status": "healthy"}


@app.get("/health/db")
async def check_database_health(db: AsyncSession = Depends(get_db)):
    """Check database connectivity."""
    from sqlalchemy import text
    try:
        await db.execute(text("SELECT 1"))
        return {"status": "healthy", "database": "connected"}
    except Exception as e:
        return {"status": "unhealthy", "database": "disconnected", "error": str(e)}


@app.get("/health/redis")
async def check_redis_health():
    """Check Redis connectivity."""
    try:
        pool = await JobQueue.get_pool()
        await pool.ping()
        return {"status": "healthy", "redis": "connected"}
    except Exception as e:
        return {"status": "unhealthy", "redis": "disconnected", "error": str(e)}
