"use client";

import { useState, useEffect } from "react";
import { normalizeFontStyleOptions, type FontStyleOptions } from "@/lib/font-style-options";
import { isAiProvider, type AiProvider, DEFAULT_AI_MODELS, clampInteger } from "@/lib/utils";

const DEFAULT_WHISPER_CHUNKING_ENABLED = true;
const DEFAULT_WHISPER_CHUNK_DURATION_SECONDS = 1200;
const DEFAULT_WHISPER_CHUNK_OVERLAP_SECONDS = 8;
const DEFAULT_TASK_TIMEOUT_SECONDS = 21600;
const MAX_TASK_TIMEOUT_SECONDS = 86400;
const MIN_TASK_TIMEOUT_SECONDS = 300;

export interface UserPreferences extends FontStyleOptions {
  transitionsEnabled: boolean;
  transcriptionProvider: "local" | "assemblyai";
  whisperChunkingEnabled: boolean;
  whisperChunkDurationSeconds: number;
  whisperChunkOverlapSeconds: number;
  taskTimeoutSeconds: number;
  aiProvider: AiProvider;
  aiModel: string;
}

interface UseUserPreferencesOptions {
  userId: string | undefined;
  taskTimeoutCapSeconds: number;
}

interface UseUserPreferencesReturn {
  preferences: UserPreferences;
  setPreferences: (prefs: Partial<UserPreferences>) => void;
  isLoading: boolean;
}

function normalizeWhisperChunkDurationSecondsOnForm(value: unknown): number {
  return clampInteger(
    value,
    DEFAULT_WHISPER_CHUNK_DURATION_SECONDS,
    300,
    3600
  );
}

function normalizeWhisperChunkOverlapSecondsOnForm(
  value: unknown,
  chunkDurationSeconds: number
): number {
  const boundedByDuration = Math.max(0, chunkDurationSeconds - 1);
  const maxAllowed = Math.min(120, boundedByDuration);
  return clampInteger(value, DEFAULT_WHISPER_CHUNK_OVERLAP_SECONDS, 0, maxAllowed);
}

function normalizeTaskTimeoutSecondsOnForm(
  value: unknown,
  timeoutCapSeconds: number
): number {
  const maxAllowed = Math.max(MIN_TASK_TIMEOUT_SECONDS, Math.min(MAX_TASK_TIMEOUT_SECONDS, timeoutCapSeconds));
  return clampInteger(value, DEFAULT_TASK_TIMEOUT_SECONDS, MIN_TASK_TIMEOUT_SECONDS, maxAllowed);
}

export const DEFAULT_PREFERENCES: UserPreferences = {
  ...normalizeFontStyleOptions({}),
  transitionsEnabled: false,
  transcriptionProvider: "local",
  whisperChunkingEnabled: DEFAULT_WHISPER_CHUNKING_ENABLED,
  whisperChunkDurationSeconds: DEFAULT_WHISPER_CHUNK_DURATION_SECONDS,
  whisperChunkOverlapSeconds: DEFAULT_WHISPER_CHUNK_OVERLAP_SECONDS,
  taskTimeoutSeconds: DEFAULT_TASK_TIMEOUT_SECONDS,
  aiProvider: "openai",
  aiModel: DEFAULT_AI_MODELS.openai,
};

export function useUserPreferences({
  userId,
  taskTimeoutCapSeconds,
}: UseUserPreferencesOptions): UseUserPreferencesReturn {
  const [preferences, setPreferencesState] = useState<UserPreferences>(DEFAULT_PREFERENCES);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    const loadUserPreferences = async () => {
      if (!userId) return;

      setIsLoading(true);
      try {
        const response = await fetch("/api/preferences");
        if (response.ok) {
          const data: Record<string, unknown> = await response.json();
          const normalizedFontStyle = normalizeFontStyleOptions(data);

          const savedTranscriptionProvider = data.transcriptionProvider;
          const transcriptionProvider =
            savedTranscriptionProvider === "local" || savedTranscriptionProvider === "assemblyai"
              ? savedTranscriptionProvider
              : DEFAULT_PREFERENCES.transcriptionProvider;

          const normalizedChunkDuration = normalizeWhisperChunkDurationSecondsOnForm(
            data.whisperChunkDurationSeconds
          );
          const normalizedChunkOverlap = normalizeWhisperChunkOverlapSecondsOnForm(
            data.whisperChunkOverlapSeconds,
            normalizedChunkDuration
          );

          const savedAiProvider = isAiProvider(data.aiProvider) ? data.aiProvider : undefined;
          const providerForModel: AiProvider = savedAiProvider ?? "openai";
          const storedAiModel = typeof data.aiModel === "string" ? data.aiModel.trim() : "";

          setPreferencesState({
            fontFamily: normalizedFontStyle.fontFamily,
            fontSize: normalizedFontStyle.fontSize,
            fontColor: normalizedFontStyle.fontColor,
            fontWeight: normalizedFontStyle.fontWeight,
            lineHeight: normalizedFontStyle.lineHeight,
            letterSpacing: normalizedFontStyle.letterSpacing,
            textTransform: normalizedFontStyle.textTransform,
            textAlign: normalizedFontStyle.textAlign,
            strokeColor: normalizedFontStyle.strokeColor,
            strokeWidth: normalizedFontStyle.strokeWidth,
            shadowColor: normalizedFontStyle.shadowColor,
            shadowOpacity: normalizedFontStyle.shadowOpacity,
            shadowBlur: normalizedFontStyle.shadowBlur,
            shadowOffsetX: normalizedFontStyle.shadowOffsetX,
            shadowOffsetY: normalizedFontStyle.shadowOffsetY,
            transitionsEnabled: Boolean(data.transitionsEnabled),
            transcriptionProvider,
            whisperChunkingEnabled:
              typeof data.whisperChunkingEnabled === "boolean"
                ? data.whisperChunkingEnabled
                : DEFAULT_WHISPER_CHUNKING_ENABLED,
            whisperChunkDurationSeconds: normalizedChunkDuration,
            whisperChunkOverlapSeconds: normalizedChunkOverlap,
            taskTimeoutSeconds: normalizeTaskTimeoutSecondsOnForm(
              data.taskTimeoutSeconds,
              taskTimeoutCapSeconds
            ),
            aiProvider: savedAiProvider ?? "openai",
            aiModel: storedAiModel || DEFAULT_AI_MODELS[providerForModel],
          });
        }
      } catch (error) {
        console.error("Failed to load user preferences:", error);
      } finally {
        setIsLoading(false);
      }
    };

    loadUserPreferences();
  }, [userId, taskTimeoutCapSeconds]);

  const setPreferences = (newPrefs: Partial<UserPreferences>) => {
    setPreferencesState((prev) => ({ ...prev, ...newPrefs }));
  };

  return {
    preferences,
    setPreferences,
    isLoading,
  };
}
