"""
AI-related functions for transcript analysis with enhanced precision.
"""

from pathlib import Path
from typing import List, Dict, Any, Optional, Tuple
import asyncio
import logging
import re

from pydantic_ai import Agent
from pydantic import BaseModel, Field

from .config import Config
from .repositories.prompt_repository import PromptRepository

logger = logging.getLogger(__name__)
config = Config()
SUPPORTED_AI_PROVIDERS = {"openai", "google", "anthropic", "zai"}
DEFAULT_AI_MODELS = {
    "openai": "gpt-5-mini",
    "google": "gemini-2.5-pro",
    "anthropic": "claude-4-sonnet",
    "zai": "glm-5",
}
ZAI_OPENAI_BASE_URL = "https://api.z.ai/api/coding/paas/v4"

class TranscriptSegment(BaseModel):
    """Represents a relevant segment of transcript with precise timing."""
    start_time: str = Field(description="Start timestamp in MM:SS format")
    end_time: str = Field(description="End timestamp in MM:SS format")
    text: str = Field(description="The transcript text for this segment")
    relevance_score: float = Field(description="Relevance score from 0.0 to 1.0", ge=0.0, le=1.0)
    reasoning: str = Field(description="Explanation for why this segment is relevant")

class TranscriptAnalysis(BaseModel):
    """Analysis result for transcript segments."""
    most_relevant_segments: List[TranscriptSegment]
    summary: str = Field(description="Brief summary of the video content")
    key_topics: List[str] = Field(description="List of main topics discussed")
    diagnostics: Dict[str, Any] = Field(default_factory=dict, description="Internal analysis diagnostics")

# Simplified system prompt that trusts transcript timing
simplified_system_prompt = """You are an expert at analyzing video transcripts to find the most engaging segments for short-form content creation.

CORE OBJECTIVES:
1. Identify segments that would be compelling on social media platforms
2. Focus on complete thoughts, insights, or entertaining moments
3. Prioritize content with hooks, emotional moments, or valuable information
4. Each segment should be engaging and worth watching

SEGMENT SELECTION CRITERIA:
1. STRONG HOOKS: Attention-grabbing opening lines
2. VALUABLE CONTENT: Tips, insights, interesting facts, stories
3. EMOTIONAL MOMENTS: Excitement, surprise, humor, inspiration
4. COMPLETE THOUGHTS: Self-contained ideas that make sense alone
5. ENTERTAINING: Content people would want to share

TIMING GUIDELINES:
- Segments MUST be between 10-45 seconds for optimal engagement
- CRITICAL: start_time MUST be different from end_time (minimum 10 seconds apart)
- Focus on natural content boundaries rather than arbitrary time limits
- Include enough context for the segment to be understandable

TIMESTAMP REQUIREMENTS - EXTREMELY IMPORTANT:
- Use EXACT timestamps as they appear in the transcript
- Never modify timestamp format (keep MM:SS structure)
- start_time MUST be LESS THAN end_time (start_time < end_time)
- MINIMUM segment duration: 10 seconds (end_time - start_time >= 10 seconds)
- Look at transcript ranges like [02:25 - 02:35] and use different start/end times
- NEVER use the same timestamp for both start_time and end_time
- Example: start_time: "02:25", end_time: "02:35" (NOT "02:25" and "02:25")

Find 3-7 compelling segments that would work well as standalone clips. Quality over quantity - choose segments that would genuinely engage viewers and have proper time ranges."""

def _parse_llm(value: str) -> Tuple[Optional[str], Optional[str]]:
    if ":" not in value:
        return None, value.strip() or None
    provider, model_name = value.split(":", 1)
    provider = provider.strip().lower()
    model_name = model_name.strip()
    return provider or None, model_name or None


def _default_ai_provider() -> str:
    configured_provider, _ = _parse_llm(config.llm or "")
    if configured_provider in SUPPORTED_AI_PROVIDERS:
        return configured_provider
    return "openai"


