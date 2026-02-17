"""
Worker process entry point.
Run this to start background job workers.

Usage:
    arq src.workers.tasks.WorkerSettings
"""
import logging
from arq import run_worker
from .workers.tasks import WorkerSettings
from .config import Config

# Configure logging for worker
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.StreamHandler(),
    ]
)

logger = logging.getLogger(__name__)

if __name__ == "__main__":
    logger.info("Starting Teek worker...")
    logger.info(f"Redis: {Config().redis_host}:{Config().redis_port}")
    run_worker(WorkerSettings)
