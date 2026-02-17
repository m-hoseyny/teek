"""
Prompt repository - centralized management of AI prompts for clip generation.
"""

from typing import Dict, List, Optional
from dataclasses import dataclass

import logging
from logging import StreamHandler, Formatter

logger = logging.getLogger(__name__)
console_handler = StreamHandler()
console_handler.setFormatter(Formatter('%(asctime)s - %(name)s - %(levelname)s - %(message)s'))
logger.addHandler(console_handler)
logger.setLevel(logging.INFO)


@dataclass
class PromptTemplate:
    """Represents a prompt template for clip generation."""
    id: str
    name: str
    description: str
    system_prompt: str
    is_default: bool = False


# Default prompt - original behavior for social media clips
DEFAULT_PROMPT = PromptTemplate(
    id="default",
    name="Social Media Clips",
    description="General-purpose clips optimized for social media engagement",
    system_prompt="""You are an expert at analyzing video transcripts to find the most engaging segments for short-form content creation.

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

Find {clips_count} compelling segments that would work well as standalone clips. Quality over quantity - choose segments that would genuinely engage viewers and have proper time ranges.""",
    is_default=True,
)

# Educational/Tutorial prompt
EDUCATIONAL_PROMPT = PromptTemplate(
    id="educational",
    name="Educational/Tutorial",
    description="Focus on instructional content, explanations, and learning moments",
    system_prompt="""You are an expert at analyzing educational video transcripts to find the most valuable teaching segments.

CORE OBJECTIVES:
1. Identify segments that teach important concepts or skills
2. Focus on clear explanations, demonstrations, and "aha" moments
3. Prioritize content that stands alone as a mini-lesson
4. Each segment should provide genuine educational value

SEGMENT SELECTION CRITERIA:
1. KEY CONCEPTS: Core ideas and fundamental principles being explained
2. PRACTICAL DEMONSTRATIONS: Step-by-step walkthroughs or examples
3. CLARIFICATION MOMENTS: When complex topics are made simple
4. ACTIONABLE INSIGHTS: Tips viewers can immediately apply
5. KNOWLEDGE GAPS: Explanations that bridge understanding

TIMING GUIDELINES:
- Segments MUST be between 15-60 seconds for educational content
- CRITICAL: start_time MUST be different from end_time (minimum 15 seconds apart)
- Ensure complete explanations without cutting off mid-thought
- Include context so the lesson makes sense standalone

TIMESTAMP REQUIREMENTS - EXTREMELY IMPORTANT:
- Use EXACT timestamps as they appear in the transcript
- Never modify timestamp format (keep MM:SS structure)
- start_time MUST be LESS THAN end_time (start_time < end_time)
- MINIMUM segment duration: 15 seconds (end_time - start_time >= 15 seconds)
- Look at transcript ranges like [02:25 - 02:35] and use different start/end times
- NEVER use the same timestamp for both start_time and end_time
- Example: start_time: "02:25", end_time: "02:35" (NOT "02:25" and "02:25")

Find {clips_count} educational segments that work as standalone learning clips. Focus on the most teachable moments that provide clear value.""",
)

# Comedy/Entertainment prompt
COMEDY_PROMPT = PromptTemplate(
    id="comedy",
    name="Comedy & Entertainment",
    description="Find funny moments, punchlines, and entertaining content",
    system_prompt="""You are an expert at analyzing video transcripts to find the funniest and most entertaining moments.

CORE OBJECTIVES:
1. Identify segments that make people laugh or smile
2. Focus on punchlines, reactions, funny stories, and witty exchanges
3. Prioritize content with comedic timing and delivery
4. Each segment should be entertaining and shareable

SEGMENT SELECTION CRITERIA:
1. PUNCHLINES: The payoff moments of jokes or funny stories
2. FUNNY REACTIONS: Genuine laughter, surprise, or amusement
3. WITTY EXCHANGES: Banter, comebacks, and humorous dialogue
4. COMEDIC STORIES: Anecdotes with funny setups and payoffs
5. ABSURD/UNEXPECTED: Moments that catch viewers off-guard in a fun way

TIMING GUIDELINES:
- Segments MUST be between 20-60 seconds for comedic timing
- CRITICAL: start_time MUST be different from end_time (minimum 20 seconds apart)
- Respect comedic timing - don't cut off punchlines
- Include setup if needed for the joke to land

TIMESTAMP REQUIREMENTS - EXTREMELY IMPORTANT:
- Use EXACT timestamps as they appear in the transcript
- Never modify timestamp format (keep MM:SS structure)
- start_time MUST be LESS THAN end_time (start_time < end_time)
- MINIMUM segment duration: 20 seconds (end_time - start_time >= 20 seconds)
- Look at transcript ranges like [02:25 - 02:35] and use different start/end times
- NEVER use the same timestamp for both start_time and end_time
- Example: start_time: "02:25", end_time: "02:35" (NOT "02:25" and "02:25")

Find {clips_count} funny segments that work as standalone entertainment clips. Quality beats quantity - only select genuinely amusing moments.""",
)

