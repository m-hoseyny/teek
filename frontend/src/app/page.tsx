"use client";

import { useState, useRef, useEffect, useCallback, type CSSProperties, type ChangeEvent, type DragEvent, type FormEvent, type JSX } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { useSession } from "@/lib/auth-client";
import Link from "next/link";
import Image from "next/image";
import { Header } from "@/components/header";
import { ArrowRight, CheckCircle, AlertCircle, Loader2, Palette, Type, Paintbrush, Clock, Upload, FileText } from "lucide-react";
import {
  normalizeFontSize,
  normalizeFontStyleOptions,
  normalizeFontWeight,
  normalizeLetterSpacing,
  normalizeLineHeight,
  normalizeShadowBlur,
  normalizeShadowOffset,
  normalizeShadowOpacity,
  normalizeStrokeWidth,
  TEXT_ALIGN_OPTIONS,
  TEXT_TRANSFORM_OPTIONS,
  type TextAlignOption,
  type TextTransformOption,
} from "@/lib/font-style-options";

interface LatestTask {
  id: string;
  source_title: string;
  source_type: string;
  status: string;
  clips_count: number;
  created_at: string;
}

const AI_PROVIDERS = ["openai", "google", "anthropic", "zai"] as const;
type AiProvider = (typeof AI_PROVIDERS)[number];

const DEFAULT_AI_MODELS = {
  openai: "gpt-5",
  google: "gemini-2.5-pro",
  anthropic: "claude-4-sonnet",
  zai: "glm-5",
} as const satisfies Record<AiProvider, string>;
const SWATCH_COLORS = ["#FFFFFF", "#000000", "#FFD700", "#FF6B6B", "#4ECDC4", "#45B7D1"];
const DEFAULT_WHISPER_CHUNKING_ENABLED = true;
const DEFAULT_WHISPER_CHUNK_DURATION_SECONDS = 1200;
const DEFAULT_WHISPER_CHUNK_OVERLAP_SECONDS = 8;
const DEFAULT_TASK_TIMEOUT_SECONDS = 21600;
const MIN_WHISPER_CHUNK_DURATION_SECONDS = 300;
const MAX_WHISPER_CHUNK_DURATION_SECONDS = 3600;
const MIN_WHISPER_CHUNK_OVERLAP_SECONDS = 0;
const MAX_WHISPER_CHUNK_OVERLAP_SECONDS = 120;
const MIN_TASK_TIMEOUT_SECONDS = 300;
const MAX_TASK_TIMEOUT_SECONDS = 86400;

function isAiProvider(value: unknown): value is AiProvider {
  return typeof value === "string" && AI_PROVIDERS.includes(value as AiProvider);
}

function applyTextTransform(text: string, mode: TextTransformOption): string {
  if (mode === "uppercase") {
    return text.toUpperCase();
  }
  if (mode === "lowercase") {
    return text.toLowerCase();
  }
  if (mode === "capitalize") {
    return text.replace(/\b\p{L}/gu, (match) => match.toUpperCase());
  }
  return text;
}