def _resolve_ai_model(ai_provider: str, requested_model: Optional[str]) -> str:
    if requested_model and requested_model.strip():
        return requested_model.strip()
    configured_provider, configured_model = _parse_llm(config.llm or "")
    if configured_provider == ai_provider and configured_model:
        return configured_model
    return DEFAULT_AI_MODELS[ai_provider]


def _build_transcript_agent(
    ai_provider: Optional[str] = None,
    ai_api_key: Optional[str] = None,
    ai_model: Optional[str] = None,
    prompt_id: Optional[str] = None,
) -> tuple[Agent, str, str]:
    selected_provider = (ai_provider or _default_ai_provider()).strip().lower()
    if selected_provider not in SUPPORTED_AI_PROVIDERS:
        selected_provider = _default_ai_provider()

    selected_model = _resolve_ai_model(selected_provider, ai_model)
    resolved_key = (ai_api_key or "").strip()

    # Get system prompt from repository based on prompt_id
    system_prompt = PromptRepository.get_system_prompt(prompt_id)

    if selected_provider == "openai":
        from pydantic_ai.models.openai import OpenAIModel
        from pydantic_ai.providers.openai import OpenAIProvider

        resolved_key = resolved_key or str(config.openai_api_key or "").strip()
        if not resolved_key:
            raise ValueError("OpenAI provider selected but no API key is configured")
        provider = OpenAIProvider(api_key=resolved_key)
        model = OpenAIModel(selected_model, provider=provider)
    elif selected_provider == "zai":
        from pydantic_ai.models.openai import OpenAIModel
        from pydantic_ai.providers.openai import OpenAIProvider

        resolved_key = resolved_key or str(config.zai_api_key or "").strip()
        if not resolved_key:
            raise ValueError("z.ai provider selected but no API key is configured")
        provider = OpenAIProvider(api_key=resolved_key, base_url=ZAI_OPENAI_BASE_URL)
        model = OpenAIModel(selected_model, provider=provider)
    elif selected_provider == "google":
        from pydantic_ai.models.google import GoogleModel
        from pydantic_ai.providers.google_gla import GoogleGLAProvider

        resolved_key = resolved_key or str(config.google_api_key or "").strip()
        if not resolved_key:
            raise ValueError("Google provider selected but no API key is configured")
        provider = GoogleGLAProvider(api_key=resolved_key)
        model = GoogleModel(selected_model, provider=provider)
    else:
        from pydantic_ai.models.anthropic import AnthropicModel
        from pydantic_ai.providers.anthropic import AnthropicProvider

        resolved_key = resolved_key or str(config.anthropic_api_key or "").strip()
        if not resolved_key:
            raise ValueError("Anthropic provider selected but no API key is configured")
        provider = AnthropicProvider(api_key=resolved_key)
        model = AnthropicModel(selected_model, provider=provider)

    return (
        Agent(
            model=model,
            output_type=TranscriptAnalysis,
            system_prompt=system_prompt,
        ),
        selected_provider,
        selected_model,
    )

