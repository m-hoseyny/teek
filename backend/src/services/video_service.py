"""
Video service - handles video processing business logic.
"""
from pathlib import Path
from typing import List, Dict, Any, Optional, Callable, Awaitable
import logging
import asyncio

from ..utils.async_helpers import run_in_thread
from ..youtube_utils import (
    download_youtube_video,
    get_youtube_video_title,
    get_youtube_video_id
)
from ..video_utils import (
    get_video_transcript,
    get_cached_formatted_transcript,
    create_clips_with_transitions,
    create_clips_from_segments,
)
from ..ai import get_most_relevant_parts_by_transcript
from ..config import Config

logger = logging.getLogger(__name__)
config = Config()


class VideoService:
    """Service for video processing operations."""

    @staticmethod
    def _is_retryable_zai_error(error_text: Optional[str]) -> bool:
        normalized = (error_text or "").strip().lower()
        if not normalized:
            return False
        retry_markers = (
            "insufficient balance",
            "no resource package",
            "\"code\": \"1113\"",
            "'code': '1113'",
            "code: 1113",
        )
        return any(marker in normalized for marker in retry_markers)

    @staticmethod
    async def download_video_from_url(url: str, progress_callback: Optional[callable] = None) -> Optional[Path]:
        """
        Download a video from a generic URL (non-YouTube).
        Returns the path to the downloaded file.
        """
        import urllib.request
        import urllib.parse
        from pathlib import Path

        logger.info(f"Starting download from URL: {url}")

        try:
            # Parse URL to get filename
            parsed = urllib.parse.urlparse(url)
            filename = Path(parsed.path).name or "video"

            # Ensure filename has an extension
            if not Path(filename).suffix:
                filename = f"{filename}.mp4"

            # Create downloads directory
            downloads_dir = Path(config.temp_dir) / "downloads"
            downloads_dir.mkdir(parents=True, exist_ok=True)

            # Generate unique filename to avoid collisions
            import hashlib
            url_hash = hashlib.sha256(url.encode()).hexdigest()[:12]
            unique_filename = f"{url_hash}_{filename}"
            destination = downloads_dir / unique_filename

            # Check if already downloaded
            if destination.exists():
                logger.info(f"Video already downloaded: {destination}")
                if progress_callback:
                    await progress_callback(
                        10,
                        "Found existing download, skipping download.",
                        {
                            "stage": "download",
                            "stage_progress": 100,
                            "overall_progress": 10,
                            "cached": True,
                        },
                    )
                return destination

            if progress_callback:
                await progress_callback(
                    10,
                    "Downloading video from URL...",
                    {"stage": "download", "stage_progress": 0, "overall_progress": 10},
                )

            # Download with progress tracking
            temp_path = destination.with_suffix(destination.suffix + ".download")

            # Capture event loop before entering thread
            loop = asyncio.get_running_loop()

            def download_with_progress():
                request = urllib.request.Request(
                    url,
                    headers={
                        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
                    },
                )

                with urllib.request.urlopen(request, timeout=120) as response:
                    total_size = response.headers.get("Content-Length")
                    total_size = int(total_size) if total_size else None

                    downloaded = 0
                    chunk_size = 1024 * 1024  # 1MB chunks

                    with temp_path.open("wb") as f:
                        while True:
                            chunk = response.read(chunk_size)
                            if not chunk:
                                break
                            f.write(chunk)
                            downloaded += len(chunk)

                            # Report progress
                            if total_size and progress_callback:
                                percent = int((downloaded / total_size) * 100)
                                # Map to 10-30% overall progress
                                overall = 10 + int((percent / 100) * 20)
                                asyncio.run_coroutine_threadsafe(
                                    progress_callback(
                                        overall,
                                        f"Downloading... {percent}%",
                                        {
                                            "stage": "download",
                                            "stage_progress": percent,
                                            "overall_progress": overall,
                                        },
                                    ),
                                    loop,
                                )

            # Run download in thread pool
            await run_in_thread(download_with_progress)

            # Move temp file to final destination
            import os
            os.replace(temp_path, destination)

            logger.info(f"Video downloaded successfully: {destination}")

            if progress_callback:
                await progress_callback(
                    30,
                    "Download complete",
                    {"stage": "download", "stage_progress": 100, "overall_progress": 30},
                )

            return destination

        except Exception as e:
            logger.error(f"Failed to download video from URL: {e}")
            # Clean up temp file if it exists
            if "temp_path" in locals() and temp_path.exists():
                temp_path.unlink()
            return None

    @staticmethod
    async def download_video(url: str, progress_callback: Optional[callable] = None) -> Optional[Path]:
        """
        Download a YouTube video asynchronously.
        Runs the sync download_youtube_video in a thread pool.
        """
        logger.info(f"Starting video download: {url}")
        loop = asyncio.get_running_loop()

        def on_download_progress(download_percent: int, message: str):
            if not progress_callback:
                return

            # Download stage occupies 10%-30% of overall progress.
            overall_progress = 10 + int((max(0, min(100, download_percent)) / 100) * 20)
            is_cached = "skipping download" in message.lower() or "found existing download" in message.lower()
            asyncio.run_coroutine_threadsafe(
                progress_callback(
                    overall_progress,
                    message,
                    {
                        "stage": "download",
                        "stage_progress": max(0, min(100, download_percent)),
                        "overall_progress": overall_progress,
                        "cached": is_cached,
                    },
                ),
                loop,
            )

        video_path = await run_in_thread(download_youtube_video, url, 3, on_download_progress)

        if not video_path:
            logger.error(f"Failed to download video: {url}")
            return None

        logger.info(f"Video downloaded successfully: {video_path}")
        return video_path

    @staticmethod
    async def get_video_title(url: str) -> str:
        """
        Get video title asynchronously.
        Returns a default title if retrieval fails.
        """
        try:
            title = await run_in_thread(get_youtube_video_title, url)
            return title or "YouTube Video"
        except Exception as e:
            logger.warning(f"Failed to get video title: {e}")
            return "YouTube Video"

    @staticmethod
    async def generate_transcript(
        video_path: Path,
        transcription_provider: str = "local",
        assembly_api_key: Optional[str] = None,
        whisper_chunking_enabled: Optional[bool] = None,
        whisper_chunk_duration_seconds: Optional[int] = None,
        whisper_chunk_overlap_seconds: Optional[int] = None,
    ) -> str:
        """
        Generate transcript from video using configured transcription provider.
        Runs in thread pool to avoid blocking.
        """
        logger.info(f"Generating transcript for: {video_path}")
        transcript = await run_in_thread(
            get_video_transcript,
            str(video_path),
            transcription_provider,
            assembly_api_key,
            whisper_chunking_enabled,
            whisper_chunk_duration_seconds,
            whisper_chunk_overlap_seconds,
        )
        logger.info(f"Transcript generated: {len(transcript)} characters")
        return transcript

    @staticmethod
    async def generate_transcript_with_progress(
        video_path: Path,
        progress_callback: Optional[callable] = None,
        transcription_provider: str = "local",
        assembly_api_key: Optional[str] = None,
        whisper_chunking_enabled: Optional[bool] = None,
        whisper_chunk_duration_seconds: Optional[int] = None,
        whisper_chunk_overlap_seconds: Optional[int] = None,
    ) -> str:
        """
        Generate transcript and emit heartbeat progress while waiting for transcription.
        This prevents the UI from appearing stuck during long transcription calls.
        """
        cached_transcript = await run_in_thread(get_cached_formatted_transcript, str(video_path))
        if cached_transcript:
            logger.info(f"Using cached transcript for: {video_path.name}")
            if progress_callback:
                await progress_callback(
                    50,
                    "Found existing transcript, skipping transcription.",
                    {
                        "stage": "transcript",
                        "stage_progress": 100,
                        "overall_progress": 50,
                        "cached": True,
                        "transcription_provider": transcription_provider,
                    },
                )
            return cached_transcript

        heartbeat_task = None
        stop_heartbeat = asyncio.Event()

        async def heartbeat():
            # Transcript stage maps to overall progress range 30..50.
            overall = 31
            stage_progress = 5
            while not stop_heartbeat.is_set():
                if progress_callback:
                    await progress_callback(
                        min(overall, 49),
                        "Generating transcript...",
                        {
                            "stage": "transcript",
                            "stage_progress": min(stage_progress, 95),
                            "overall_progress": min(overall, 49),
                            "transcription_provider": transcription_provider,
                        },
                    )
                overall += 1
                stage_progress += 5
                try:
                    await asyncio.wait_for(stop_heartbeat.wait(), timeout=4)
                except asyncio.TimeoutError:
                    pass

        try:
            if progress_callback:
                heartbeat_task = asyncio.create_task(heartbeat())
            transcript = await VideoService.generate_transcript(
                video_path,
                transcription_provider=transcription_provider,
                assembly_api_key=assembly_api_key,
                whisper_chunking_enabled=whisper_chunking_enabled,
                whisper_chunk_duration_seconds=whisper_chunk_duration_seconds,
                whisper_chunk_overlap_seconds=whisper_chunk_overlap_seconds,
            )
            return transcript
        finally:
            stop_heartbeat.set()
            if heartbeat_task:
                await heartbeat_task

    @staticmethod
    async def analyze_transcript(
        transcript: str,
        ai_provider: str = "openai",
        ai_api_key: Optional[str] = None,
        ai_model: Optional[str] = None,
    ) -> Any:
        """
        Analyze transcript with AI to find relevant segments.
        This is already async, no need to wrap.
        """
        logger.info("Starting AI analysis of transcript")
        relevant_parts = await get_most_relevant_parts_by_transcript(
            transcript,
            ai_provider=ai_provider,
            ai_api_key=ai_api_key,
            ai_model=ai_model,
        )
        logger.info(f"AI analysis complete: {len(relevant_parts.most_relevant_segments)} segments found")
        return relevant_parts

    @staticmethod
    async def analyze_transcript_with_progress(
        transcript: str,
        ai_provider: str = "openai",
        ai_api_key: Optional[str] = None,
        ai_model: Optional[str] = None,
        progress_callback: Optional[callable] = None,
    ) -> Any:
        """
        Analyze transcript and emit heartbeat progress while waiting for the LLM call.
        This keeps UI progress moving during long AI analysis.
        """
        heartbeat_task = None
        stop_heartbeat = asyncio.Event()

        async def heartbeat():
            # Analysis stage maps to overall progress range 50..70.
            overall = 51
            stage_progress = 5
            while not stop_heartbeat.is_set():
                if progress_callback:
                    await progress_callback(
                        min(overall, 69),
                        f"Analyzing content with AI ({ai_provider})...",
                        {
                            "stage": "analysis",
                            "stage_progress": min(stage_progress, 95),
                            "overall_progress": min(overall, 69),
                            "ai_provider": ai_provider,
                        },
                    )
                overall += 1
                stage_progress += 5
                try:
                    await asyncio.wait_for(stop_heartbeat.wait(), timeout=3)
                except asyncio.TimeoutError:
                    pass

        try:
            if progress_callback:
                heartbeat_task = asyncio.create_task(heartbeat())
            return await VideoService.analyze_transcript(
                transcript,
                ai_provider=ai_provider,
                ai_api_key=ai_api_key,
                ai_model=ai_model,
            )
        finally:
            stop_heartbeat.set()
            if heartbeat_task:
                await heartbeat_task

    @staticmethod
    async def create_video_clips(
        video_path: Path,
        segments: List[Dict[str, Any]],
        font_family: str = "TikTokSans-Regular",
        font_size: int = 24,
        font_color: str = "#FFFFFF",
        subtitle_style: Optional[Dict[str, Any]] = None,
        transitions_enabled: bool = False,
        progress_callback: Optional[callable] = None,
    ) -> Dict[str, Any]:
        """
        Create video clips from segments with subtitles, with optional transitions.
        Runs in thread pool as video processing is CPU-intensive.
        """
        logger.info(
            "Creating %s video clips (transitions_enabled=%s)",
            len(segments),
            transitions_enabled,
        )
        clips_output_dir = Path(config.temp_dir) / "clips"
        clips_output_dir.mkdir(parents=True, exist_ok=True)
        render_diagnostics: Dict[str, Any] = {}
        loop = asyncio.get_running_loop()

        def on_clip_progress(completed: int, total: int) -> None:
            if not progress_callback or total <= 0:
                return
            pct = int((max(0, min(total, completed)) / total) * 100)
            stage_progress = max(0, min(100, pct))
            overall_progress = 70 + int((stage_progress / 100) * 25)  # 70..95
            asyncio.run_coroutine_threadsafe(
                progress_callback(
                    overall_progress,
                    f"Creating video clips... ({completed}/{total})",
                    {
                        "stage": "clips",
                        "stage_progress": stage_progress,
                        "overall_progress": overall_progress,
                    },
                ),
                loop,
            )

        clip_builder = create_clips_with_transitions if transitions_enabled else create_clips_from_segments
        clips_info = await run_in_thread(
            clip_builder,
            video_path,
            segments,
            clips_output_dir,
            font_family,
            font_size,
            font_color,
            subtitle_style,
            render_diagnostics,
            on_clip_progress,
        )
        if not transitions_enabled:
            render_diagnostics["transitions_disabled"] = True

        logger.info(f"Successfully created {len(clips_info)} clips")
        return {"clips": clips_info, "diagnostics": render_diagnostics}

    @staticmethod
    def determine_source_type(url: str) -> str:
        """Determine if source is YouTube, uploaded file, or remote video URL."""
        from ..youtube_utils import get_youtube_video_id

        # Check if it's a YouTube URL
        video_id = get_youtube_video_id(url)
        if video_id:
            return "youtube"

        # Check if it's a local file path (uploaded video)
        if url.startswith("/") or url.startswith("./") or url.startswith("../"):
            return "uploaded_file"

        # Check if it's a Windows-style path
        if len(url) >= 2 and url[1] == ":" and url[0].isalpha():
            return "uploaded_file"

        # Otherwise treat as remote video URL that needs downloading
        return "video_url"

    @staticmethod
    def validate_uploaded_video_path(url: str) -> Path:
        """
        Validate that uploaded video paths stay within the managed uploads directory.
        Prevents processing arbitrary local filesystem paths.
        """
        uploads_dir = (Path(config.temp_dir) / "uploads").resolve()
        candidate_path = Path(url).expanduser()
        resolved_path = candidate_path.resolve()

        # Ensure file exists and is inside uploads directory.
        if not resolved_path.exists() or not resolved_path.is_file():
            raise ValueError("Video file not found")

        try:
            resolved_path.relative_to(uploads_dir)
        except ValueError as exc:
            raise ValueError("Invalid uploaded video path") from exc

        return resolved_path

    @staticmethod
    async def process_video_complete(
        url: str,
        source_type: str,
        font_family: str = "TikTokSans-Regular",
        font_size: int = 24,
        font_color: str = "#FFFFFF",
        subtitle_style: Optional[Dict[str, Any]] = None,
        transitions_enabled: bool = False,
        transcription_provider: str = "local",
        assembly_api_key: Optional[str] = None,
        ai_provider: str = "openai",
        ai_api_key: Optional[str] = None,
        ai_api_key_fallbacks: Optional[List[str]] = None,
        ai_key_labels: Optional[List[str]] = None,
        ai_routing_mode: Optional[str] = None,
        ai_model: Optional[str] = None,
        transcription_options: Optional[Dict[str, Any]] = None,
        progress_callback: Optional[callable] = None,
        cancel_check: Optional[Callable[[], Awaitable[None]]] = None,
    ) -> Dict[str, Any]:
        """
        Complete video processing pipeline.
        Returns dict with segments and clips info.

        progress_callback: Optional function to call with progress updates
                          Signature: async def callback(progress: int, message: str)
        """
        try:
            async def ensure_not_cancelled() -> None:
                if cancel_check:
                    await cancel_check()

            await ensure_not_cancelled()

            # Step 1: Get video path (download or use existing)
            if progress_callback:
                await progress_callback(
                    10,
                    "Downloading video...",
                    {"stage": "download", "stage_progress": 0, "overall_progress": 10}
                )

            if source_type == "youtube":
                video_path = await VideoService.download_video(url, progress_callback=progress_callback)
                if not video_path:
                    raise Exception("Failed to download YouTube video")
            elif source_type == "video_url":
                video_path = await VideoService.download_video_from_url(url, progress_callback=progress_callback)
                if not video_path:
                    raise Exception("Failed to download video from URL")
            else:  # uploaded_file
                video_path = VideoService.validate_uploaded_video_path(url)
            await ensure_not_cancelled()

            # Step 2: Generate transcript
            if progress_callback:
                await progress_callback(
                    30,
                    f"Generating transcript ({transcription_provider})...",
                    {
                        "stage": "transcript",
                        "stage_progress": 0,
                        "overall_progress": 30,
                        "transcription_provider": transcription_provider,
                    }
                )

            transcript = await VideoService.generate_transcript_with_progress(
                video_path,
                progress_callback=progress_callback,
                transcription_provider=transcription_provider,
                assembly_api_key=assembly_api_key,
                whisper_chunking_enabled=(
                    transcription_options.get("whisper_chunking_enabled")
                    if transcription_options
                    else None
                ),
                whisper_chunk_duration_seconds=(
                    transcription_options.get("whisper_chunk_duration_seconds")
                    if transcription_options
                    else None
                ),
                whisper_chunk_overlap_seconds=(
                    transcription_options.get("whisper_chunk_overlap_seconds")
                    if transcription_options
                    else None
                ),
            )
            await ensure_not_cancelled()

            # Step 3: AI analysis
            if progress_callback:
                await progress_callback(
                    50,
                    f"Analyzing content with AI ({ai_provider})...",
                    {
                        "stage": "analysis",
                        "stage_progress": 0,
                        "overall_progress": 50,
                        "ai_provider": ai_provider,
                    }
                )

            key_attempts = [ai_api_key] + list(ai_api_key_fallbacks or [])
            if not key_attempts:
                key_attempts = [None]
            labels = list(ai_key_labels or [])
            while len(labels) < len(key_attempts):
                labels.append(f"attempt-{len(labels) + 1}")

            relevant_parts = None
            attempted_labels: List[str] = []
            for attempt_index, key_candidate in enumerate(key_attempts):
                attempt_label = labels[attempt_index]
                attempted_labels.append(attempt_label)
                relevant_parts = await VideoService.analyze_transcript_with_progress(
                    transcript,
                    ai_provider=ai_provider,
                    ai_api_key=key_candidate,
                    ai_model=ai_model,
                    progress_callback=progress_callback,
                )
                diagnostics = getattr(relevant_parts, "diagnostics", {}) or {}
                error_text = diagnostics.get("error")
                can_retry = (
                    ai_provider == "zai"
                    and attempt_index < (len(key_attempts) - 1)
                    and VideoService._is_retryable_zai_error(error_text)
                )
                if not can_retry:
                    break
                logger.warning(
                    "z.ai analysis attempt %s failed due to balance/package issue; retrying with fallback key",
                    attempt_label,
                )
                if progress_callback:
                    await progress_callback(
                        50,
                        "z.ai key exhausted, retrying with fallback key...",
                        {
                            "stage": "analysis",
                            "stage_progress": 0,
                            "overall_progress": 50,
                            "ai_provider": ai_provider,
                            "ai_key_attempt": attempt_label,
                            "ai_routing_mode": ai_routing_mode,
                        },
                    )

            if relevant_parts is not None:
                diagnostics = getattr(relevant_parts, "diagnostics", {}) or {}
                diagnostics["ai_key_attempts"] = attempted_labels
                diagnostics["ai_key_label"] = attempted_labels[-1] if attempted_labels else "attempt-1"
                if ai_routing_mode:
                    diagnostics["ai_routing_mode"] = ai_routing_mode
                relevant_parts.diagnostics = diagnostics
            await ensure_not_cancelled()

            # Step 4: Create clips
            if progress_callback:
                await progress_callback(
                    70,
                    "Creating video clips...",
                    {"stage": "clips", "stage_progress": 0, "overall_progress": 70}
                )

            segments_json = [
                {
                    "start_time": segment.start_time,
                    "end_time": segment.end_time,
                    "text": segment.text,
                    "relevance_score": segment.relevance_score,
                    "reasoning": segment.reasoning
                }
                for segment in relevant_parts.most_relevant_segments
            ]

            clip_result = await VideoService.create_video_clips(
                video_path,
                segments_json,
                font_family,
                font_size,
                font_color,
                subtitle_style,
                transitions_enabled,
                progress_callback=progress_callback,
            )
            await ensure_not_cancelled()
            clips_info = clip_result.get("clips", [])
            clip_generation_diagnostics = clip_result.get("diagnostics", {})

            if progress_callback:
                await progress_callback(
                    100,
                    "Processing complete!",
                    {"stage": "finalizing", "stage_progress": 100, "overall_progress": 100}
                )

            return {
                "segments": segments_json,
                "clips": clips_info,
                "summary": relevant_parts.summary if relevant_parts else None,
                "key_topics": relevant_parts.key_topics if relevant_parts else None,
                "analysis_diagnostics": relevant_parts.diagnostics if relevant_parts else None,
                "clip_generation_diagnostics": clip_generation_diagnostics,
            }

        except Exception as e:
            logger.error(f"Error in video processing pipeline: {e}")
            raise
