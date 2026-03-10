from dotenv import load_dotenv
import os

load_dotenv()

class Config:
    def __init__(self):
        def env_bool(name: str, default: str = "false") -> bool:
            return (os.getenv(name, default) or default).strip().lower() in {"1", "true", "yes", "on"}

        # Backward compatible env handling:
        # - prefer the documented vars (LLM, WHISPER_MODEL_SIZE)
        # - still accept legacy names used in older revisions
        self.whisper_model = os.getenv("WHISPER_MODEL_SIZE") or os.getenv("WHISPER_MODEL", "medium")
        self.whisper_device = (os.getenv("WHISPER_DEVICE", "auto") or "auto").strip().lower()
        self.whisper_chunking_enabled = env_bool("WHISPER_CHUNKING_ENABLED", "true")
        self.whisper_chunk_duration_seconds = int(os.getenv("WHISPER_CHUNK_DURATION_SECONDS", "1200"))
        self.whisper_chunk_overlap_seconds = int(os.getenv("WHISPER_CHUNK_OVERLAP_SECONDS", "8"))
        self.transcription_provider = (os.getenv("TRANSCRIPTION_PROVIDER", "assemblyai") or "assemblyai").strip().lower()
        self.llm = os.getenv("LLM") or os.getenv("LLM_MODEL") or "openai:gpt-5-mini"
        self.openai_api_key = os.getenv("OPENAI_API_KEY")
        self.anthropic_api_key = os.getenv("ANTHROPIC_API_KEY")
        self.google_api_key = os.getenv("GOOGLE_API_KEY")
        self.zai_api_key = os.getenv("ZAI_API_KEY")
        self.assembly_ai_api_key = os.getenv("ASSEMBLY_AI_API_KEY")
        self.admin_api_key = os.getenv("ADMIN_API_KEY")
        self.secret_encryption_key = os.getenv("SECRET_ENCRYPTION_KEY")
        self.jwt_secret_key = os.getenv("JWT_SECRET_KEY", "")
        self.jwt_expire_minutes = int(os.getenv("JWT_EXPIRE_MINUTES", "60"))

        self.max_video_duration = int(os.getenv("MAX_VIDEO_DURATION", "3600"))
        self.output_dir = os.getenv("OUTPUT_DIR", "outputs")

        self.max_clips = int(os.getenv("MAX_CLIPS", "10"))
        self.clip_duration = int(os.getenv("CLIP_DURATION", "30"))  # seconds

        self.temp_dir = os.getenv("TEMP_DIR", "temp")

        # Redis configuration
        self.redis_host = os.getenv("REDIS_HOST", "localhost")
        self.redis_port = int(os.getenv("REDIS_PORT", "6379"))
        self.worker_max_jobs = int(os.getenv("WORKER_MAX_JOBS", "2"))
        self.worker_job_timeout_seconds = int(os.getenv("WORKER_JOB_TIMEOUT_SECONDS", "21600"))
        self.arq_queue_name = (os.getenv("ARQ_QUEUE_NAME", "arq:queue:local") or "arq:queue:local").strip()
        self.arq_local_queue_name = (os.getenv("ARQ_QUEUE_NAME_LOCAL", "arq:queue:local") or "arq:queue:local").strip()
        self.arq_assembly_queue_name = (os.getenv("ARQ_QUEUE_NAME_ASSEMBLY", "arq:queue:assembly") or "arq:queue:assembly").strip()

        backend_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        self.mediapipe_face_model_path = (
            os.getenv("MEDIAPIPE_FACE_MODEL_PATH")
            or os.path.join(backend_root, "models", "blaze_face_short_range.tflite")
        )
        self.mediapipe_face_model_url = (
            os.getenv("MEDIAPIPE_FACE_MODEL_URL")
            or "https://storage.googleapis.com/mediapipe-models/face_detector/"
               "blaze_face_short_range/float16/1/blaze_face_short_range.tflite"
        )
        self.mediapipe_face_model_sha256 = (
            os.getenv("MEDIAPIPE_FACE_MODEL_SHA256")
            or "b4578f35940bf5a1a655214a1cce5cab13eba73c1297cd78e1a04c2380b0152f"
        ).strip().lower()
        self.mediapipe_face_model_auto_download = (
            os.getenv("MEDIAPIPE_FACE_MODEL_AUTO_DOWNLOAD", "true") or "true"
        ).strip().lower() in {"1", "true", "yes", "on"}

        # Subscription plans configuration
        # Minutes are stored as integers (e.g., 600 = 10 hours)
        self.plans = {
            "free": {
                "name": "Free",
                "price_monthly": 0,
                "transcription_minutes": 0,
                "clip_generations": 5,
                "watermark": True,
                "custom_font": False,
                "custom_size": False,
            },
            "starter": {
                "name": "Starter",
                "price_monthly": 5,
                "transcription_minutes": 600,  # 10 hours
                "clip_generations": 50,
                "watermark": False,
                "custom_font": True,
                "custom_size": True,
            },
            "pro": {
                "name": "Pro",
                "price_monthly": 15,
                "transcription_minutes": 3000,  # 50 hours
                "clip_generations": 150,
                "watermark": False,
                "custom_font": True,
                "custom_size": True,
            },
            "business": {
                "name": "Business",
                "price_monthly": None,  # Contact us
                "transcription_minutes": None,  # Unlimited
                "clip_generations": None,  # Unlimited
                "watermark": False,
                "custom_font": True,
                "custom_size": True,
            },
        }