async def get_most_relevant_parts_by_transcript(
    transcript: str,
    ai_provider: Optional[str] = None,
    ai_api_key: Optional[str] = None,
    ai_model: Optional[str] = None,
    prompt_id: Optional[str] = None,
) -> TranscriptAnalysis:
    """Get the most relevant parts of a transcript for creating clips - simplified version."""
    transcript_agent, resolved_provider, resolved_model = _build_transcript_agent(
        ai_provider=ai_provider,
        ai_api_key=ai_api_key,
        ai_model=ai_model,
        prompt_id=prompt_id,
    )
    logger.info(
        "Starting AI analysis of transcript (%s chars) using provider=%s model=%s prompt=%s",
        len(transcript),
        resolved_provider,
        resolved_model,
        prompt_id or "default",
    )

    try:
        result = await transcript_agent.run(
            f"""Analyze this video transcript and identify the most engaging segments for short-form content.

Find segments that would be compelling as standalone clips for social media.

Transcript:
{transcript}"""
        )

        analysis = getattr(result, "data", None) or getattr(result, "output", None)
        if analysis is None:
            raise RuntimeError("AI result did not contain parsed output (expected .data or .output)")
        logger.info(f"AI analysis found {len(analysis.most_relevant_segments)} segments")

        # Simple validation - just ensure segments have content
        validated_segments = []
        rejected_counts = {
            "insufficient_text": 0,
            "identical_timestamps": 0,
            "invalid_duration": 0,
            "too_short": 0,
            "invalid_timestamp_format": 0,
        }
        for segment in analysis.most_relevant_segments:
            # Validate text content
            if not segment.text.strip() or len(segment.text.split()) < 3:  # At least 3 words
                logger.warning(f"Skipping segment with insufficient content: '{segment.text[:50]}...'")
                rejected_counts["insufficient_text"] += 1
                continue

            # Validate timestamps - CRITICAL: start and end must be different
            if segment.start_time == segment.end_time:
                logger.warning(f"Skipping segment with identical start/end times: {segment.start_time}")
                rejected_counts["identical_timestamps"] += 1
                continue

            # Parse timestamps to validate duration
            try:
                start_parts = segment.start_time.split(':')
                end_parts = segment.end_time.split(':')

                start_seconds = int(start_parts[0]) * 60 + int(start_parts[1])
                end_seconds = int(end_parts[0]) * 60 + int(end_parts[1])

                duration = end_seconds - start_seconds

                if duration <= 0:
                    logger.warning(f"Skipping segment with invalid duration: {segment.start_time} to {segment.end_time} = {duration}s")
                    rejected_counts["invalid_duration"] += 1
                    continue

                if duration < 5:  # Minimum 5 seconds
                    logger.warning(f"Skipping segment too short: {duration}s (min 5s required)")
                    rejected_counts["too_short"] += 1
                    continue

                validated_segments.append(segment)
                logger.info(f"Validated segment: {segment.start_time}-{segment.end_time} ({duration}s)")

            except (ValueError, IndexError) as e:
                logger.warning(f"Skipping segment with invalid timestamp format: {segment.start_time}-{segment.end_time}: {e}")
                rejected_counts["invalid_timestamp_format"] += 1
                continue

        # Sort by relevance
        validated_segments.sort(key=lambda x: x.relevance_score, reverse=True)

        final_analysis = TranscriptAnalysis(
            most_relevant_segments=validated_segments,
            summary=analysis.summary,
            key_topics=analysis.key_topics,
            diagnostics={
                "raw_segments": len(analysis.most_relevant_segments),
                "validated_segments": len(validated_segments),
                "rejected_counts": rejected_counts,
            },
        )

        logger.info(f"Selected {len(validated_segments)} segments for processing")
        if validated_segments:
            logger.info(f"Top segment score: {validated_segments[0].relevance_score:.2f}")

        return final_analysis

    except Exception as e:
        logger.error(f"Error in transcript analysis: {e}")
        return TranscriptAnalysis(
            most_relevant_segments=[],
            summary=f"Analysis failed: {str(e)}",
            key_topics=[],
            diagnostics={
                "error": str(e),
                "error_type": type(e).__name__,
            },
        )

def get_most_relevant_parts_sync(
    transcript: str,
    ai_provider: Optional[str] = None,
    ai_api_key: Optional[str] = None,
    ai_model: Optional[str] = None,
    prompt_id: Optional[str] = None,
) -> TranscriptAnalysis:
    """Synchronous wrapper for the async function."""
    return asyncio.run(get_most_relevant_parts_by_transcript(
        transcript,
        ai_provider=ai_provider,
        ai_api_key=ai_api_key,
        ai_model=ai_model,
        prompt_id=prompt_id,
    ))