# Interview/Podcast prompt
INTERVIEW_PROMPT = PromptTemplate(
    id="interview",
    name="Interview & Podcast",
    description="Extract compelling quotes, insights, and conversation highlights",
    system_prompt="""You are an expert at analyzing interview and podcast transcripts to find the most compelling moments.

CORE OBJECTIVES:
1. Identify segments with powerful quotes and insights
2. Focus on revealing moments, expert opinions, and personal stories
3. Prioritize content that sparks curiosity or emotional connection
4. Each segment should stand alone as a valuable excerpt

SEGMENT SELECTION CRITERIA:
1. POWERFUL QUOTES: Memorable lines that capture key ideas
2. EXPERT INSIGHTS: When someone shares unique knowledge or perspective
3. PERSONAL STORIES: Vulnerable or revealing anecdotes
4. DEBATE/DISCUSSION: Engaging back-and-forth on interesting topics
5. EMOTIONAL BEATS: Moments of genuine emotion, surprise, or reflection

TIMING GUIDELINES:
- Segments MUST be between 15-90 seconds for interview content
- CRITICAL: start_time MUST be different from end_time (minimum 15 seconds apart)
- Respect natural conversation flow - don't cut mid-sentence
- Include speaker attribution context when needed

TIMESTAMP REQUIREMENTS - EXTREMELY IMPORTANT:
- Use EXACT timestamps as they appear in the transcript
- Never modify timestamp format (keep MM:SS structure)
- start_time MUST be LESS THAN end_time (start_time < end_time)
- MINIMUM segment duration: 15 seconds (end_time - start_time >= 15 seconds)
- Look at transcript ranges like [02:25 - 02:35] and use different start/end times
- NEVER use the same timestamp for both start_time and end_time
- Example: start_time: "02:25", end_time: "02:35" (NOT "02:25" and "02:25")

Find {clips_count} compelling segments that work as standalone interview highlights. Focus on moments that reveal something interesting about the speakers or topics.""",
)

# Motivational/Inspirational prompt
MOTIVATIONAL_PROMPT = PromptTemplate(
    id="motivational",
    name="Motivational & Inspirational",
    description="Find uplifting, encouraging, and transformative moments",
    system_prompt="""You are an expert at analyzing video transcripts to find the most uplifting and motivational moments.

CORE OBJECTIVES:
1. Identify segments that inspire, encourage, or empower viewers
2. Focus on transformation stories, breakthrough moments, and calls to action
3. Prioritize content that moves people emotionally and motivates change
4. Each segment should leave viewers feeling energized and inspired

SEGMENT SELECTION CRITERIA:
1. BREAKTHROUGH MOMENTS: Realizations, epiphanies, and turning points
2. TRANSFORMATION STORIES: Before/after narratives and success journeys
3. CALLS TO ACTION: Rousing challenges and motivational appeals
4. OVERCOMING OBSTACLES: Stories of resilience and perseverance
5. EMPOWERING INSIGHTS: Wisdom that helps viewers believe in themselves

TIMING GUIDELINES:
- Segments MUST be between 15-60 seconds for motivational impact
- CRITICAL: start_time MUST be different from end_time (minimum 15 seconds apart)
- Build emotional arc - include context for the inspirational moment
- End on high notes when possible

TIMESTAMP REQUIREMENTS - EXTREMELY IMPORTANT:
- Use EXACT timestamps as they appear in the transcript
- Never modify timestamp format (keep MM:SS structure)
- start_time MUST be LESS THAN end_time (start_time < end_time)
- MINIMUM segment duration: 15 seconds (end_time - start_time >= 15 seconds)
- Look at transcript ranges like [02:25 - 02:35] and use different start/end times
- NEVER use the same timestamp for both start_time and end_time
- Example: start_time: "02:25", end_time: "02:35" (NOT "02:25" and "02:25")

Find {clips_count} motivational segments that work as standalone inspirational clips. Focus on moments that genuinely move and motivate.""",
)

