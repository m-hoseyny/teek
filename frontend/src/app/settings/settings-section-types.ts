import {
  DEFAULT_FONT_STYLE_OPTIONS,
  normalizeFontSize,
  type FontStyleOptions,
} from "@/lib/font-style-options";

export const SETTINGS_SECTIONS = ["font", "video", "transcription", "ai"] as const;

export type SettingsSection = (typeof SETTINGS_SECTIONS)[number];

export const TRANSCRIPTION_PROVIDERS = ["local", "assemblyai"] as const;
export const AI_PROVIDERS = ["openai", "google", "anthropic", "zai"] as const;
export const ZAI_ROUTING_MODES = ["auto", "subscription", "metered"] as const;

export type TranscriptionProvider = (typeof TRANSCRIPTION_PROVIDERS)[number];
export type AiProvider = (typeof AI_PROVIDERS)[number];
export type ZaiRoutingMode = (typeof ZAI_ROUTING_MODES)[number];

export const MIN_WHISPER_CHUNK_DURATION_SECONDS = 300;
export const MAX_WHISPER_CHUNK_DURATION_SECONDS = 3600;
export const MIN_WHISPER_CHUNK_OVERLAP_SECONDS = 0;
export const MAX_WHISPER_CHUNK_OVERLAP_SECONDS = 120;
export const MIN_TASK_TIMEOUT_SECONDS = 300;
export const MAX_TASK_TIMEOUT_SECONDS = 86400;

export interface UserPreferences extends FontStyleOptions {
  transitionsEnabled: boolean;
  transcriptionProvider: TranscriptionProvider;
  whisperChunkingEnabled: boolean;
  whisperChunkDurationSeconds: number;
  whisperChunkOverlapSeconds: number;
  taskTimeoutSeconds: number;
  aiProvider: AiProvider;
  aiModel: string;
}

export const DEFAULT_USER_PREFERENCES: UserPreferences = {
  ...DEFAULT_FONT_STYLE_OPTIONS,
  transitionsEnabled: false,
  transcriptionProvider: "assemblyai",
  whisperChunkingEnabled: true,
  whisperChunkDurationSeconds: 1200,
  whisperChunkOverlapSeconds: 8,
  taskTimeoutSeconds: 21600,
  aiProvider: "openai",
  aiModel: "gpt-5",
};

export const DEFAULT_AI_MODELS: Record<AiProvider, string> = {
  openai: "gpt-5",
  google: "gemini-2.5-pro",
  anthropic: "claude-4-sonnet",
  zai: "glm-5",
};

export const FALLBACK_AI_MODEL_OPTIONS: Record<AiProvider, string[]> = {
  openai: ["gpt-5", "gpt-5-mini", "gpt-4.1"],
  google: ["gemini-2.5-pro", "gemini-2.5-flash"],
  anthropic: ["claude-4-sonnet", "claude-3-5-haiku"],
  zai: ["glm-5"],
};

export const SETTINGS_SECTION_META: Record<SettingsSection, { label: string; description: string }> = {
  font: {
    label: "Fonts",
    description: "Subtitle style applied to new tasks.",
  },
  video: {
    label: "Video",
    description: "Clip composition and transitions for new tasks.",
  },
  transcription: {
    label: "Transcription",
    description: "Provider, chunking, timeout, and transcription API key.",
  },
  ai: {
    label: "AI",
    description: "LLM provider, model, and AI API keys.",
  },
};

export function isTranscriptionProvider(value: string): value is TranscriptionProvider {
  return TRANSCRIPTION_PROVIDERS.includes(value as TranscriptionProvider);
}

export function isAiProvider(value: string): value is AiProvider {
  return AI_PROVIDERS.includes(value as AiProvider);
}

export function isZaiRoutingMode(value: string): value is ZaiRoutingMode {
  return ZAI_ROUTING_MODES.includes(value as ZaiRoutingMode);
}

export function isSettingsSection(value: string | null): value is SettingsSection {
  return value !== null && SETTINGS_SECTIONS.includes(value as SettingsSection);
}

export function arePreferencesEqual(a: UserPreferences, b: UserPreferences): boolean {
  return (
    a.fontFamily === b.fontFamily &&
    a.fontSize === b.fontSize &&
    a.fontColor === b.fontColor &&
    a.fontWeight === b.fontWeight &&
    a.lineHeight === b.lineHeight &&
    a.letterSpacing === b.letterSpacing &&
    a.textTransform === b.textTransform &&
    a.textAlign === b.textAlign &&
    a.strokeColor === b.strokeColor &&
    a.strokeWidth === b.strokeWidth &&
    a.shadowColor === b.shadowColor &&
    a.shadowOpacity === b.shadowOpacity &&
    a.shadowBlur === b.shadowBlur &&
    a.shadowOffsetX === b.shadowOffsetX &&
    a.shadowOffsetY === b.shadowOffsetY &&
    a.transitionsEnabled === b.transitionsEnabled &&
    a.transcriptionProvider === b.transcriptionProvider &&
    a.whisperChunkingEnabled === b.whisperChunkingEnabled &&
    a.whisperChunkDurationSeconds === b.whisperChunkDurationSeconds &&
    a.whisperChunkOverlapSeconds === b.whisperChunkOverlapSeconds &&
    a.taskTimeoutSeconds === b.taskTimeoutSeconds &&
    a.aiProvider === b.aiProvider &&
    a.aiModel === b.aiModel
  );
}

export function normalizeWhisperChunkDurationSeconds(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.min(MAX_WHISPER_CHUNK_DURATION_SECONDS, Math.max(MIN_WHISPER_CHUNK_DURATION_SECONDS, Math.round(value)));
  }
  return DEFAULT_USER_PREFERENCES.whisperChunkDurationSeconds;
}

export function normalizeWhisperChunkOverlapSeconds(value: unknown, chunkDurationSeconds: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return DEFAULT_USER_PREFERENCES.whisperChunkOverlapSeconds;
  }
  const rounded = Math.round(value);
  const maxByDuration = Math.max(MIN_WHISPER_CHUNK_OVERLAP_SECONDS, chunkDurationSeconds - 1);
  const boundedMax = Math.min(MAX_WHISPER_CHUNK_OVERLAP_SECONDS, maxByDuration);
  return Math.min(boundedMax, Math.max(MIN_WHISPER_CHUNK_OVERLAP_SECONDS, rounded));
}

export function normalizeTaskTimeoutSeconds(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.min(MAX_TASK_TIMEOUT_SECONDS, Math.max(MIN_TASK_TIMEOUT_SECONDS, Math.round(value)));
  }
  return DEFAULT_USER_PREFERENCES.taskTimeoutSeconds;
}

export { normalizeFontSize };
