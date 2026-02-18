"use client";

import { useState, useRef, useEffect, type ChangeEvent } from "react";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { useSession } from "@/lib/auth-client";
import { Header } from "@/components/header";
import { AlertCircle, Loader2 } from "lucide-react";
import { LandingPage } from "@/components/home/LandingPage";
import { SourceSection } from "@/components/home/SourceSection";
import { ClipSettingsSection } from "@/components/home/ClipSettingsSection";
import { CaptionSettingsSection } from "@/components/home/CaptionSettingsSection";
import { ProcessingStatus } from "@/components/home/ProcessingStatus";
import { LatestTaskCard } from "@/components/home/LatestTaskCard";
import { useFonts } from "@/hooks/useFonts";
import { useUserPreferences } from "@/hooks/useUserPreferences";
import { usePrompts } from "@/hooks/usePrompts";
import { useLatestTask } from "@/hooks/useLatestTask";
import { DEFAULT_AI_MODELS, clampInteger } from "@/lib/utils";

const DEFAULT_WHISPER_CHUNKING_ENABLED = true;
const DEFAULT_WHISPER_CHUNK_DURATION_SECONDS = 1200;
const DEFAULT_WHISPER_CHUNK_OVERLAP_SECONDS = 8;
const DEFAULT_TASK_TIMEOUT_SECONDS = 21600;
const MAX_TASK_TIMEOUT_SECONDS = 86400;
const MIN_TASK_TIMEOUT_SECONDS = 300;

interface TranscriptionLimitsResponse {
  worker_timeout_cap_seconds?: unknown;
}