function hexToRgba(hex: string, alpha: number): string {
  const sanitized = hex.replace("#", "");
  if (sanitized.length !== 6) {
    return `rgba(0, 0, 0, ${alpha})`;
  }
  const r = Number.parseInt(sanitized.slice(0, 2), 16);
  const g = Number.parseInt(sanitized.slice(2, 4), 16);
  const b = Number.parseInt(sanitized.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function isLightColor(hex: string): boolean {
  const sanitized = hex.replace("#", "");
  if (sanitized.length !== 6) {
    return false;
  }
  const r = Number.parseInt(sanitized.slice(0, 2), 16);
  const g = Number.parseInt(sanitized.slice(2, 4), 16);
  const b = Number.parseInt(sanitized.slice(4, 6), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.5;
}

function formatTextOption(option: string): string {
  return option.charAt(0).toUpperCase() + option.slice(1);
}

function clampInteger(value: unknown, fallback: number, min: number, max: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }
  return Math.max(min, Math.min(max, Math.round(value)));
}

function normalizeWhisperChunkDurationSecondsOnForm(value: unknown): number {
  return clampInteger(
    value,
    DEFAULT_WHISPER_CHUNK_DURATION_SECONDS,
    MIN_WHISPER_CHUNK_DURATION_SECONDS,
    MAX_WHISPER_CHUNK_DURATION_SECONDS,
  );
}

function normalizeWhisperChunkOverlapSecondsOnForm(value: unknown, chunkDurationSeconds: number): number {
  const boundedByDuration = Math.max(MIN_WHISPER_CHUNK_OVERLAP_SECONDS, chunkDurationSeconds - 1);
  const maxAllowed = Math.min(MAX_WHISPER_CHUNK_OVERLAP_SECONDS, boundedByDuration);
  return clampInteger(value, DEFAULT_WHISPER_CHUNK_OVERLAP_SECONDS, MIN_WHISPER_CHUNK_OVERLAP_SECONDS, maxAllowed);
}

function normalizeTaskTimeoutSecondsOnForm(value: unknown, timeoutCapSeconds: number): number {
  const maxAllowed = Math.max(MIN_TASK_TIMEOUT_SECONDS, Math.min(MAX_TASK_TIMEOUT_SECONDS, timeoutCapSeconds));
  return clampInteger(value, DEFAULT_TASK_TIMEOUT_SECONDS, MIN_TASK_TIMEOUT_SECONDS, maxAllowed);
}

export default function Home() {
  const [isLoading, setIsLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [statusMessage, setStatusMessage] = useState("");
  const [currentStep, setCurrentStep] = useState("");
  const [sourceType, setSourceType] = useState<"upload_file" | "video_url">("upload_file");
  const [uploadUrl, setUploadUrl] = useState("");
  const [fileName, setFileName] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sourceTitle, setSourceTitle] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const { data: session, isPending } = useSession();

  // Font customization states
  const [fontFamily, setFontFamily] = useState("TikTokSans-Regular");
  const [fontSize, setFontSize] = useState(24);
  const [fontColor, setFontColor] = useState("#FFFFFF");
  const [fontWeight, setFontWeight] = useState(600);
  const [lineHeight, setLineHeight] = useState(1.4);
  const [letterSpacing, setLetterSpacing] = useState(0);
  const [textTransform, setTextTransform] = useState<TextTransformOption>("none");
  const [textAlign, setTextAlign] = useState<TextAlignOption>("center");
  const [strokeColor, setStrokeColor] = useState("#000000");
  const [strokeWidth, setStrokeWidth] = useState(2);
  const [shadowColor, setShadowColor] = useState("#000000");
  const [shadowOpacity, setShadowOpacity] = useState(0.5);
  const [shadowBlur, setShadowBlur] = useState(2);
  const [shadowOffsetX, setShadowOffsetX] = useState(0);
  const [shadowOffsetY, setShadowOffsetY] = useState(2);
  const [availableFonts, setAvailableFonts] = useState<Array<{ name: string, display_name: string }>>([]);
  const [isUploadingFont, setIsUploadingFont] = useState(false);
  const [fontUploadMessage, setFontUploadMessage] = useState<string | null>(null);
  const [fontUploadError, setFontUploadError] = useState<string | null>(null);
  const [useCustomSrt, setUseCustomSrt] = useState(true);
  const [srtFile, setSrtFile] = useState<File | null>(null);
  const [srtFileName, setSrtFileName] = useState<string | null>(null);
  const srtInputRef = useRef<HTMLInputElement | null>(null);
  const [showAdvancedOptions, setShowAdvancedOptions] = useState(false);
  const [transitionsEnabled, setTransitionsEnabled] = useState(false);
  const [transcriptReviewEnabled, setTranscriptReviewEnabled] = useState(true);
  const [transcriptionProvider, setTranscriptionProvider] = useState<"local" | "assemblyai">("local");
  const [whisperChunkingEnabled, setWhisperChunkingEnabled] = useState(DEFAULT_WHISPER_CHUNKING_ENABLED);
  const [whisperChunkDurationSeconds, setWhisperChunkDurationSeconds] = useState(DEFAULT_WHISPER_CHUNK_DURATION_SECONDS);
  const [whisperChunkOverlapSeconds, setWhisperChunkOverlapSeconds] = useState(DEFAULT_WHISPER_CHUNK_OVERLAP_SECONDS);
  const [taskTimeoutSeconds, setTaskTimeoutSeconds] = useState(DEFAULT_TASK_TIMEOUT_SECONDS);
  const [taskTimeoutCapSeconds, setTaskTimeoutCapSeconds] = useState(MAX_TASK_TIMEOUT_SECONDS);
  const [aiProvider, setAiProvider] = useState<AiProvider>("openai");
  const [aiModel, setAiModel] = useState<string>(DEFAULT_AI_MODELS.openai);

  // Prompt selection state
  const [availablePrompts, setAvailablePrompts] = useState<Array<{ id: string; name: string; description: string }>>([]);
  const [selectedPromptId, setSelectedPromptId] = useState<string>("default");
  const [isLoadingPrompts, setIsLoadingPrompts] = useState(false);

  // Clips count state
  const [clipsCount, setClipsCount] = useState<number>(5);
  const MIN_CLIPS_COUNT = 1;
  const MAX_CLIPS_COUNT = 50;

  // Latest task state
  const [latestTask, setLatestTask] = useState<LatestTask | null>(null);
  const [isLoadingLatest, setIsLoadingLatest] = useState(false);

  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

  const loadFonts = useCallback(async () => {
    try {
      const response = await fetch(`${apiUrl}/fonts`);
      if (!response.ok) {
        return;
      }

      const data = await response.json();
      const fonts = data.fonts || [];
      setAvailableFonts(fonts);

      // Dynamically load fonts using @font-face
      const fontFaceStyles = fonts.map((font: { name: string }) => {
        return `
          @font-face {
            font-family: '${font.name}';
            src: url('${apiUrl}/fonts/${font.name}') format('truetype');
            font-weight: normal;
            font-style: normal;
          }
        `;
      }).join('\n');

      // Inject font styles into the page
      const styleElement = document.createElement('style');
      styleElement.id = 'custom-fonts';
      styleElement.innerHTML = fontFaceStyles;

      // Remove existing custom fonts style if present
      const existingStyle = document.getElementById('custom-fonts');
      if (existingStyle) {
        existingStyle.remove();
      }

      document.head.appendChild(styleElement);
    } catch (error) {
      console.error('Failed to load fonts:', error);
    }
  }, [apiUrl]);

  // Load available fonts and inject them into the page
  useEffect(() => {
    void loadFonts();
  }, [loadFonts]);

  // Load user preferences as defaults
  useEffect(() => {
    const loadUserPreferences = async () => {
      if (!session?.user?.id) return;

      try {
        const response = await fetch('/api/preferences');
        if (response.ok) {
          const data: {
            fontFamily?: unknown;
            fontSize?: unknown;
            fontColor?: unknown;
            fontWeight?: unknown;
            lineHeight?: unknown;
            letterSpacing?: unknown;
            textTransform?: unknown;
            textAlign?: unknown;
            strokeColor?: unknown;
            strokeWidth?: unknown;
            shadowColor?: unknown;
            shadowOpacity?: unknown;
            shadowBlur?: unknown;
            shadowOffsetX?: unknown;
            shadowOffsetY?: unknown;
            transitionsEnabled?: unknown;
            transcriptionProvider?: unknown;
            whisperChunkingEnabled?: unknown;
            whisperChunkDurationSeconds?: unknown;
            whisperChunkOverlapSeconds?: unknown;
            taskTimeoutSeconds?: unknown;
            aiProvider?: unknown;
            aiModel?: unknown;
          } = await response.json();
          const normalizedFontStyle = normalizeFontStyleOptions(data);
          setFontFamily(normalizedFontStyle.fontFamily);
          setFontSize(normalizedFontStyle.fontSize);
          setFontColor(normalizedFontStyle.fontColor);
          setFontWeight(normalizedFontStyle.fontWeight);
          setLineHeight(normalizedFontStyle.lineHeight);
          setLetterSpacing(normalizedFontStyle.letterSpacing);
          setTextTransform(normalizedFontStyle.textTransform);
          setTextAlign(normalizedFontStyle.textAlign);
          setStrokeColor(normalizedFontStyle.strokeColor);
          setStrokeWidth(normalizedFontStyle.strokeWidth);
          setShadowColor(normalizedFontStyle.shadowColor);
          setShadowOpacity(normalizedFontStyle.shadowOpacity);
          setShadowBlur(normalizedFontStyle.shadowBlur);
          setShadowOffsetX(normalizedFontStyle.shadowOffsetX);
          setShadowOffsetY(normalizedFontStyle.shadowOffsetY);
          setTransitionsEnabled(Boolean(data.transitionsEnabled));

          const savedTranscriptionProvider = data.transcriptionProvider;
          if (savedTranscriptionProvider === "local" || savedTranscriptionProvider === "assemblyai") {
            setTranscriptionProvider(savedTranscriptionProvider);
          }
          setWhisperChunkingEnabled(
            typeof data.whisperChunkingEnabled === "boolean"
              ? data.whisperChunkingEnabled
              : DEFAULT_WHISPER_CHUNKING_ENABLED,
          );
          const normalizedChunkDuration = normalizeWhisperChunkDurationSecondsOnForm(data.whisperChunkDurationSeconds);
          const normalizedChunkOverlap = normalizeWhisperChunkOverlapSecondsOnForm(
            data.whisperChunkOverlapSeconds,
            normalizedChunkDuration,
          );
          setWhisperChunkDurationSeconds(normalizedChunkDuration);
          setWhisperChunkOverlapSeconds(normalizedChunkOverlap);
          setTaskTimeoutSeconds(normalizeTaskTimeoutSecondsOnForm(data.taskTimeoutSeconds, taskTimeoutCapSeconds));

          const savedAiProvider = isAiProvider(data.aiProvider) ? data.aiProvider : undefined;
          if (savedAiProvider) {
            setAiProvider(savedAiProvider);
          }

          const providerForModel: AiProvider = savedAiProvider ?? "openai";
          const storedAiModel = typeof data.aiModel === "string" ? data.aiModel.trim() : "";
          setAiModel(storedAiModel || DEFAULT_AI_MODELS[providerForModel]);
        }
      } catch (error) {
        console.error('Failed to load user preferences:', error);
      }
    };

    loadUserPreferences();
  }, [session?.user?.id]);

  useEffect(() => {
    const loadTranscriptionLimits = async () => {
      if (!session?.user?.id) return;
      try {
        const response = await fetch(`${apiUrl}/tasks/transcription-settings`, {
          headers: {
            user_id: session.user.id,
          },
        });
        if (!response.ok) {
          return;
        }
        const data = await response.json();
        const cap = clampInteger(
          data.worker_timeout_cap_seconds,
          MAX_TASK_TIMEOUT_SECONDS,
          MIN_TASK_TIMEOUT_SECONDS,
          MAX_TASK_TIMEOUT_SECONDS,
        );
        setTaskTimeoutCapSeconds(cap);
        setTaskTimeoutSeconds((prev) => normalizeTaskTimeoutSecondsOnForm(prev, cap));
      } catch (limitError) {
        console.error("Failed to load transcription limits:", limitError);
      }
    };

    void loadTranscriptionLimits();
  }, [apiUrl, session?.user?.id]);

  // Load available prompts
  useEffect(() => {
    const loadPrompts = async () => {
      if (!session?.user?.id) return;
      try {
        setIsLoadingPrompts(true);
        const response = await fetch(`${apiUrl}/tasks/prompts`, {
          headers: {
            user_id: session.user.id,
          },
        });
        if (!response.ok) {
          return;
        }
        const data = await response.json();
        if (data.prompts && Array.isArray(data.prompts)) {
          setAvailablePrompts(data.prompts);
          // Set default prompt if available
          if (data.default_prompt_id) {
            setSelectedPromptId(data.default_prompt_id);
          }
        }
      } catch (promptError) {
        console.error("Failed to load prompts:", promptError);
      } finally {
        setIsLoadingPrompts(false);
      }
    };

    void loadPrompts();
  }, [apiUrl, session?.user?.id]);

  // Load latest task
  useEffect(() => {
    const fetchLatestTask = async () => {
      if (!session?.user?.id) return;

      try {
        setIsLoadingLatest(true);
        const response = await fetch(`${apiUrl}/tasks/`, {
          headers: {
            'user_id': session.user.id,
          },
        });

        if (response.ok) {
          const data = await response.json();
          if (data.tasks && data.tasks.length > 0) {
            setLatestTask(data.tasks[0]); // Get the first (latest) task
          }
        }
      } catch (error) {
        console.error('Failed to load latest task:', error);
      } finally {
        setIsLoadingLatest(false);
      }
    };

    fetchLatestTask();
  }, [session?.user?.id, apiUrl]);

  // Always treat file input as uncontrolled, and store file in a ref
  const fileRef = useRef<File | null>(null);

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] || null;
    fileRef.current = file;
    setFileName(file ? file.name : null);
  };

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  };

  const handleDragLeave = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);

    const file = e.dataTransfer.files?.[0] || null;
    if (file && file.type.startsWith("video/")) {
      fileRef.current = file;
      setFileName(file.name);
    }
  };

  const handleDropZoneClick = () => {
    fileInputRef.current?.click();
  };

  const uploadVideoWithProgress = (file: File): Promise<{ video_path?: string; message?: string }> => {
    return new Promise((resolve, reject) => {
      const formData = new FormData();
      formData.append("video", file);

      const xhr = new XMLHttpRequest();
      xhr.open("POST", `${apiUrl}/upload`);

      xhr.upload.onprogress = (event) => {
        if (!event.lengthComputable || event.total <= 0) {
          return;
        }

        const uploadPercent = Math.round((event.loaded / event.total) * 100);
        // Keep room for the handoff to task creation after upload completes.
        const progressValue = Math.max(5, Math.min(95, Math.round(uploadPercent * 0.95)));
        setProgress(progressValue);
        setStatusMessage(`Uploading video file... ${uploadPercent}%`);
      };

      xhr.onload = () => {
        const isSuccess = xhr.status >= 200 && xhr.status < 300;
        if (!isSuccess) {
          let detail = xhr.responseText || `HTTP ${xhr.status}`;
          try {
            const parsed = JSON.parse(xhr.responseText) as { detail?: string };
            if (parsed?.detail) {
              detail = parsed.detail;
            }
          } catch {
            // Keep raw response text when JSON parsing fails.
          }
          reject(new Error(`Upload error: ${detail}`));
          return;
        }

        try {
          const response = JSON.parse(xhr.responseText) as { video_path?: string; message?: string };
          resolve(response);
        } catch {
          reject(new Error("Upload error: invalid response from server"));
        }
      };

      xhr.onerror = () => {
        reject(new Error("Upload error: network failure"));
      };

      xhr.send(formData);
    });
  };

  const handleSrtFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] || null;
    if (file && file.name.toLowerCase().endsWith('.srt')) {
      setSrtFile(file);
      setSrtFileName(file.name);
    } else if (file) {
      setError("Please upload a valid .srt file");
      if (srtInputRef.current) {
        srtInputRef.current.value = "";
      }
    }
  };
  const handleFontUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) {
      return;
    }

    setFontUploadError(null);
    setFontUploadMessage(null);

    if (!file.name.toLowerCase().endsWith('.ttf')) {
      setFontUploadError('Only .ttf font files are supported.');
      e.target.value = '';
      return;
    }

    setIsUploadingFont(true);
    try {
      const formData = new FormData();
      formData.append('font', file);

      const response = await fetch(`${apiUrl}/fonts/upload`, {
        method: 'POST',
        body: formData,
      });

      const responseData = await response.json().catch(() => ({} as { detail?: string; message?: string; font?: { name?: string } }));
      if (!response.ok) {
        throw new Error(responseData?.detail || 'Failed to upload font');
      }

      await loadFonts();
      if (typeof responseData?.font?.name === 'string' && responseData.font.name.length > 0) {
        setFontFamily(responseData.font.name);
      }
      setFontUploadMessage(responseData?.message || 'Font uploaded successfully.');
    } catch (uploadError) {
      setFontUploadError(uploadError instanceof Error ? uploadError.message : 'Failed to upload font.');
    } finally {
      setIsUploadingFont(false);
      e.target.value = '';
    }
  };


  const getStepIcon = (step: string) => {
    const iconMap: Record<string, JSX.Element> = {
      validation: <Loader2 className="w-4 h-4 animate-spin text-blue-500" />,
      user_check: <Loader2 className="w-4 h-4 animate-spin text-blue-500" />,
      source_analysis: <Loader2 className="w-4 h-4 animate-spin text-blue-500" />,
      youtube_info: <ArrowRight className="w-4 h-4 text-red-500" />,
      database_save: <Loader2 className="w-4 h-4 animate-spin text-blue-500" />,
      download: <Loader2 className="w-4 h-4 animate-spin text-green-500" />,
      transcript: <Loader2 className="w-4 h-4 animate-spin text-purple-500" />,
      ai_analysis: <Loader2 className="w-4 h-4 animate-spin text-orange-500" />,
      clip_generation: <Loader2 className="w-4 h-4 animate-spin text-indigo-500" />,
      save_clips: <Loader2 className="w-4 h-4 animate-spin text-pink-500" />,
      complete: <CheckCircle className="w-4 h-4 text-green-500" />,
    };
    return iconMap[step] || <Loader2 className="w-4 h-4 animate-spin text-gray-500" />;
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();

    if (sourceType === "upload_file" && !fileRef.current) return;
    if (sourceType === "video_url" && !uploadUrl.trim()) return;
    if (!session?.user?.id) return;

    setIsLoading(true);
    setProgress(0);
    setError(null);
    setStatusMessage("");
    setCurrentStep("");
    setSourceTitle(null);

    try {
      let videoUrl = uploadUrl;
      let srtContent: string | undefined;

      // If uploading file, upload it first
      if (sourceType === "upload_file" && fileRef.current) {
        setCurrentStep("upload");
        setStatusMessage("Uploading video file...");
        setProgress(5);
        const uploadResult = await uploadVideoWithProgress(fileRef.current);
        if (!uploadResult.video_path) {
          throw new Error("Upload error: server did not return uploaded file path");
        }
        setStatusMessage("Upload complete. Starting processing...");
        setProgress(100);
        videoUrl = uploadResult.video_path;
      } else if (sourceType === "video_url") {
        videoUrl = uploadUrl.trim();
      }

      // Read SRT file content if provided
      if (useCustomSrt && srtFile) {
        srtContent = await srtFile.text();
      }

      const normalizedChunkDuration = normalizeWhisperChunkDurationSecondsOnForm(whisperChunkDurationSeconds);
      const normalizedChunkOverlap = normalizeWhisperChunkOverlapSecondsOnForm(
        whisperChunkOverlapSeconds,
        normalizedChunkDuration,
      );
      const normalizedTaskTimeoutSeconds = normalizeTaskTimeoutSecondsOnForm(taskTimeoutSeconds, taskTimeoutCapSeconds);

      const startResponse = await fetch(`${apiUrl}/tasks/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'user_id': session.user.id,
        },
        body: JSON.stringify({
          source: {
            url: videoUrl,
            title: null
          },
          font_options: {
            font_family: fontFamily,
            font_size: fontSize,
            font_color: fontColor,
            font_weight: fontWeight,
            line_height: lineHeight,
            letter_spacing: letterSpacing,
            text_transform: textTransform,
            text_align: textAlign,
            stroke_color: strokeColor,
            stroke_width: strokeWidth,
            shadow_color: shadowColor,
            shadow_opacity: shadowOpacity,
            shadow_blur: shadowBlur,
            shadow_offset_x: shadowOffsetX,
            shadow_offset_y: shadowOffsetY,
            transitions_enabled: transitionsEnabled,
            transcript_review_enabled: transcriptReviewEnabled,
          },
          transcription_options: {
            provider: transcriptionProvider,
            whisper_chunking_enabled: whisperChunkingEnabled,
            whisper_chunk_duration_seconds: normalizedChunkDuration,
            whisper_chunk_overlap_seconds: normalizedChunkOverlap,
            task_timeout_seconds: normalizedTaskTimeoutSeconds,
            srt_content: srtContent,
          },
          ai_options: {
            provider: aiProvider,
            model: aiModel.trim() || DEFAULT_AI_MODELS[aiProvider],
            prompt_id: selectedPromptId,
            clips_count: clipsCount,
          }
        }),
      });

      if (!startResponse.ok) {
        const responseData = await startResponse.json().catch(() => ({}));
        throw new Error(responseData?.detail || `API error: ${startResponse.status}`);
      }

      const startResult = await startResponse.json();
      const taskIdFromStart = startResult.task_id;

      // Redirect immediately to the task page
      window.location.href = `/tasks/${taskIdFromStart}`;

    } catch (error) {
      console.error('Error processing video:', error);
      setError(error instanceof Error ? error.message : 'Failed to process video. Please try again.');
    } finally {
      setIsLoading(false);
      setProgress(0);
      setStatusMessage("");
      setCurrentStep("");
      setFileName(null);
      fileRef.current = null;
      setUploadUrl("");
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const previewTextStyle: CSSProperties = {
    color: fontColor,
    fontSize: `${fontSize}px`,
    fontFamily: `'${fontFamily}', system-ui, -apple-system, sans-serif`,
    fontWeight,
    textAlign,
    lineHeight,
    letterSpacing: `${letterSpacing}px`,
    WebkitTextStroke: strokeWidth > 0 ? `${strokeWidth}px ${strokeColor}` : undefined,
    textShadow:
      shadowOpacity > 0
        ? `${shadowOffsetX}px ${shadowOffsetY}px ${shadowBlur}px ${hexToRgba(shadowColor, shadowOpacity)}`
        : undefined,
  };

  if (isPending) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center p-4">
        <div className="space-y-4">
          <Skeleton className="h-4 w-32 mx-auto" />
          <Skeleton className="h-4 w-48 mx-auto" />
          <Skeleton className="h-4 w-24 mx-auto" />
        </div>
      </div>
    );
  }

  if (!session?.user) {
    return (
      <div className="min-h-screen bg-white">
        <div className="max-w-4xl mx-auto px-4 py-24">
          <div className="text-center mb-16">
            <h1 className="text-5xl font-bold text-black mb-4">
              Teek
            </h1>
            <p className="text-lg text-gray-600 mb-8 max-w-2xl mx-auto">
              Professional video clipping platform powered by AI
            </p>

            <div className="flex gap-4 justify-center mb-16">
              <Link href="/sign-up">
                <Button size="lg" className="px-8 py-3">
                  Get Started
                </Button>
              </Link>
              <Link href="/sign-in">
                <Button variant="outline" size="lg" className="px-8 py-3">
                  Sign In
                </Button>
              </Link>
            </div>
          </div>

          <Separator className="my-16" />

          <div className="grid md:grid-cols-3 gap-8">
            <div className="text-center">
              <h3 className="text-lg font-semibold text-black mb-2">AI Analysis</h3>
              <p className="text-gray-600">
                Advanced content analysis for optimal clip extraction
              </p>
            </div>
            <div className="text-center">
              <h3 className="text-lg font-semibold text-black mb-2">Fast Processing</h3>
              <p className="text-gray-600">
                Enterprise-grade infrastructure for rapid video processing
              </p>
            </div>
            <div className="text-center">
              <h3 className="text-lg font-semibold text-black mb-2">Secure Platform</h3>
              <p className="text-gray-600">
                Enterprise security standards with private processing
              </p>
            </div>
          </div>

          <Separator className="my-16" />

          {/* How It Works Section */}
          <div className="mb-16">
            <h2 className="text-3xl font-bold text-black text-center mb-12">
              How It Works
            </h2>
            <div className="grid md:grid-cols-4 gap-8">
              <div className="text-center">
                <div className="w-12 h-12 rounded-full bg-gray-900 text-white flex items-center justify-center mx-auto mb-4 text-xl font-bold">
                  1
                </div>
                <h4 className="font-semibold text-black mb-2">Upload</h4>
                <p className="text-gray-600 text-sm">
                  Upload your video file or provide a direct video URL to get started
                </p>
              </div>
              <div className="text-center">
                <div className="w-12 h-12 rounded-full bg-gray-900 text-white flex items-center justify-center mx-auto mb-4 text-xl font-bold">
                  2
                </div>
                <h4 className="font-semibold text-black mb-2">AI Analysis</h4>
                <p className="text-gray-600 text-sm">
                  Our AI analyzes your content to identify the most engaging moments
                </p>
              </div>
              <div className="text-center">
                <div className="w-12 h-12 rounded-full bg-gray-900 text-white flex items-center justify-center mx-auto mb-4 text-xl font-bold">
                  3
                </div>
                <h4 className="font-semibold text-black mb-2">Customize</h4>
                <p className="text-gray-600 text-sm">
                  Add subtitles with custom fonts, colors, and styling options
                </p>
              </div>
              <div className="text-center">
                <div className="w-12 h-12 rounded-full bg-gray-900 text-white flex items-center justify-center mx-auto mb-4 text-xl font-bold">
                  4
                </div>
                <h4 className="font-semibold text-black mb-2">Download</h4>
                <p className="text-gray-600 text-sm">
                  Get your viral-ready clips optimized for TikTok, Instagram, and more
                </p>
              </div>
            </div>
          </div>

          <Separator className="my-16" />

          {/* Features Section */}
          <div className="mb-16">
            <h2 className="text-3xl font-bold text-black text-center mb-12">
              Powerful Features
            </h2>
            <div className="grid md:grid-cols-2 gap-8">
              <div className="p-6 rounded-lg border bg-gray-50">
                <h4 className="font-semibold text-black mb-2">Smart Clip Detection</h4>
                <p className="text-gray-600">
                  AI-powered analysis identifies the most viral-worthy moments from your videos automatically.
                </p>
              </div>
              <div className="p-6 rounded-lg border bg-gray-50">
                <h4 className="font-semibold text-black mb-2">Custom Subtitles</h4>
                <p className="text-gray-600">
                  Style your subtitles with custom fonts, colors, strokes, and shadows to match your brand.
                </p>
              </div>
              <div className="p-6 rounded-lg border bg-gray-50">
                <h4 className="font-semibold text-black mb-2">Multi-Platform Ready</h4>
                <p className="text-gray-600">
                  Generate clips optimized for TikTok, Instagram Reels, YouTube Shorts, and more.
                </p>
              </div>
              <div className="p-6 rounded-lg border bg-gray-50">
                <h4 className="font-semibold text-black mb-2">Batch Processing</h4>
                <p className="text-gray-600">
                  Process multiple videos simultaneously and generate dozens of clips in minutes.
                </p>
              </div>
              <div className="p-6 rounded-lg border bg-gray-50">
                <h4 className="font-semibold text-black mb-2">Transcript Editing</h4>
                <p className="text-gray-600">
                  Review and edit transcripts before clip generation for perfect accuracy.
                </p>
              </div>
              <div className="p-6 rounded-lg border bg-gray-50">
                <h4 className="font-semibold text-black mb-2">Cloud Storage</h4>
                <p className="text-gray-600">
                  All your clips are securely stored in the cloud for easy access and sharing.
                </p>
              </div>
            </div>
          </div>

          <Separator className="my-16" />

          {/* Pricing Section */}
          <div className="mb-16">
            <h2 className="text-3xl font-bold text-black text-center mb-4">
              Simple Pricing
            </h2>
            <p className="text-gray-600 text-center mb-12 max-w-xl mx-auto">
              Choose the plan that works best for your content creation needs
            </p>
            <div className="grid md:grid-cols-3 gap-8">
              {/* Free Plan */}
              <div className="p-6 rounded-lg border bg-white">
                <h3 className="text-xl font-semibold text-black mb-2">Free</h3>
                <p className="text-gray-600 text-sm mb-4">Perfect for getting started</p>
                <div className="text-4xl font-bold text-black mb-6">
                  $0<span className="text-lg font-normal text-gray-600">/mo</span>
                </div>
                <ul className="space-y-3 mb-8">
                  <li className="flex items-center gap-2 text-gray-700">
                    <CheckCircle className="w-4 h-4 text-green-500" />
                    5 clips per month
                  </li>
                  <li className="flex items-center gap-2 text-gray-700">
                    <CheckCircle className="w-4 h-4 text-green-500" />
                    720p quality
                  </li>
                  <li className="flex items-center gap-2 text-gray-700">
                    <CheckCircle className="w-4 h-4 text-green-500" />
                    Basic subtitle styles
                  </li>
                  <li className="flex items-center gap-2 text-gray-400">
                    <CheckCircle className="w-4 h-4 text-gray-300" />
                    Teek watermark
                  </li>
                </ul>
                <Link href="/sign-up">
                  <Button variant="outline" className="w-full">
                    Get Started
                  </Button>
                </Link>
              </div>

              {/* Pro Plan */}
              <div className="p-6 rounded-lg border-2 border-gray-900 bg-gray-50 relative">
                <div className="absolute -top-3 left-1/2 transform -translate-x-1/2 bg-gray-900 text-white text-xs font-semibold px-3 py-1 rounded-full">
                  MOST POPULAR
                </div>
                <h3 className="text-xl font-semibold text-black mb-2">Pro</h3>
                <p className="text-gray-600 text-sm mb-4">For serious creators</p>
                <div className="text-4xl font-bold text-black mb-6">
                  $19<span className="text-lg font-normal text-gray-600">/mo</span>
                </div>
                <ul className="space-y-3 mb-8">
                  <li className="flex items-center gap-2 text-gray-700">
                    <CheckCircle className="w-4 h-4 text-green-500" />
                    50 clips per month
                  </li>
                  <li className="flex items-center gap-2 text-gray-700">
                    <CheckCircle className="w-4 h-4 text-green-500" />
                    1080p quality
                  </li>
                  <li className="flex items-center gap-2 text-gray-700">
                    <CheckCircle className="w-4 h-4 text-green-500" />
                    Advanced subtitle styles
                  </li>
                  <li className="flex items-center gap-2 text-gray-700">
                    <CheckCircle className="w-4 h-4 text-green-500" />
                    No watermark
                  </li>
                  <li className="flex items-center gap-2 text-gray-700">
                    <CheckCircle className="w-4 h-4 text-green-500" />
                    Priority processing
                  </li>
                </ul>
                <Link href="/sign-up">
                  <Button className="w-full">Start Free Trial</Button>
                </Link>
              </div>

              {/* Business Plan */}
              <div className="p-6 rounded-lg border bg-white">
                <h3 className="text-xl font-semibold text-black mb-2">Business</h3>
                <p className="text-gray-600 text-sm mb-4">For teams and agencies</p>
                <div className="text-4xl font-bold text-black mb-6">
                  $49<span className="text-lg font-normal text-gray-600">/mo</span>
                </div>
                <ul className="space-y-3 mb-8">
                  <li className="flex items-center gap-2 text-gray-700">
                    <CheckCircle className="w-4 h-4 text-green-500" />
                    Unlimited clips
                  </li>
                  <li className="flex items-center gap-2 text-gray-700">
                    <CheckCircle className="w-4 h-4 text-green-500" />
                    4K quality
                  </li>
                  <li className="flex items-center gap-2 text-gray-700">
                    <CheckCircle className="w-4 h-4 text-green-500" />
                    Custom fonts & branding
                  </li>
                  <li className="flex items-center gap-2 text-gray-700">
                    <CheckCircle className="w-4 h-4 text-green-500" />
                    API access
                  </li>
                  <li className="flex items-center gap-2 text-gray-700">
                    <CheckCircle className="w-4 h-4 text-green-500" />
                    Team collaboration
                  </li>
                </ul>
                <Link href="/sign-up">
                  <Button variant="outline" className="w-full">
                    Contact Sales
                  </Button>
                </Link>
              </div>
            </div>
          </div>

          <Separator className="my-16" />

          {/* CTA Section */}
          <div className="text-center py-12 px-6 rounded-2xl bg-gray-900 text-white">
            <h2 className="text-3xl font-bold mb-4">
              Ready to Create Viral Content?
            </h2>
            <p className="text-lg text-gray-300 mb-8 max-w-xl mx-auto">
              Join thousands of creators who use Teek to transform long videos into engaging short-form content.
            </p>
            <div className="flex gap-4 justify-center">
              <Link href="/sign-up">
                <Button size="lg" className="px-8 py-3 bg-white text-black hover:bg-gray-100">
                  Start Creating Free
                </Button>
              </Link>
              <Link href="/sign-in">
                <Button variant="outline" size="lg" className="px-8 py-3 border-white text-white hover:bg-white/10">
                  Sign In
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white">
      <Header />
      <div className="max-w-4xl mx-auto px-4 py-16">
        <div className="max-w-xl mx-auto">

          <div className="mb-8">
            <h2 className="text-2xl font-bold text-black mb-2">
              Video Processing
            </h2>
            <p className="text-gray-600">
              Upload a video or provide a URL for automated clip generation with customizable fonts
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Source Type Selector */}
            <div className="space-y-2">
              <label htmlFor="source-type" className="text-sm font-medium text-black">
                Source Type
              </label>
              <Select value={sourceType} onValueChange={(value: "upload_file" | "video_url") => {
                setSourceType(value);
                // Reset file input and fileName when switching away from file upload
                if (value !== "upload_file") {
                  setFileName(null);
                  fileRef.current = null;
                  if (fileInputRef.current) {
                    fileInputRef.current.value = "";
                  }
                }
                // Reset upload URL when switching away from video URL
                if (value !== "video_url") {
                  setUploadUrl("");
                }
              }} disabled={isLoading}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select source type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="upload_file">
                    <div className="flex items-center gap-2">
                      <ArrowRight className="w-4 h-4" />
                      Upload File
                    </div>
                  </SelectItem>
                  <SelectItem value="video_url">
                    <div className="flex items-center gap-2">
                      <ArrowRight className="w-4 h-4" />
                      Video URL
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Prompt Type Selector */}
            <div className="space-y-2">
              <label htmlFor="prompt-type" className="text-sm font-medium text-black">
                Clip Style
              </label>
              <Select
                value={selectedPromptId}
                onValueChange={setSelectedPromptId}
                disabled={isLoading || isLoadingPrompts || availablePrompts.length === 0}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder={isLoadingPrompts ? "Loading styles..." : "Select clip style"} />
                </SelectTrigger>
                <SelectContent>
                  {availablePrompts.map((prompt) => (
                    <SelectItem key={prompt.id} value={prompt.id}>
                      <div className="flex flex-col items-start">
                        <span className="font-medium">{prompt.name}</span>
                        <span className="text-xs text-gray-500">{prompt.description}</span>
                      </div>
                    </SelectItem>
                  ))}
                  {availablePrompts.length === 0 && (
                    <SelectItem value="default">
                      <div className="flex flex-col items-start">
                        <span className="font-medium">Social Media Clips</span>
                        <span className="text-xs text-gray-500">General-purpose clips optimized for social media engagement</span>
                      </div>
                    </SelectItem>
                  )}
                </SelectContent>
              </Select>
              <p className="text-xs text-gray-500">
                Choose the type of clips you want to generate. This affects how the AI selects segments.
              </p>
            </div>

            {/* Clips Count Selector */}
            <div className="space-y-2">
              <label htmlFor="clips-count" className="text-sm font-medium text-black">
                Number of Clips
              </label>
              <div className="px-2 pt-5">
                <Slider
                  id="clips-count"
                  value={[clipsCount]}
                  onValueChange={(value) => setClipsCount(Math.max(MIN_CLIPS_COUNT, Math.min(MAX_CLIPS_COUNT, value[0])))}
                  min={MIN_CLIPS_COUNT}
                  max={MAX_CLIPS_COUNT}
                  step={1}
                  disabled={isLoading}
                  className="w-full"
                />
              </div>
              <div className="flex justify-between text-xs text-gray-500">
                <span>{MIN_CLIPS_COUNT} clip</span>
                <span className="font-medium text-black">{clipsCount} clips</span>
                <span>{MAX_CLIPS_COUNT} clips</span>
              </div>
              <p className="text-xs text-gray-500">
                How many clips should the AI try to generate from this video.
              </p>
            </div>

            {/* Dynamic Input Based on Source Type */}
            {sourceType === "upload_file" ? (
              <div key="source-upload-file" className="space-y-2">
                <label className="text-sm font-medium text-black">
                  Upload Video File
                </label>
                <input
                  id="video-upload"
                  type="file"
                  accept="video/*,video/x-matroska,.mkv"
                  ref={fileInputRef}
                  onChange={handleFileChange}
                  disabled={isLoading}
                  className="hidden"
                />
                <div
                  onClick={handleDropZoneClick}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  className={`relative border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
                    isDragOver
                      ? "border-blue-500 bg-blue-50"
                      : fileName
                        ? "border-green-500 bg-green-50"
                        : "border-gray-300 bg-gray-50 hover:border-gray-400 hover:bg-gray-100"
                  } ${isLoading ? "opacity-50 cursor-not-allowed" : ""}`}
                >
                  {fileName ? (
                    <div className="space-y-2">
                      <div className="flex items-center justify-center gap-2 text-green-700">
                        <CheckCircle className="w-5 h-5" />
                        <span className="font-medium">{fileName}</span>
                      </div>
                      <p className="text-xs text-gray-500">
                        Click or drag another file to replace
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <div className="flex justify-center">
                        <div className="w-12 h-12 rounded-full bg-gray-200 flex items-center justify-center">
                          <Upload className="w-6 h-6 text-gray-600" />
                        </div>
                      </div>
                      <div>
                        <p className="text-sm font-medium text-gray-700">
                          Drop your video here, or click to browse
                        </p>
                        <p className="text-xs text-gray-500 mt-1">
                          Supports MP4, MOV, MKV, and other video formats
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div key="source-video-url" className="space-y-2">
                <label htmlFor="video-url" className="text-sm font-medium text-black">
                  Video URL
                </label>
                <Input
                  id="video-url"
                  type="url"
                  placeholder="https://example.com/video.mp4"
                  value={uploadUrl}
                  onChange={(e) => setUploadUrl(e.target.value)}
                  disabled={isLoading}
                  className="h-11"
                />
                <p className="text-xs text-gray-500">
                  Direct link to video file (MP4, MOV, MKV, etc.)
                </p>
              </div>
            )}

            {/* Transcript Review Option */}
            <div className="pt-2">
              <div className="flex items-start gap-3">
                <input
                  type="checkbox"
                  id="transcript-review"
                  checked={transcriptReviewEnabled}
                  onChange={(e) => setTranscriptReviewEnabled(e.target.checked)}
                  disabled={isLoading}
                  className="mt-0.5 w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <div>
                  <label htmlFor="transcript-review" className="text-sm font-medium text-black cursor-pointer">
                    Review and edit transcript before generating clips
                  </label>
                  <p className="text-xs text-gray-500 mt-1">
                    When enabled, you&apos;ll be able to review and edit the transcript before the AI generates clips.
                  </p>
                </div>
              </div>
            </div>

            {/* Custom SRT Upload Option */}
            <div className="pt-2">
              <div className="flex items-start gap-3">
                <input
                  type="checkbox"
                  id="use-custom-srt"
                  checked={useCustomSrt}
                  onChange={(e) => {
                    setUseCustomSrt(e.target.checked);
                    if (!e.target.checked) {
                      setSrtFile(null);
                      setSrtFileName(null);
                      if (srtInputRef.current) {
                        srtInputRef.current.value = "";
                      }
                    }
                  }}
                  disabled={isLoading}
                  className="mt-0.5 w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <div className="flex-1">
                  <label htmlFor="use-custom-srt" className="text-sm font-medium text-black cursor-pointer">
                    Use my own SRT subtitle file
                  </label>
                  <p className="text-xs text-gray-500 mt-1">
                    Skip AI transcription and use your own subtitle file instead.
                  </p>

                  {useCustomSrt && (
                    <div className="mt-3 space-y-2">
                      <input
                        id="srt-upload"
                        type="file"
                        accept=".srt"
                        ref={srtInputRef}
                        onChange={handleSrtFileChange}
                        disabled={isLoading}
                        className="hidden"
                      />
                      <div
                        onClick={() => srtInputRef.current?.click()}
                        className={`relative border-2 border-dashed rounded-lg p-4 text-center cursor-pointer transition-colors ${
                          srtFileName
                            ? "border-green-500 bg-green-50"
                            : "border-gray-300 bg-gray-50 hover:border-gray-400 hover:bg-gray-100"
                        } ${isLoading ? "opacity-50 cursor-not-allowed" : ""}`}
                      >
                        {srtFileName ? (
                          <div className="space-y-1">
                            <div className="flex items-center justify-center gap-2 text-green-700">
                              <FileText className="w-4 h-4" />
                              <span className="font-medium text-sm">{srtFileName}</span>
                            </div>
                            <p className="text-xs text-gray-500">
                              Click to replace
                            </p>
                          </div>
                        ) : (
                          <div className="space-y-1">
                            <div className="flex justify-center">
                              <FileText className="w-5 h-5 text-gray-400" />
                            </div>
                            <p className="text-sm text-gray-600">
                              Click to upload SRT file
                            </p>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {!useCustomSrt && (
                    <div className="mt-3 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                      <p className="text-xs text-amber-800">
                        Warning: AI-generated transcripts will consume significant tokens and may increase processing costs.
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Font Customization Section */}
            <div className="space-y-4 border rounded-lg p-4 bg-gray-50">
              <div
                className="flex items-center justify-between cursor-pointer"
                onClick={() => setShowAdvancedOptions(!showAdvancedOptions)}
              >
                <div className="flex items-center gap-2">
                  <Paintbrush className="w-4 h-4" />
                  <h3 className="text-sm font-medium text-black">Font & Style Options</h3>
                </div>
                <button type="button" className="text-xs text-gray-500">
                  {showAdvancedOptions ? "Hide" : "Show"}
                </button>
              </div>

              {showAdvancedOptions && (
                <div className="space-y-4 pt-2">
                  {/* Font Family Selector */}
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-black flex items-center gap-2">
                      <Type className="w-4 h-4" />
                      Font Family
                    </label>
                    <Select value={fontFamily} onValueChange={setFontFamily} disabled={isLoading}>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Select font" />
                      </SelectTrigger>
                      <SelectContent>
                        {availableFonts.map((font) => (
                          <SelectItem key={font.name} value={font.name}>
                            {font.display_name}
                          </SelectItem>
                        ))}
                        {availableFonts.length === 0 && (
                          <SelectItem value="TikTokSans-Regular">TikTok Sans Regular</SelectItem>
                        )}
                      </SelectContent>
                    </Select>
                    <input
                      type="file"
                      accept=".ttf,font/ttf"
                      onChange={handleFontUpload}
                      disabled={isLoading || isUploadingFont}
                      className="file:text-foreground placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground dark:bg-input/30 border-input flex h-9 w-full min-w-0 rounded-md border bg-transparent px-3 py-1 text-sm shadow-xs transition-[color,box-shadow] outline-none file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive"
                    />
                    <p className="text-xs text-gray-500">
                      {isUploadingFont ? 'Uploading font...' : 'Upload a .ttf file to add it to this list.'}
                    </p>
                    {fontUploadMessage && <p className="text-xs text-green-600">{fontUploadMessage}</p>}
                    {fontUploadError && <p className="text-xs text-red-600">{fontUploadError}</p>}
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium text-black">Font Size: {fontSize}px</label>
                    <div className="px-2 pt-5">
                      <Slider
                        value={[fontSize]}
                        onValueChange={(value) => setFontSize(normalizeFontSize(value[0]))}
                        max={48}
                        min={24}
                        step={1}
                        disabled={isLoading}
                        className="w-full"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium text-black">Font Weight: {fontWeight}</label>
                    <div className="px-2 pt-5">
                      <Slider
                        value={[fontWeight]}
                        onValueChange={(value) => setFontWeight(normalizeFontWeight(value[0]))}
                        max={900}
                        min={300}
                        step={100}
                        disabled={isLoading}
                        className="w-full"
                      />
                    </div>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-black">Line Height: {lineHeight.toFixed(1)}</label>
                      <div className="px-2 pt-5">
                        <Slider
                          value={[lineHeight]}
                          onValueChange={(value) => setLineHeight(normalizeLineHeight(value[0]))}
                          min={1}
                          max={2}
                          step={0.1}
                          disabled={isLoading}
                          className="w-full"
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-black">Letter Spacing: {letterSpacing}px</label>
                      <div className="px-2 pt-5">
                        <Slider
                          value={[letterSpacing]}
                          onValueChange={(value) => setLetterSpacing(normalizeLetterSpacing(value[0]))}
                          min={0}
                          max={6}
                          step={1}
                          disabled={isLoading}
                          className="w-full"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-black">Text Transform</label>
                      <Select
                        value={textTransform}
                        onValueChange={(value) => setTextTransform(value as TextTransformOption)}
                        disabled={isLoading}
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Select transform" />
                        </SelectTrigger>
                        <SelectContent>
                          {TEXT_TRANSFORM_OPTIONS.map((option) => (
                            <SelectItem key={option} value={option}>
                              {formatTextOption(option)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-black">Text Align</label>
                      <Select
                        value={textAlign}
                        onValueChange={(value) => setTextAlign(value as TextAlignOption)}
                        disabled={isLoading}
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Select alignment" />
                        </SelectTrigger>
                        <SelectContent>
                          {TEXT_ALIGN_OPTIONS.map((option) => (
                            <SelectItem key={option} value={option}>
                              {formatTextOption(option)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium text-black flex items-center gap-2">
                      <Palette className="w-4 h-4" />
                      Font Color
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        value={fontColor}
                        onChange={(e) => setFontColor(e.target.value)}
                        disabled={isLoading}
                        className="w-12 h-8 rounded border border-gray-300 cursor-pointer disabled:cursor-not-allowed"
                      />
                      <Input
                        type="text"
                        value={fontColor}
                        onChange={(e) => setFontColor(e.target.value)}
                        disabled={isLoading}
                        placeholder="#FFFFFF"
                        className="flex-1 h-8"
                        pattern="^#[0-9A-Fa-f]{6}$"
                      />
                    </div>
                    <div className="flex gap-2 mt-2">
                      {SWATCH_COLORS.map((color) => (
                        <button
                          key={color}
                          type="button"
                          onClick={() => setFontColor(color)}
                          disabled={isLoading}
                          className="w-6 h-6 rounded border-2 border-gray-300 cursor-pointer hover:scale-110 transition-transform disabled:cursor-not-allowed"
                          style={{ backgroundColor: color }}
                          title={color}
                        />
                      ))}
                    </div>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-black">Stroke Color</label>
                      <div className="flex items-center gap-2">
                        <input
                          type="color"
                          value={strokeColor}
                          onChange={(e) => setStrokeColor(e.target.value)}
                          disabled={isLoading}
                          className="w-12 h-8 rounded border border-gray-300 cursor-pointer disabled:cursor-not-allowed"
                        />
                        <Input
                          type="text"
                          value={strokeColor}
                          onChange={(e) => setStrokeColor(e.target.value)}
                          disabled={isLoading}
                          placeholder="#000000"
                          className="flex-1 h-8"
                          pattern="^#[0-9A-Fa-f]{6}$"
                        />
                      </div>
                      <div className="flex gap-2 mt-2">
                        {SWATCH_COLORS.map((color) => (
                          <button
                            key={color}
                            type="button"
                            onClick={() => setStrokeColor(color)}
                            disabled={isLoading}
                            className="w-6 h-6 rounded border-2 border-gray-300 cursor-pointer hover:scale-110 transition-transform disabled:cursor-not-allowed"
                            style={{ backgroundColor: color }}
                            title={color}
                          />
                        ))}
                      </div>
                    </div>

                    <div className="space-y-2">
                      <label className="text-sm font-medium text-black">Stroke Width: {strokeWidth}px</label>
                      <div className="px-2 pt-5">
                        <Slider
                          value={[strokeWidth]}
                          onValueChange={(value) => setStrokeWidth(normalizeStrokeWidth(value[0]))}
                          min={0}
                          max={8}
                          step={1}
                          disabled={isLoading}
                          className="w-full"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-black">Shadow Color</label>
                      <div className="flex items-center gap-2">
                        <input
                          type="color"
                          value={shadowColor}
                          onChange={(e) => setShadowColor(e.target.value)}
                          disabled={isLoading}
                          className="w-12 h-8 rounded border border-gray-300 cursor-pointer disabled:cursor-not-allowed"
                        />
                        <Input
                          type="text"
                          value={shadowColor}
                          onChange={(e) => setShadowColor(e.target.value)}
                          disabled={isLoading}
                          placeholder="#000000"
                          className="flex-1 h-8"
                          pattern="^#[0-9A-Fa-f]{6}$"
                        />
                      </div>
                      <div className="flex gap-2 mt-2">
                        {SWATCH_COLORS.map((color) => (
                          <button
                            key={color}
                            type="button"
                            onClick={() => setShadowColor(color)}
                            disabled={isLoading}
                            className="w-6 h-6 rounded border-2 border-gray-300 cursor-pointer hover:scale-110 transition-transform disabled:cursor-not-allowed"
                            style={{ backgroundColor: color }}
                            title={color}
                          />
                        ))}
                      </div>
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-black">
                        Shadow Opacity: {Math.round(shadowOpacity * 100)}%
                      </label>
                      <div className="px-2 pt-5">
                        <Slider
                          value={[shadowOpacity]}
                          onValueChange={(value) => setShadowOpacity(normalizeShadowOpacity(value[0]))}
                          min={0}
                          max={1}
                          step={0.05}
                          disabled={isLoading}
                          className="w-full"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-3">
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-black">Shadow Blur: {shadowBlur}px</label>
                      <div className="px-2 pt-5">
                        <Slider
                          value={[shadowBlur]}
                          onValueChange={(value) => setShadowBlur(normalizeShadowBlur(value[0]))}
                          min={0}
                          max={8}
                          step={1}
                          disabled={isLoading}
                          className="w-full"
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-black">Shadow X: {shadowOffsetX}px</label>
                      <div className="px-2 pt-5">
                        <Slider
                          value={[shadowOffsetX]}
                          onValueChange={(value) => setShadowOffsetX(normalizeShadowOffset(value[0]))}
                          min={-12}
                          max={12}
                          step={1}
                          disabled={isLoading}
                          className="w-full"
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-black">Shadow Y: {shadowOffsetY}px</label>
                      <div className="px-2 pt-5">
                        <Slider
                          value={[shadowOffsetY]}
                          onValueChange={(value) => setShadowOffsetY(normalizeShadowOffset(value[0]))}
                          min={-12}
                          max={12}
                          step={1}
                          disabled={isLoading}
                          className="w-full"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 p-3 rounded-lg bg-gray-100 border border-gray-300" style={{ backgroundImage: "linear-gradient(45deg, #ccc 25%, transparent 25%), linear-gradient(-45deg, #ccc 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #ccc 75%), linear-gradient(-45deg, transparent 75%, #ccc 75%)", backgroundSize: "20px 20px", backgroundPosition: "0 0, 0 10px, 10px -10px, -10px 0px" }}>
                    <p style={previewTextStyle} className="w-full">
                      Preview: {applyTextTransform("Your subtitle will look like this", textTransform)}
                    </p>
                  </div>

                  {/* Transitions Toggle */}
                  <div className="pt-4 border-t border-gray-200">
                    <div className="flex items-start gap-3">
                      <input
                        type="checkbox"
                        id="transitions-enabled"
                        checked={transitionsEnabled}
                        onChange={(e) => setTransitionsEnabled(e.target.checked)}
                        disabled={isLoading}
                        className="mt-0.5 w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      />
                      <div>
                        <label htmlFor="transitions-enabled" className="text-sm font-medium text-black cursor-pointer">
                          Enable transitions between clips
                        </label>
                        <p className="text-xs text-gray-500 mt-1">
                          When enabled, clips will have smooth transitions applied between them during final video assembly.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {isLoading && (
              <div className="space-y-4">
                {/*
                  Upload flow should only show upload progress on this page.
                  Pipeline stage progress is shown on the task details page after redirect.
                */}
                {sourceType === "upload_file" && currentStep === "upload" ? (
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600">Upload</span>
                      <span className="text-black">{progress}%</span>
                    </div>
                    <Progress value={progress} className="h-2" />
                    {statusMessage && (
                      <p className="text-sm text-black">{statusMessage}</p>
                    )}
                  </div>
                ) : (
                  <>
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Processing</span>
                    <span className="text-black">{progress}%</span>
                  </div>
                  <Progress value={progress} className="h-2" />
                </div>

                {/* Detailed Status Display */}
                {currentStep && statusMessage && (
                  <div className="bg-gray-50 rounded-lg p-4 space-y-3">
                    <div className="flex items-center gap-3">
                      {getStepIcon(currentStep)}
                      <div className="flex-1">
                        <p className="text-sm font-medium text-black">{statusMessage}</p>
                        {sourceTitle && (
                          <p className="text-xs text-gray-500 mt-1">Processing: {sourceTitle}</p>
                        )}
                      </div>
                    </div>

                    {/* Step Progress Indicator */}
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div className={`flex items-center gap-2 p-2 rounded ${currentStep === 'validation' || currentStep === 'user_check' ? 'bg-blue-100' : progress > 15 ? 'bg-green-100' : 'bg-gray-100'}`}>
                        <CheckCircle className={`w-3 h-3 ${progress > 15 ? 'text-green-500' : 'text-gray-400'}`} />
                        <span className={progress > 15 ? 'text-green-700' : 'text-gray-600'}>Validation</span>
                      </div>
                      <div className={`flex items-center gap-2 p-2 rounded ${currentStep === 'download' || currentStep === 'youtube_info' ? 'bg-green-100' : progress > 30 ? 'bg-green-100' : 'bg-gray-100'}`}>
                        <CheckCircle className={`w-3 h-3 ${progress > 30 ? 'text-green-500' : 'text-gray-400'}`} />
                        <span className={progress > 30 ? 'text-green-700' : 'text-gray-600'}>Download</span>
                      </div>
                      <div className={`flex items-center gap-2 p-2 rounded ${currentStep === 'transcript' ? 'bg-purple-100' : progress > 45 ? 'bg-green-100' : 'bg-gray-100'}`}>
                        <CheckCircle className={`w-3 h-3 ${progress > 45 ? 'text-green-500' : 'text-gray-400'}`} />
                        <span className={progress > 45 ? 'text-green-700' : 'text-gray-600'}>Transcript</span>
                      </div>
                      <div className={`flex items-center gap-2 p-2 rounded ${currentStep === 'ai_analysis' ? 'bg-orange-100' : progress > 60 ? 'bg-green-100' : 'bg-gray-100'}`}>
                        <CheckCircle className={`w-3 h-3 ${progress > 60 ? 'text-green-500' : 'text-gray-400'}`} />
                        <span className={progress > 60 ? 'text-green-700' : 'text-gray-600'}>AI Analysis</span>
                      </div>
                      <div className={`flex items-center gap-2 p-2 rounded ${currentStep === 'clip_generation' ? 'bg-indigo-100' : progress > 75 ? 'bg-green-100' : 'bg-gray-100'}`}>
                        <CheckCircle className={`w-3 h-3 ${progress > 75 ? 'text-green-500' : 'text-gray-400'}`} />
                        <span className={progress > 75 ? 'text-green-700' : 'text-gray-600'}>Create Clips</span>
                      </div>
                      <div className={`flex items-center gap-2 p-2 rounded ${currentStep === 'complete' ? 'bg-green-100' : progress >= 100 ? 'bg-green-100' : 'bg-gray-100'}`}>
                        <CheckCircle className={`w-3 h-3 ${progress >= 100 ? 'text-green-500' : 'text-gray-400'}`} />
                        <span className={progress >= 100 ? 'text-green-700' : 'text-gray-600'}>Complete</span>
                      </div>
                    </div>
                  </div>
                )}
                  </>
                )}
              </div>
            )}

            {error && (
              <Alert className="mt-6 border-red-200 bg-red-50">
                <AlertCircle className="h-4 w-4 text-red-500" />
                <AlertDescription className="text-sm text-red-700">
                  {error}
                </AlertDescription>
              </Alert>
            )}

            <Button
              type="submit"
              className="w-full h-11"
              disabled={
                (sourceType === "youtube" && !url.trim()) ||
                (sourceType === "upload_file" && !fileRef.current) ||
                (sourceType === "video_url" && !uploadUrl.trim()) ||
                isLoading
              }
            >
              {isLoading ? "Processing..." : "Process Video"}
            </Button>

            {((sourceType === "youtube" && url) || (sourceType === "upload_file" && fileName) || (sourceType === "video_url" && uploadUrl)) && !isLoading && (
              <Alert className="mt-6">
                <AlertDescription className="text-sm">
                  Ready to process: {sourceType === "youtube"
                    ? (url.length > 50 ? url.substring(0, 50) + "..." : url)
                    : sourceType === "upload_file"
                      ? fileName
                      : (uploadUrl.length > 50 ? uploadUrl.substring(0, 50) + "..." : uploadUrl)
                  }
                </AlertDescription>
              </Alert>
            )}
          </form>

          {/* Latest Generation Preview */}
          {latestTask && (
            <div className="mt-8">
              <Separator className="my-8" />
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-black">Latest Generation</h2>
                <Link href="/list">
                  <Button variant="ghost" size="sm" className="text-blue-600 hover:text-blue-700">
                    See All <ArrowRight className="w-4 h-4 ml-1" />
                  </Button>
                </Link>
              </div>

              <Link href={`/tasks/${latestTask.id}`}>
                <Card className="hover:shadow-md transition-shadow cursor-pointer">
                  <CardContent className="p-6">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <h3 className="text-lg font-semibold text-black mb-2 truncate">
                          {latestTask.source_title}
                        </h3>
                        <div className="flex flex-wrap items-center gap-3 text-sm text-gray-600">
                          <Badge variant="outline" className="capitalize">
                            {latestTask.source_type}
                          </Badge>
                          <span className="flex items-center gap-1">
                            <Clock className="w-4 h-4" />
                            {new Date(latestTask.created_at).toLocaleDateString()}
                          </span>
                          <span>
                            {latestTask.clips_count} {latestTask.clips_count === 1 ? "clip" : "clips"}
                          </span>
                        </div>
                      </div>
                      <div className="flex-shrink-0">
                        {latestTask.status === "completed" ? (
                          <Badge className="bg-green-100 text-green-800">
                            <CheckCircle className="w-3 h-3 mr-1" />
                            Completed
                          </Badge>
                        ) : latestTask.status === "processing" ? (
                          <Badge className="bg-blue-100 text-blue-800">
                            <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                            Processing
                          </Badge>
                        ) : (
                          <Badge variant="outline">{latestTask.status}</Badge>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            </div>
          )}

          {isLoadingLatest && (
            <div className="mt-8">
              <Separator className="my-8" />
              <Skeleton className="h-5 w-32 mb-4" />
              <Card>
                <CardContent className="p-6">
                  <Skeleton className="h-5 w-64 mb-2" />
                  <Skeleton className="h-4 w-48" />
                </CardContent>
              </Card>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