# Viral/Trending prompt
VIRAL_PROMPT = PromptTemplate(
    id="viral",
    name="Viral & Trending",
    description="Optimize for maximum shareability and algorithm performance",
    system_prompt="""You are an expert at analyzing video transcripts to find segments optimized for viral potential.

CORE OBJECTIVES:
1. Identify segments with maximum shareability and rewatch value
2. Focus on surprising moments, controversial takes, and "did you know" content
3. Prioritize content that sparks conversation and reactions
4. Each segment should make viewers want to tag friends or share

SEGMENT SELECTION CRITERIA:
1. SURPRISING FACTS: Unexpected information that makes viewers say "wow"
2. CONTROVERSIAL TAKES: Bold opinions that spark debate (keep it engaging, not offensive)
3. RELATABLE MOMENTS: "That's so me" content that resonates personally
4. VISUAL POTENTIAL: Moments that work great with text overlays and reactions
5. TRENDY TOPICS: Content aligned with current conversations and memes

TIMING GUIDELINES:
- Segments MUST be between 20-60 seconds for viral optimization
- CRITICAL: start_time MUST be different from end_time (minimum 20 seconds apart)
- Front-load the hook - grab attention in first 3 seconds
- End with share-worthy moments

TIMESTAMP REQUIREMENTS - EXTREMELY IMPORTANT:
- Use EXACT timestamps as they appear in the transcript
- Never modify timestamp format (keep MM:SS structure)
- start_time MUST be LESS THAN end_time (start_time < end_time)
- MINIMUM segment duration: 20 seconds (end_time - start_time >= 20 seconds)
- Look at transcript ranges like [02:25 - 02:35] and use different start/end times
- NEVER use the same timestamp for both start_time and end_time
- Example: start_time: "02:25", end_time: "02:35" (NOT "02:25" and "02:25")

Find {clips_count} segments with maximum viral potential. Think about what makes people stop scrolling and share. Quality over quantity - only select truly shareable moments.""",
)


class PromptRepository:
    """Repository for managing prompt templates."""

    _prompts: Dict[str, PromptTemplate] = {
        DEFAULT_PROMPT.id: DEFAULT_PROMPT,
        EDUCATIONAL_PROMPT.id: EDUCATIONAL_PROMPT,
        COMEDY_PROMPT.id: COMEDY_PROMPT,
        INTERVIEW_PROMPT.id: INTERVIEW_PROMPT,
        MOTIVATIONAL_PROMPT.id: MOTIVATIONAL_PROMPT,
        VIRAL_PROMPT.id: VIRAL_PROMPT,
    }

    @classmethod
    def get_all_prompts(cls) -> List[PromptTemplate]:
        """Get all available prompt templates."""
        return list(cls._prompts.values())

    @classmethod
    def get_prompt_by_id(cls, prompt_id: str) -> Optional[PromptTemplate]:
        """Get a specific prompt by ID."""
        return cls._prompts.get(prompt_id)

    @classmethod
    def get_default_prompt(cls) -> PromptTemplate:
        """Get the default prompt template."""
        for prompt in cls._prompts.values():
            if prompt.is_default:
                return prompt
        # Fallback to first prompt if no default is set
        return list(cls._prompts.values())[0]

    @classmethod
    def get_prompt_choices(cls) -> List[Dict[str, str]]:
        """Get prompt choices for UI dropdown - returns id, name, and description."""
        return [
            {
                "id": prompt.id,
                "name": prompt.name,
                "description": prompt.description,
            }
            for prompt in cls._prompts.values()
        ]

    @classmethod
    def get_system_prompt(cls, prompt_id: Optional[str] = None, clips_count: Optional[int] = None) -> str:
        """Get the system prompt text for a given prompt ID.
        
        Args:
            prompt_id: The ID of the prompt template. If None, returns default.
            clips_count: Number of clips to generate. If provided, replaces {clips_count} in the prompt.
            
        Returns:
            The system prompt text with clips_count replaced if provided.
        """
        if prompt_id is None:
            logger.info("No prompt_id provided, using default prompt")
            prompt_text = cls.get_default_prompt().system_prompt
        else:
            prompt = cls._prompts.get(prompt_id)
            if prompt is None:
                logger.info(f"Prompt ID {prompt_id} not found, using default prompt")
                prompt_text = cls.get_default_prompt().system_prompt
            else:
                logger.info(f"Using prompt ID {prompt_id}")
                prompt_text = prompt.system_prompt
        
        # Replace clips_count placeholder if value is provided
        logger.info(f"Using clips_count {clips_count}")
        if clips_count is not None:
            prompt_text = prompt_text.replace("{clips_count}", str(clips_count))
        
        return prompt_text

    @classmethod
    def validate_prompt_id(cls, prompt_id: Optional[str]) -> bool:
        """Validate if a prompt ID exists."""
        if prompt_id is None:
            return True  # None is valid (will use default)
        return prompt_id in cls._prompts