export default function Home() {
  const { data: session, isPending } = useSession();
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

  // Loading and processing states
  const [isLoading, setIsLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [statusMessage, setStatusMessage] = useState("");
  const [currentStep, setCurrentStep] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sourceTitle, setSourceTitle] = useState<string | null>(null);

  // Source input state
  const [sourceType, setSourceType] = useState<"upload_file" | "video_url">("upload_file");
  const [uploadUrl, setUploadUrl] = useState("");
  const [fileName, setFileName] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);

  // File refs
  const fileRef = useRef<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // SRT file state
  const [srtFile, setSrtFile] = useState<File | null>(null);
  const [srtFileName, setSrtFileName] = useState<string | null>(null);
  const srtInputRef = useRef<HTMLInputElement | null>(null);

  // User plan state
  const [userPlan, setUserPlan] = useState<string | null>(null);
  const [useAiTranscription, setUseAiTranscription] = useState(false);

  // Task timeout cap
  const [taskTimeoutCapSeconds, setTaskTimeoutCapSeconds] = useState(MAX_TASK_TIMEOUT_SECONDS);

  // Custom hooks
  const {
    availableFonts,
    isUploading: isUploadingFont,
    uploadMessage: fontUploadMessage,
    uploadError: fontUploadError,
    loadFonts,
    uploadFont,
  } = useFonts({ apiUrl });

  const { preferences, setPreferences } = useUserPreferences({
    userId: session?.user?.id,
    taskTimeoutCapSeconds,
  });

  const { prompts, selectedPromptId, setSelectedPromptId, isLoading: isLoadingPrompts } = usePrompts({
    apiUrl,
    userId: session?.user?.id,
  });

  const { task: latestTask, isLoading: isLoadingLatestTask } = useLatestTask({
    apiUrl,
    userId: session?.user?.id,
  });

  // Load fonts on mount
  useEffect(() => {
    void loadFonts();
  }, [loadFonts]);

  // Load transcription limits
  useEffect(() => {
    const loadTranscriptionLimits = async () => {
      if (!session?.user?.id) return;
      try {
        const response = await fetch(`${apiUrl}/tasks/transcription-settings`, {
          headers: { user_id: session.user.id },
        });
        if (!response.ok) return;
        const data: TranscriptionLimitsResponse = await response.json();
        const cap = clampInteger(
          data.worker_timeout_cap_seconds,
          MAX_TASK_TIMEOUT_SECONDS,
          MIN_TASK_TIMEOUT_SECONDS,
          MAX_TASK_TIMEOUT_SECONDS
        );
        setTaskTimeoutCapSeconds(cap);
      } catch (limitError) {
        console.error("Failed to load transcription limits:", limitError);
      }
    };
    void loadTranscriptionLimits();
  }, [apiUrl, session?.user?.id]);

  // Load user plan
  useEffect(() => {
    const fetchUserPlan = async () => {
      if (!session?.user?.id) return;
      try {
        const response = await fetch(`${apiUrl}/tasks/subscription/usage`, {
          headers: { user_id: session.user.id },
        });
        if (response.ok) {
          const data = await response.json();
          setUserPlan(data.plan);
        }
      } catch (error) {
        console.error("Failed to load user plan:", error);
      }
    };
    void fetchUserPlan();
  }, [apiUrl, session?.user?.id]);

  // Handlers
  const handleFontUpload = async (file: File) => {
    const fontName = await uploadFont(file);
    if (fontName) {
      setPreferences({ fontFamily: fontName });
    }
  };

  const normalizeWhisperChunkDurationSecondsOnForm = (value: unknown): number => {
    return clampInteger(value, DEFAULT_WHISPER_CHUNK_DURATION_SECONDS, 300, 3600);
  };

  const normalizeWhisperChunkOverlapSecondsOnForm = (
    value: unknown,
    chunkDurationSeconds: number
  ): number => {
    const boundedByDuration = Math.max(0, chunkDurationSeconds - 1);
    const maxAllowed = Math.min(120, boundedByDuration);
    return clampInteger(value, DEFAULT_WHISPER_CHUNK_OVERLAP_SECONDS, 0, maxAllowed);
  };

  const normalizeTaskTimeoutSecondsOnForm = (value: unknown, timeoutCapSeconds: number): number => {
    const maxAllowed = Math.max(MIN_TASK_TIMEOUT_SECONDS, Math.min(MAX_TASK_TIMEOUT_SECONDS, timeoutCapSeconds));
    return clampInteger(value, DEFAULT_TASK_TIMEOUT_SECONDS, MIN_TASK_TIMEOUT_SECONDS, maxAllowed);
  };

  const uploadVideoWithProgress = (file: File): Promise<{ video_path?: string; message?: string }> => {
    return new Promise((resolve, reject) => {
      const formData = new FormData();
      formData.append("video", file);

      const xhr = new XMLHttpRequest();
      xhr.open("POST", `${apiUrl}/upload`);

      xhr.upload.onprogress = (event) => {
        if (!event.lengthComputable || event.total <= 0) return;
        const uploadPercent = Math.round((event.loaded / event.total) * 100);
        const progressValue = Math.max(5, Math.min(95, Math.round(uploadPercent * 0.95)));
        setProgress(progressValue);
        setStatusMessage(`Uploading video file... ${uploadPercent}%`);
      };

      xhr.onload = () => {
        if (xhr.status < 200 || xhr.status >= 300) {
          let detail = xhr.responseText || `HTTP ${xhr.status}`;
          try {
            const parsed = JSON.parse(xhr.responseText) as { detail?: string };
            if (parsed?.detail) detail = parsed.detail;
          } catch {
            // Keep raw response text when JSON parsing fails
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

      xhr.onerror = () => reject(new Error("Upload error: network failure"));
      xhr.send(formData);
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
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

      // Read SRT file content if not using AI transcription
      if (!useAiTranscription && srtFile) {
        srtContent = await srtFile.text();
      }

      const normalizedChunkDuration = normalizeWhisperChunkDurationSecondsOnForm(
        preferences.whisperChunkDurationSeconds
      );
      const normalizedChunkOverlap = normalizeWhisperChunkOverlapSecondsOnForm(
        preferences.whisperChunkOverlapSeconds,
        normalizedChunkDuration
      );
      const normalizedTaskTimeoutSeconds = normalizeTaskTimeoutSecondsOnForm(
        preferences.taskTimeoutSeconds,
        taskTimeoutCapSeconds
      );

      const startResponse = await fetch(`${apiUrl}/tasks/`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          user_id: session.user.id,
        },
        body: JSON.stringify({
          source: { url: videoUrl, title: null },
          font_options: {
            font_family: preferences.fontFamily,
            font_size: preferences.fontSize,
            font_color: preferences.fontColor,
            font_weight: preferences.fontWeight,
            line_height: preferences.lineHeight,
            letter_spacing: preferences.letterSpacing,
            text_transform: preferences.textTransform,
            text_align: preferences.textAlign,
            stroke_color: preferences.strokeColor,
            stroke_width: preferences.strokeWidth,
            shadow_color: preferences.shadowColor,
            shadow_opacity: preferences.shadowOpacity,
            shadow_blur: preferences.shadowBlur,
            shadow_offset_x: preferences.shadowOffsetX,
            shadow_offset_y: preferences.shadowOffsetY,
            transitions_enabled: preferences.transitionsEnabled,
            transcript_review_enabled: true, // Always enable by default
          },
          transcription_options: {
            provider: preferences.transcriptionProvider,
            whisper_chunking_enabled: DEFAULT_WHISPER_CHUNKING_ENABLED,
            whisper_chunk_duration_seconds: normalizedChunkDuration,
            whisper_chunk_overlap_seconds: normalizedChunkOverlap,
            task_timeout_seconds: normalizedTaskTimeoutSeconds,
            srt_content: srtContent,
          },
          ai_options: {
            provider: preferences.aiProvider,
            model: preferences.aiModel.trim() || DEFAULT_AI_MODELS[preferences.aiProvider],
            prompt_id: selectedPromptId,
            clips_count: 5, // Default clips count
          },
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
      console.error("Error processing video:", error);
      setError(error instanceof Error ? error.message : "Failed to process video. Please try again.");
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

  // Loading state
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

  // Unauthenticated landing page
  if (!session?.user) {
    return <LandingPage />;
  }

  // Authenticated form
  return (
    <div className="min-h-screen bg-white">
      <Header />
      <div className="max-w-4xl mx-auto px-4 py-16">
        <div className="max-w-xl mx-auto">
          <div className="mb-8">
            <h2 className="text-2xl font-bold text-black mb-2">Video Processing</h2>
            <p className="text-gray-600">
              Upload a video or provide a URL for automated clip generation with customizable fonts
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            {/* SECTION 1: Source & Subtitles */}
            <SourceSection
              sourceType={sourceType}
              setSourceType={setSourceType}
              fileName={fileName}
              fileRef={fileRef}
              fileInputRef={fileInputRef}
              uploadUrl={uploadUrl}
              setUploadUrl={setUploadUrl}
              srtFileName={srtFileName}
              srtInputRef={srtInputRef}
              setSrtFile={setSrtFile}
              setSrtFileName={setSrtFileName}
              isDragOver={isDragOver}
              setIsDragOver={setIsDragOver}
              isLoading={isLoading}
              setError={setError}
            />

            {/* AI Transcription Option */}
            <div className="pt-2">
              <div className="flex items-start gap-3">
                <input
                  type="checkbox"
                  id="use-ai-transcription"
                  checked={useAiTranscription}
                  onChange={(e) => setUseAiTranscription(e.target.checked)}
                  disabled={isLoading || userPlan === "free"}
                  className="mt-0.5 w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
                />
                <div className="flex-1">
                  <label
                    htmlFor="use-ai-transcription"
                    className={`text-sm font-medium text-black cursor-pointer ${
                      userPlan === "free" ? "opacity-50" : ""
                    }`}
                  >
                    Use AI generated subtitle (transcript)
                  </label>
                  <p className="text-xs text-gray-500 mt-1">
                    {userPlan === "free"
                      ? "Upgrade to a paid plan to use AI-generated subtitles."
                      : "Enable AI transcription instead of uploading your own SRT file."}
                  </p>
                  {useAiTranscription && (
                    <div className="mt-3 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                      <p className="text-xs text-amber-800">
                        Warning: AI-generated transcripts will consume transcription minutes from your plan.
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="border-t border-gray-200" />

            {/* SECTION 2: Clip Settings */}
            <ClipSettingsSection
              clipsCount={5}
              setClipsCount={() => {}}
              selectedPromptId={selectedPromptId}
              setSelectedPromptId={setSelectedPromptId}
              availablePrompts={prompts}
              transcriptReviewEnabled={true}
              setTranscriptReviewEnabled={() => {}}
              isLoadingPrompts={isLoadingPrompts}
              isLoading={isLoading}
            />

            <div className="border-t border-gray-200" />

            {/* SECTION 3: Caption Settings */}
            <CaptionSettingsSection
              fontFamily={preferences.fontFamily}
              setFontFamily={(fontFamily) => setPreferences({ fontFamily })}
              fontSize={preferences.fontSize}
              setFontSize={(fontSize) => setPreferences({ fontSize })}
              fontColor={preferences.fontColor}
              setFontColor={(fontColor) => setPreferences({ fontColor })}
              fontWeight={preferences.fontWeight}
              setFontWeight={(fontWeight) => setPreferences({ fontWeight })}
              lineHeight={preferences.lineHeight}
              setLineHeight={(lineHeight) => setPreferences({ lineHeight })}
              letterSpacing={preferences.letterSpacing}
              setLetterSpacing={(letterSpacing) => setPreferences({ letterSpacing })}
              textTransform={preferences.textTransform}
              setTextTransform={(textTransform) => setPreferences({ textTransform })}
              textAlign={preferences.textAlign}
              setTextAlign={(textAlign) => setPreferences({ textAlign })}
              strokeColor={preferences.strokeColor}
              setStrokeColor={(strokeColor) => setPreferences({ strokeColor })}
              strokeWidth={preferences.strokeWidth}
              setStrokeWidth={(strokeWidth) => setPreferences({ strokeWidth })}
              shadowColor={preferences.shadowColor}
              setShadowColor={(shadowColor) => setPreferences({ shadowColor })}
              shadowOpacity={preferences.shadowOpacity}
              setShadowOpacity={(shadowOpacity) => setPreferences({ shadowOpacity })}
              shadowBlur={preferences.shadowBlur}
              setShadowBlur={(shadowBlur) => setPreferences({ shadowBlur })}
              shadowOffsetX={preferences.shadowOffsetX}
              setShadowOffsetX={(shadowOffsetX) => setPreferences({ shadowOffsetX })}
              shadowOffsetY={preferences.shadowOffsetY}
              setShadowOffsetY={(shadowOffsetY) => setPreferences({ shadowOffsetY })}
              transitionsEnabled={preferences.transitionsEnabled}
              setTransitionsEnabled={(transitionsEnabled) => setPreferences({ transitionsEnabled })}
              availableFonts={availableFonts}
              isUploadingFont={isUploadingFont}
              fontUploadMessage={fontUploadMessage}
              fontUploadError={fontUploadError}
              onFontUpload={handleFontUpload}
              isLoading={isLoading}
            />

            {/* Processing Status */}
            {isLoading && (
              <div className="space-y-4">
                <ProcessingStatus
                  progress={progress}
                  statusMessage={statusMessage}
                  currentStep={currentStep}
                  sourceTitle={sourceTitle}
                  sourceType={sourceType}
                />
              </div>
            )}

            {/* Error Display */}
            {error && (
              <Alert className="mt-6 border-red-200 bg-red-50">
                <AlertCircle className="h-4 w-4 text-red-500" />
                <AlertDescription className="text-sm text-red-700">{error}</AlertDescription>
              </Alert>
            )}

            {/* Submit Button */}
            <Button
              type="submit"
              className="w-full h-11"
              disabled={
                (sourceType === "upload_file" && !fileRef.current) ||
                (sourceType === "video_url" && !uploadUrl.trim()) ||
                isLoading
              }
            >
              {isLoading ? "Processing..." : "Process Video"}
            </Button>

            {/* Ready Alert */}
            {((sourceType === "upload_file" && fileName) ||
              (sourceType === "video_url" && uploadUrl)) &&
              !isLoading && (
                <Alert className="mt-6">
                  <AlertDescription className="text-sm">
                    Ready to process:{" "}
                    {sourceType === "upload_file"
                      ? fileName
                      : uploadUrl.length > 50
                        ? uploadUrl.substring(0, 50) + "..."
                        : uploadUrl}
                  </AlertDescription>
                </Alert>
              )}
          </form>

          {/* Latest Task Card */}
          <LatestTaskCard task={latestTask} isLoading={isLoadingLatestTask} />
        </div>
      </div>
    </div>
  );
}
