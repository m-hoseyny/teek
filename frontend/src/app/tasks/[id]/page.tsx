"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useSession } from "@/lib/auth-client";
import { ArrowLeft, Download, Clock, Star, AlertCircle, Trash2, Edit2, X, Check, FileText, Play, Save, Eye } from "lucide-react";
import Link from "next/link";
import DynamicVideoPlayer, { type VideoPlayerRef } from "@/components/dynamic-video-player";
import { ClipPreviewModal } from "@/components/clip/ClipPreviewModal";

interface Clip {
  id: string;
  filename: string;
  file_path: string;
  start_time: string;
  end_time: string;
  duration: number;
  text: string;
  relevance_score: number;
  reasoning: string;
  clip_order: number;
  created_at: string;
  video_url: string;
}

interface TaskDetails {
  id: string;
  user_id: string;
  source_id: string;
  source_title: string;
  source_type: string;
  status: string;
  progress?: number;
  progress_message?: string;
  clips_count: number;
  created_at: string;
  updated_at: string;
  font_family?: string;
  font_size?: number;
  font_color?: string;
  source_video_url?: string;
}

type StageKey = "download" | "transcript" | "analysis" | "clips" | "finalizing";

const STAGE_LABELS: Record<StageKey, string> = {
  download: "Download",
  transcript: "Transcript",
  analysis: "AI Analysis",
  clips: "Clip Creation",
  finalizing: "Finalizing",
};

const EMPTY_STAGE_PROGRESS: Record<StageKey, number> = {
  download: 0,
  transcript: 0,
  analysis: 0,
  clips: 0,
  finalizing: 0,
};

const EMPTY_STAGE_NOTES: Record<StageKey, string> = {
  download: "",
  transcript: "",
  analysis: "",
  clips: "",
  finalizing: "",
};

function clampPercent(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function deriveStageProgress(
  overallProgress: number,
  progressMessage: string,
  current: Record<StageKey, number>
): Record<StageKey, number> {
  const next = { ...current };
  const overall = clampPercent(overallProgress);
  const message = progressMessage.toLowerCase();

  if (message.includes("download")) {
    const match = progressMessage.match(/(\d{1,3})%/);
    if (match) {
      next.download = Math.max(next.download, clampPercent(Number(match[1])));
    }
  }

  if (overall >= 30) next.download = Math.max(next.download, 100);
  if (overall >= 50) next.transcript = Math.max(next.transcript, 100);
  if (overall >= 70) next.analysis = Math.max(next.analysis, 100);
  if (overall >= 95) next.clips = Math.max(next.clips, 100);
  if (overall >= 100) next.finalizing = 100;

  return next;
}

function deriveStageNotesFromMessage(
  message: string,
  sourceType?: string
): Partial<Record<StageKey, string>> {
  const notes: Partial<Record<StageKey, string>> = {};
  const lower = (message || "").toLowerCase();

  if (lower.includes("found existing download") || lower.includes("skipping download")) {
    notes.download = "previous download found";
  }

  if (lower.includes("found existing transcript") || lower.includes("skipping transcription")) {
    notes.transcript = "previous transcript found";
    // If transcript is cached for YouTube, download was necessarily reused too.
    if (sourceType === "youtube") {
      notes.download = "previous download found";
    }
  }

  return notes;
}

export default function TaskPage() {
  const params = useParams();
  const router = useRouter();
  const { data: session, isPending } = useSession();
  const [task, setTask] = useState<TaskDetails | null>(null);
  const [clips, setClips] = useState<Clip[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [sourceVideoUrl, setSourceVideoUrl] = useState<string | null>(null);
  const [isLoadingSourceVideo, setIsLoadingSourceVideo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [progressMessage, setProgressMessage] = useState("");
  const [stageProgress, setStageProgress] = useState<Record<StageKey, number>>(EMPTY_STAGE_PROGRESS);
  const [stageNotes, setStageNotes] = useState<Record<StageKey, string>>(EMPTY_STAGE_NOTES);
  const [isEditing, setIsEditing] = useState(false);
  const [editedTitle, setEditedTitle] = useState("");
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [editingClipId, setEditingClipId] = useState<string | null>(null);
  const [editedClipData, setEditedClipData] = useState<{ start_time: string; end_time: string; text: string }>({ start_time: "", end_time: "", text: "" });
  const [isSavingClip, setIsSavingClip] = useState(false);
  const [previewClipId, setPreviewClipId] = useState<string | null>(null);
  const [selectedClipData, setSelectedClipData] = useState<{ startTime: string; endTime: string; text: string } | null>(null);

  const handlePreviewSubtitles = (clip: { id: string; start_time: string; end_time: string; text?: string }) => {
    setPreviewClipId(clip.id);
    setSelectedClipData({ startTime: clip.start_time, endTime: clip.end_time, text: clip.text || "" });
  };

  const handleEditClip = (clip: Clip, elementId?: string) => {
    setEditingClipId(clip.id);
    setEditedClipData({
      start_time: clip.start_time,
      end_time: clip.end_time,
      text: clip.text || ""
    });
    // Jump to clip start time in the video player
    seekToClipStart(clip.start_time);
    // Scroll the video section to top so video is visible while editing
    setTimeout(() => {
      const videoSection = document.getElementById('video-transcript-section');
      if (videoSection) {
        videoSection.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    }, 100);
  };

  const handleSaveClip = async (clipId: string) => {
    if (!userId || !taskId) return;
    
    try {
      setIsSavingClip(true);
      setTranscriptError(null);
      
      // Save time - backend will automatically extract transcript for the new time range
      const timeResponse = await fetch(`${apiUrl}/tasks/${taskId}/clips/${clipId}/time`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", user_id: userId },
        body: JSON.stringify({ 
          start_time: editedClipData.start_time, 
          end_time: editedClipData.end_time 
        }),
      });
      
      if (!timeResponse.ok) {
        const errorData = await timeResponse.json().catch(() => ({ } as { detail?: string }));
        throw new Error(errorData.detail || "Failed to save clip time");
      }
      
      const result = await timeResponse.json();
      
      // Update the task clips with the new data from backend (including auto-extracted transcript)
      setTask(prevTask => {
        if (!prevTask || !prevTask.clips) return prevTask;
        return {
          ...prevTask,
          clips: prevTask.clips.map(clip => 
            clip.id === clipId 
              ? { ...clip, start_time: result.start_time, end_time: result.end_time, text: result.text }
              : clip
          )
        };
      });
      
      setEditingClipId(null);
    } catch (err) {
      console.error("Error saving clip:", err);
      setTranscriptError(err instanceof Error ? err.message : "Failed to save clip");
    } finally {
      setIsSavingClip(false);
    }
  };

  const handleCancelEditClip = () => {
    setEditingClipId(null);
    setEditedClipData({ start_time: "", end_time: "", text: "" });
  };

  const clipsContainerRef = useRef<HTMLDivElement>(null);
  const [deletingClipId, setDeletingClipId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isEditingTranscript, setIsEditingTranscript] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [editedTranscript, setEditedTranscript] = useState("");
  const [isSavingTranscript, setIsSavingTranscript] = useState(false);
  const [isGeneratingClips, setIsGeneratingClips] = useState(false);
  const [transcriptError, setTranscriptError] = useState<string | null>(null);
  const progressRef = useRef(progress);
  const progressMessageRef = useRef(progressMessage);
  const sourceTypeRef = useRef<string | undefined>(task?.source_type);
  const sourcePlayerRef = useRef<VideoPlayerRef | null>(null);
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
  const taskId = Array.isArray(params.id) ? params.id[0] : params.id;
  const userId = session?.user?.id;

  // Fetch transcript when task is in awaiting_review status
  const fetchTranscript = useCallback(async () => {
    if (!taskId || !userId) return;

    try {
      const response = await fetch(`${apiUrl}/tasks/${taskId}/transcript`, {
        headers: { user_id: userId },
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch transcript: ${response.status}`);
      }

      const data = await response.json();
      setTranscript(data.transcript || "");
      setEditedTranscript(data.transcript || "");
    } catch (err) {
      console.error("Error fetching transcript:", err);
      setTranscriptError(err instanceof Error ? err.message : "Failed to load transcript");
    }
  }, [apiUrl, taskId, userId]);

  // Fetch transcript when task status changes to awaiting_review or completed
  useEffect(() => {
    if (task?.status === "awaiting_review" || task?.status === "transcribed" || task?.status === "completed") {
      fetchTranscript();
    }
  }, [task?.status, fetchTranscript]);

  // Fetch source video URL when task is in review or completed status
  const fetchSourceVideo = useCallback(async () => {
    if (!taskId || !userId) return;
    
    try {
      setIsLoadingSourceVideo(true);
      const response = await fetch(`${apiUrl}/tasks/${taskId}/source-video`, {
        headers: { user_id: userId },
      });
      
      if (!response.ok) {
        if (response.status === 404) {
          setSourceVideoUrl(null);
          return;
        }
        throw new Error(`Failed to fetch source video: ${response.status}`);
      }
      
      // Create blob URL from the video data so auth headers are properly used
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      setSourceVideoUrl(url);
    } catch (err) {
      console.error("Error fetching source video:", err);
      setSourceVideoUrl(null);
    } finally {
      setIsLoadingSourceVideo(false);
    }
  }, [apiUrl, taskId, userId]);

  // Fetch source video when task status changes
  useEffect(() => {
    if (task?.status === "awaiting_review" || task?.status === "transcribed" || task?.status === "completed") {
      fetchSourceVideo();
    }
  }, [task?.status, fetchSourceVideo]);

  useEffect(() => {
    progressRef.current = progress;
  }, [progress]);

  useEffect(() => {
    progressMessageRef.current = progressMessage;
  }, [progressMessage]);

  useEffect(() => {
    sourceTypeRef.current = task?.source_type;
  }, [task?.source_type]);

  const fetchTaskStatus = useCallback(async (retryCount = 0, maxRetries = 5) => {
    if (!taskId || !userId) return false;

    try {
      const headers: HeadersInit = {
        user_id: userId,
      };

      const taskResponse = await fetch(`${apiUrl}/tasks/${taskId}`, {
        headers,
      });

      // Handle 404 with retry logic (task might not be persisted yet)
      if (taskResponse.status === 404 && retryCount < maxRetries) {
        console.log(`Task not found yet, retrying in ${(retryCount + 1) * 500}ms... (${retryCount + 1}/${maxRetries})`);
        await new Promise((resolve) => setTimeout(resolve, (retryCount + 1) * 500));
        return fetchTaskStatus(retryCount + 1, maxRetries);
      }

      if (!taskResponse.ok) {
        throw new Error(`Failed to fetch task: ${taskResponse.status}`);
      }

      const taskData = await taskResponse.json();
      setTask(taskData);
      const nextProgress = taskData.progress ?? 0;
      const nextMessage = taskData.progress_message ?? "";
      setProgress(nextProgress);
      setProgressMessage(nextMessage);
      setStageProgress((prev) => deriveStageProgress(nextProgress, nextMessage, prev));
      const inferredNotes = deriveStageNotesFromMessage(nextMessage, taskData?.source_type);
      if (Object.keys(inferredNotes).length > 0) {
        setStageNotes((prev) => ({ ...prev, ...inferredNotes }));
      }
      setError(null);

      // Only fetch clips if task is completed
      if (taskData.status === "completed") {
        const clipsResponse = await fetch(`${apiUrl}/tasks/${taskId}/clips`, {
          headers,
        });

        if (!clipsResponse.ok) {
          throw new Error(`Failed to fetch clips: ${clipsResponse.status}`);
        }

        const clipsData = await clipsResponse.json();
        setClips(clipsData.clips || []);
      } else {
        setClips([]);
      }

      return true;
    } catch (err) {
      console.error("Error fetching task data:", err);
      setError(err instanceof Error ? err.message : "Failed to load task");
      return false;
    }
  }, [apiUrl, taskId, userId]);

  // Initial fetch
  useEffect(() => {
    if (!taskId || !userId) {
      setIsLoading(false);
      return;
    }

    const fetchTaskData = async () => {
      try {
        setIsLoading(true);
        await fetchTaskStatus();
      } finally {
        setIsLoading(false);
      }
    };

    fetchTaskData();
  }, [fetchTaskStatus, taskId, userId]);

  // Poll task status while queued/processing.
  useEffect(() => {
    if (!taskId || !userId || !task?.status) return;
    if (task.status !== "queued" && task.status !== "processing") return;

    const intervalId = window.setInterval(() => {
      fetchTaskStatus();
    }, 2000);

    // Trigger one immediate refresh when polling starts.
    fetchTaskStatus();

    return () => {
      window.clearInterval(intervalId);
    };
  }, [fetchTaskStatus, task?.status, taskId, userId]);

  // Subscribe to backend SSE progress stream for real-time updates.
  useEffect(() => {
    if (!taskId || !userId || !task?.status) return;
    if (task.status !== "queued" && task.status !== "processing") return;

    const progressUrl = `${apiUrl}/tasks/${taskId}/progress?user_id=${encodeURIComponent(userId)}`;
    const eventSource = new EventSource(progressUrl);

    const handleStatusOrProgress = (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data);
        if (typeof data.progress === "number") setProgress(data.progress);
        if (typeof data.message === "string") setProgressMessage(data.message);
        if (typeof data.message === "string") {
          const inferredNotes = deriveStageNotesFromMessage(data.message, sourceTypeRef.current);
          if (Object.keys(inferredNotes).length > 0) {
            setStageNotes((prev) => ({ ...prev, ...inferredNotes }));
          }
        }
        const metadata = (data?.metadata ?? {}) as { stage?: StageKey; stage_progress?: number; cached?: boolean };
        if (metadata.stage && metadata.stage in STAGE_LABELS) {
          setStageProgress((prev) => ({
            ...prev,
            [metadata.stage as StageKey]: Math.max(
              prev[metadata.stage as StageKey],
              clampPercent(metadata.stage_progress ?? 0)
            ),
          }));
          if (metadata.cached) {
            setStageNotes((prev) => {
              const note =
                metadata.stage === "download"
                  ? "previous download found"
                  : metadata.stage === "transcript"
                    ? "previous transcript found"
                    : "cached";
              return { ...prev, [metadata.stage as StageKey]: note };
            });
          }
        } else {
          const nextProgress = typeof data.progress === "number" ? data.progress : progressRef.current;
          const nextMessage = typeof data.message === "string" ? data.message : progressMessageRef.current;
          setStageProgress((prev) => deriveStageProgress(nextProgress, nextMessage, prev));
        }
        if (typeof data.status === "string") {
          setTask((prev) => (prev ? { ...prev, status: data.status } : prev));
          // When the task enters awaiting_review, fetch the full task so clips are loaded
          if (data.status === "awaiting_review") {
            fetchTaskStatus();
          }
        }
      } catch (err) {
        console.error("Failed to parse progress event:", err);
      }
    };

    const handleClose = () => {
      eventSource.close();
      // Refresh once when stream closes to fetch final task/clips state.
      fetchTaskStatus();
    };

    eventSource.addEventListener("status", handleStatusOrProgress);
    eventSource.addEventListener("progress", handleStatusOrProgress);
    eventSource.addEventListener("close", handleClose);
    eventSource.onerror = () => {
      eventSource.close();
    };

    return () => {
      eventSource.removeEventListener("status", handleStatusOrProgress);
      eventSource.removeEventListener("progress", handleStatusOrProgress);
      eventSource.removeEventListener("close", handleClose);
      eventSource.close();
    };
  }, [apiUrl, fetchTaskStatus, task?.status, taskId, userId]);

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const timeToSeconds = (timeStr: string): number => {
    const parts = timeStr.split(':').map(Number);
    if (parts.length === 2) {
      return parts[0] * 60 + parts[1];
    }
    if (parts.length === 3) {
      return parts[0] * 3600 + parts[1] * 60 + parts[2];
    }
    return parseInt(timeStr) || 0;
  };

  const seekToClipStart = (startTime: string) => {
    if (sourcePlayerRef.current) {
      const seconds = timeToSeconds(startTime);
      sourcePlayerRef.current.seekTo(seconds);
      sourcePlayerRef.current.play();
    }
  };

  const playClipSegment = (startTime: string, endTime: string) => {
    if (!sourcePlayerRef.current) return;
    
    const startSec = timeToSeconds(startTime);
    const endSec = timeToSeconds(endTime);
    
    sourcePlayerRef.current.seekTo(startSec);
    sourcePlayerRef.current.play();
    
    // Auto-stop at end time
    const checkTime = () => {
      const currentTime = sourcePlayerRef.current?.getCurrentTime() ?? 0;
      if (currentTime >= endSec) {
        sourcePlayerRef.current?.pause();
      } else {
        requestAnimationFrame(checkTime);
      }
    };
    requestAnimationFrame(checkTime);
  };

  const getScoreColor = (score: number) => {
    if (score >= 0.8) return "bg-green-100 text-green-800";
    if (score >= 0.6) return "bg-yellow-100 text-yellow-800";
    return "bg-red-100 text-red-800";
  };

  const handleEditTitle = async () => {
    if (!editedTitle.trim() || !session?.user?.id || !params.id) return;

    try {
      const response = await fetch(`${apiUrl}/tasks/${params.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          user_id: session.user.id,
        },
        body: JSON.stringify({ title: editedTitle }),
      });

      if (response.ok) {
        setTask(task ? { ...task, source_title: editedTitle } : null);
        setIsEditing(false);
      } else {
        alert("Failed to update title");
      }
    } catch (err) {
      console.error("Error updating title:", err);
      alert("Failed to update title");
    }
  };

  const handleDeleteTask = async () => {
    if (!session?.user?.id || !params.id) return;

    setIsDeleting(true);
    try {
      const response = await fetch(`${apiUrl}/tasks/${params.id}`, {
        method: "DELETE",
        headers: {
          user_id: session.user.id,
        },
      });

      if (response.ok) {
        router.push("/list");
      } else {
        alert("Failed to delete task");
      }
    } catch (err) {
      console.error("Error deleting task:", err);
      alert("Failed to delete task");
    } finally {
      setIsDeleting(false);
      setShowDeleteDialog(false);
    }
  };

  const handleSaveTranscript = async () => {
    if (!session?.user?.id || !taskId) return;

    try {
      setIsSavingTranscript(true);
      setTranscriptError(null);

      const response = await fetch(`${apiUrl}/tasks/${taskId}/transcript`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          user_id: session.user.id,
        },
        body: JSON.stringify({ transcript: editedTranscript }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ } as { detail?: string }));
        throw new Error(errorData.detail || "Failed to save transcript");
      }

      setTranscript(editedTranscript);
      setIsEditingTranscript(false);
    } catch (err) {
      console.error("Error saving transcript:", err);
      setTranscriptError(err instanceof Error ? err.message : "Failed to save transcript");
    } finally {
      setIsSavingTranscript(false);
    }
  };

  const handleGenerateClips = async () => {
    if (!session?.user?.id || !taskId) return;

    try {
      setIsGeneratingClips(true);
      setTranscriptError(null);

      // First save the current transcript if it was edited
      if (editedTranscript !== transcript) {
        await handleSaveTranscript();
      }

      const response = await fetch(`${apiUrl}/tasks/${taskId}/generate-clips`, {
        method: "POST",
        headers: {
          user_id: session.user.id,
        },
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ } as { detail?: string }));
        throw new Error(errorData.detail || "Failed to start clip generation");
      }

      // Refresh task status to show processing
      await fetchTaskStatus();
    } catch (err) {
      console.error("Error generating clips:", err);
      setTranscriptError(err instanceof Error ? err.message : "Failed to start clip generation");
    } finally {
      setIsGeneratingClips(false);
    }
  };

  const [isRetrying, setIsRetrying] = useState(false);

  const handleRetryGenerateClips = async () => {
    if (!session?.user?.id || !taskId) return;

    try {
      setIsRetrying(true);
      setTranscriptError(null);

      const response = await fetch(`${apiUrl}/tasks/${taskId}/retry-clips`, {
        method: "POST",
        headers: {
          user_id: session.user.id,
        },
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ } as { detail?: string }));
        throw new Error(errorData.detail || "Failed to start clip regeneration");
      }

      // Refresh task status to show processing
      await fetchTaskStatus();
    } catch (err) {
      console.error("Error retrying clip generation:", err);
      setTranscriptError(err instanceof Error ? err.message : "Failed to start clip regeneration");
    } finally {
      setIsRetrying(false);
    }
  };

  const handleDeleteClip = async (clipId: string) => {
    try {
      const response = await fetch(`${apiUrl}/tasks/${params.id}/clips/${clipId}`, {
        method: "DELETE",
        headers: {
          user_id: session.user.id,
        },
      });

      if (response.ok) {
        setClips(clips.filter((clip) => clip.id !== clipId));
        setDeletingClipId(null);
      } else {
        alert("Failed to delete clip");
      }
    } catch (err) {
      console.error("Error deleting clip:", err);
      alert("Failed to delete clip");
    }
  };

  const displayProgressMessage = (() => {
    const msg = progressMessage || "";
    const lower = msg.toLowerCase();
    if (lower.includes("found existing download") || lower.includes("skipping download")) {
      return "Processing video and generating clips...";
    }
    return msg;
  })();

  const getStageStatusLabel = (stage: StageKey): string => {
    if (stageNotes[stage]) {
      return stageNotes[stage];
    }

    // Fallback for cases where the cached transcript event was missed:
    // if download is cached and transcript is fully complete early in the pipeline,
    // treat transcript as cached for display purposes.
    if (
      stage === "transcript" &&
      stageProgress.transcript >= 100 &&
      stageNotes.download === "previous download found" &&
      progress < 70
    ) {
      return "previous transcript found";
    }

    // Mirror behavior for download if the transcript cache signal is present.
    if (
      stage === "download" &&
      stageProgress.download >= 100 &&
      stageNotes.transcript === "previous transcript found" &&
      (task?.source_type === "youtube")
    ) {
      return "previous download found";
    }

    return `${stageProgress[stage]}%`;
  };

  if (isPending) {
    return (
      <div className="min-h-screen bg-white p-4">
        <div className="max-w-6xl mx-auto">
          <div className="mb-6">
            <Skeleton className="h-8 w-48 mb-2" />
            <Skeleton className="h-4 w-96" />
          </div>
          <div className="grid gap-6">
            {[1, 2].map((i) => (
              <Card key={i}>
                <CardContent className="p-6">
                  <Skeleton className="h-48 w-full mb-4" />
                  <Skeleton className="h-4 w-full mb-2" />
                  <Skeleton className="h-4 w-3/4" />
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (!session?.user) {
    return (
      <div className="min-h-screen bg-white p-4">
        <div className="max-w-6xl mx-auto">
          <Alert>
            <AlertDescription>You need to sign in to view this task.</AlertDescription>
          </Alert>
          <Link href="/sign-in" className="mt-4 inline-block">
            <Button>Sign In</Button>
          </Link>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-white p-4">
        <div className="max-w-6xl mx-auto">
          <div className="mb-6">
            <Skeleton className="h-8 w-48 mb-2" />
            <Skeleton className="h-4 w-96" />
          </div>
          <div className="grid gap-6">
            {[1, 2, 3].map((i) => (
              <Card key={i}>
                <CardContent className="p-6">
                  <Skeleton className="h-48 w-full mb-4" />
                  <Skeleton className="h-4 w-full mb-2" />
                  <Skeleton className="h-4 w-3/4" />
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-white p-4">
        <div className="max-w-6xl mx-auto">
          <Alert>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
          <Link href="/" className="mt-4 inline-block">
            <Button variant="outline">
              <ArrowLeft className="w-4 h-4" />
              Back to Home
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <div className="border-b bg-white">
        <div className="max-w-6xl mx-auto px-4 py-6">
          <div className="flex items-center gap-4 mb-4">
            <Link href="/">
              <Button variant="ghost" size="sm">
                <ArrowLeft className="w-4 h-4" />
                Back
              </Button>
            </Link>
          </div>

          {task && (
            <div>
              <div className="flex items-center gap-3 mb-2">
                {isEditing ? (
                  <div className="flex items-center gap-2 flex-1">
                    <Input
                      value={editedTitle}
                      onChange={(e) => setEditedTitle(e.target.value)}
                      className="text-2xl font-bold h-auto py-1"
                      autoFocus
                    />
                    <Button size="sm" onClick={handleEditTitle} disabled={!editedTitle.trim()}>
                      <Check className="w-4 h-4" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setIsEditing(false);
                        setEditedTitle(task.source_title);
                      }}
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                ) : (
                  <>
                    <h1 className="text-2xl font-bold text-black">{task.source_title}</h1>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setIsEditing(true);
                        setEditedTitle(task.source_title);
                      }}
                    >
                      <Edit2 className="w-4 h-4" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-red-600 hover:text-red-700 hover:bg-red-50"
                      onClick={() => setShowDeleteDialog(true)}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </>
                )}
              </div>
              <div className="flex items-center gap-4 text-sm text-gray-600">
                <Badge variant="outline" className="capitalize">
                  {task.source_type}
                </Badge>
                <span className="flex items-center gap-1">
                  <Clock className="w-4 h-4" />
                  {new Date(task.created_at).toLocaleDateString()}
                </span>
                {task.status === "completed" ? (
                  <span>
                    {clips.length} {clips.length === 1 ? "clip" : "clips"} generated
                  </span>
                ) : task.status === "processing" ? (
                  <Badge className="bg-blue-100 text-blue-800">Processing</Badge>
                ) : task.status === "queued" ? (
                  <Badge className="bg-yellow-100 text-yellow-800">Queued</Badge>
                ) : task.status === "awaiting_review" || task.status === "transcribed" ? (
                  <Badge className="bg-amber-100 text-amber-800">Ready for Review</Badge>
                ) : (
                  <Badge variant="outline" className="capitalize">
                    {task.status}
                  </Badge>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-6xl mx-auto px-4 py-8">
        {task?.status === "processing" || task?.status === "queued" || !task ? (
          <div className="space-y-6">
            <div className="text-center mb-8">
              <h2 className="text-xl font-semibold text-black mb-2">
                {!task ? "Initializing..." : task.status === "queued" ? "Queued for Processing" : "Processing Video"}
              </h2>
              <p className="text-gray-600">
                {!task
                  ? "Setting up your task. This should only take a moment..."
                  : task.status === "queued"
                    ? "Your task is in the queue and will start processing shortly."
                    : "Generating clips from your video. This usually takes 2-3 minutes."}
              </p>
            </div>

            {/* Processing Status Display with Progress */}
            <Card className="mb-6">
              <CardContent className="p-6">
                <div className="space-y-4">
                  <div className="flex items-center justify-center gap-3">
                    <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse"></div>
                    <p className="text-sm font-medium text-black">
                      {displayProgressMessage ||
                        (!task ? "Initializing your task..." : "Processing video and generating clips...")}
                    </p>
                  </div>

                  {/* Progress Bar */}
                  {progress > 0 && (
                    <div className="w-full">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs text-gray-500">Overall</span>
                        <span className="text-xs font-medium text-blue-600">{progress}%</span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-2">
                        <div
                          className="bg-blue-600 h-2 rounded-full transition-all duration-500 ease-out"
                          style={{ width: `${progress}%` }}
                        />
                      </div>
                    </div>
                  )}

                  {progress > 0 && (
                    <div className="space-y-2">
                      {(Object.keys(STAGE_LABELS) as StageKey[]).map((stage) => (
                        <div key={stage} className="w-full">
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-xs text-gray-500">{STAGE_LABELS[stage]}</span>
                            <span className="text-xs font-medium text-gray-700">
                              {getStageStatusLabel(stage)}
                            </span>
                          </div>
                          <div className="w-full bg-gray-200 rounded-full h-1.5">
                            <div
                              className="bg-blue-500 h-1.5 rounded-full transition-all duration-500 ease-out"
                              style={{ width: `${stageProgress[stage]}%` }}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  <p className="text-xs text-gray-500 text-center">
                    This page will automatically update when your clips are ready
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* Skeleton for clips being generated */}
            {[1, 2].map((i) => (
              <Card key={i} className="overflow-hidden">
                <CardContent className="p-0">
                  <div className="flex flex-col lg:flex-row">
                    {/* Video Player Skeleton */}
                    <div className="bg-gray-200 relative flex-shrink-0 flex items-center justify-center w-full lg:w-96 h-48 lg:h-64">
                      <Skeleton className="w-full h-full" />
                    </div>

                    {/* Clip Details Skeleton */}
                    <div className="p-6 flex-1">
                      <div className="flex items-start justify-between mb-4">
                        <div>
                          <Skeleton className="h-6 w-24 mb-2" />
                          <Skeleton className="h-4 w-32" />
                        </div>
                        <Skeleton className="h-6 w-12" />
                      </div>

                      <div className="mb-4">
                        <Skeleton className="h-4 w-16 mb-2" />
                        <Skeleton className="h-20 w-full" />
                      </div>

                      <div className="mb-4">
                        <Skeleton className="h-4 w-20 mb-2" />
                        <Skeleton className="h-4 w-full mb-1" />
                        <Skeleton className="h-4 w-3/4" />
                      </div>

                      <Skeleton className="h-8 w-24" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : task?.status === "error" ? (
          <Card>
            <CardContent className="p-8 text-center">
              <div className="text-red-600 mb-4">
                <AlertCircle className="w-12 h-12 mx-auto mb-2" />
                <h2 className="text-xl font-semibold">Processing Failed</h2>
              </div>
              <p className="text-gray-600 mb-4">There was an error processing your video. Please try again.</p>
              <Link href="/">
                <Button>
                  <ArrowLeft className="w-4 h-4" />
                  Back to Home
                </Button>
              </Link>
            </CardContent>
          </Card>
        ) : task?.status === "awaiting_review" || task?.status === "transcribed" ? (
          <div className="space-y-6">
            {/* Transcript Review Card */}
            <Card className="border-amber-200 bg-amber-50/30">
              <CardContent className="p-6">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 bg-amber-100 rounded-full flex items-center justify-center">
                    <FileText className="w-5 h-5 text-amber-600" />
                  </div>
                  <div>
                    <h2 className="text-lg font-semibold text-black">Review Transcript</h2>
                    <p className="text-sm text-gray-600">
                      Edit before generating clips
                    </p>
                  </div>
                </div>

                {transcriptError && (
                  <Alert className="mb-4 border-red-200 bg-red-50">
                    <AlertCircle className="h-4 w-4 text-red-500" />
                    <AlertDescription className="text-sm text-red-700">
                      {transcriptError}
                    </AlertDescription>
                  </Alert>
                )}

                {isEditingTranscript ? (
                  <div className="space-y-4">
                    <textarea
                      value={editedTranscript}
                      onChange={(e) => setEditedTranscript(e.target.value)}
                      className="w-full min-h-[200px] p-4 text-sm font-mono bg-white border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent resize-y"
                      placeholder="Edit the transcript here..."
                    />
                    <div className="flex gap-2 justify-end">
                      <Button
                        variant="outline"
                        onClick={() => {
                          setEditedTranscript(transcript);
                          setIsEditingTranscript(false);
                        }}
                        disabled={isSavingTranscript}
                      >
                        <X className="w-4 h-4 mr-2" />
                        Cancel
                      </Button>
                      <Button
                        onClick={handleSaveTranscript}
                        disabled={isSavingTranscript}
                        className="bg-amber-600 hover:bg-amber-700"
                      >
                        {isSavingTranscript ? (
                          <>
                            <div className="w-4 h-4 mr-2 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                            Saving...
                          </>
                        ) : (
                          <>
                            <Save className="w-4 h-4 mr-2" />
                            Save Changes
                          </>
                        )}
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="bg-background border border-border rounded-lg p-4 max-h-[300px] overflow-y-auto">
                      <pre className="text-sm text-foreground whitespace-pre-wrap font-mono">
                        {transcript || "Loading transcript..."}
                      </pre>
                    </div>
                    <div className="flex gap-2 justify-end">
                      <Button
                        variant="outline"
                        onClick={() => setIsEditingTranscript(true)}
                        disabled={!transcript}
                      >
                        <Edit2 className="w-4 h-4 mr-2" />
                        Edit Transcript
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Source Video Player */}
            {sourceVideoUrl && (
              <Card className="border-gray-200 overflow-hidden">
                <CardContent className="p-0">
                  <div className="p-4 bg-gray-50 border-b border-gray-200">
                    <h3 className="font-semibold text-black flex items-center gap-2">
                      <Play className="w-4 h-4" />
                      Source Video
                    </h3>
                    <p className="text-sm text-gray-600">
                      Preview clips while editing
                    </p>
                  </div>
                  <div className="bg-black">
                    <DynamicVideoPlayer
                      ref={sourcePlayerRef}
                      src={sourceVideoUrl}
                      className="w-full max-h-[400px]"
                    />
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Proposed Clips for Review */}
            {task?.clips && task.clips.length > 0 && (
              <div className="space-y-4" ref={clipsContainerRef}>
                <h3 className="text-lg font-semibold text-black">Proposed Clips ({task.clips.length})</h3>
                {[...task.clips]
                  .sort((a, b) => {
                    if (editingClipId === a.id) return -1;
                    if (editingClipId === b.id) return 1;
                    return 0;
                  })
                  .map((clip, index) => (
                  <Card key={clip.id} id={`clip-card-${clip.id}`} className="overflow-hidden border-gray-200">
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-3">
                          <span className="text-sm font-semibold text-gray-700">
                            Clip {index + 1}
                          </span>
                          <Badge className={getScoreColor(clip.relevance_score)}>
                            <Star className="w-3 h-3 mr-1" />
                            {(clip.relevance_score * 100).toFixed(0)}%
                          </Badge>
                        </div>
                        {editingClipId !== clip.id && (
                          <Button size="sm" variant="ghost" onClick={() => handleEditClip(clip, `clip-card-${clip.id}`)}>
                            <Edit2 className="w-4 h-4 mr-1" /> Edit
                          </Button>
                        )}
                      </div>

                      {editingClipId === clip.id ? (
                        <div className="space-y-3">
                          {/* Editable Time Fields */}
                          <div className="flex items-center gap-4">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium text-gray-600">Start:</span>
                              <Input
                                type="text"
                                value={editedClipData.start_time}
                                onChange={(e) => setEditedClipData({ ...editedClipData, start_time: e.target.value })}
                                className="w-24 text-sm"
                                placeholder="00:00"
                              />
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium text-gray-600">End:</span>
                              <Input
                                type="text"
                                value={editedClipData.end_time}
                                onChange={(e) => setEditedClipData({ ...editedClipData, end_time: e.target.value })}
                                className="w-24 text-sm"
                                placeholder="00:00"
                              />
                            </div>
                          </div>

                          {/* Preview Buttons */}
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => seekToClipStart(editedClipData.start_time)}
                            >
                              <Play className="w-4 h-4 mr-1" />
                              Preview Start
                            </Button>
                            <Button
                              size="sm"
                              variant="secondary"
                              onClick={() => playClipSegment(editedClipData.start_time, editedClipData.end_time)}
                            >
                              <Play className="w-4 h-4 mr-1" />
                              Play Segment
                            </Button>
                          </div>

                          {/* Current Transcript (Read-only) */}
                          <div className="bg-background border border-border rounded-lg p-3">
                            <p className="text-xs text-muted-foreground uppercase font-medium mb-1">Transcript</p>
                            <p className="text-sm text-foreground">
                              {clip.text || "No transcript available"}
                            </p>
                          </div>

                          {/* Save/Cancel Buttons */}
                          <div className="flex gap-2 justify-end">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={handleCancelEditClip}
                              disabled={isSavingClip}
                            >
                              <X className="w-4 h-4 mr-1" /> Cancel
                            </Button>
                            <Button
                              size="sm"
                              onClick={() => handleSaveClip(clip.id)}
                              disabled={isSavingClip}
                              className="bg-amber-600 hover:bg-amber-700"
                            >
                              {isSavingClip ? (
                                <div className="w-4 h-4 mr-1 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                              ) : (
                                <Save className="w-4 h-4 mr-1" />
                              )}
                              Save
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <div className="flex items-center gap-2 text-sm text-muted-foreground mb-3">
                            <span className="font-mono bg-muted px-2 py-1 rounded">
                              {clip.start_time} - {clip.end_time}
                            </span>
                          </div>

                          <p className="text-sm text-foreground mb-3 bg-muted p-3 rounded">
                            {clip.text || "No transcript available"}
                          </p>

                          {clip.reasoning && (
                            <p className="text-xs text-muted-foreground italic mb-3">
                              <span className="font-medium">AI reasoning:</span> {clip.reasoning}
                            </p>
                          )}

                          <div className="flex flex-wrap gap-2">
                            {task?.source_video_url && (
                              <>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => seekToClipStart(clip.start_time)}
                                >
                                  <Play className="w-4 h-4 mr-2" />
                                  Preview at Start
                                </Button>
                                <Button
                                  size="sm"
                                  variant="secondary"
                                  onClick={() => playClipSegment(clip.start_time, clip.end_time)}
                                >
                                  <Play className="w-4 h-4 mr-2" />
                                  Play Clip Segment
                                </Button>
                              </>
                            )}
                            {sourceVideoUrl && (
                              <Button
                                size="sm"
                                variant="outline"
                                className="border-purple-300 text-purple-700 hover:bg-purple-50"
                                onClick={() => handlePreviewSubtitles(clip)}
                              >
                                <Eye className="w-4 h-4 mr-2" />
                                Preview Subtitles
                              </Button>
                            )}
                          </div>
                        </>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}

            {/* Generate Clips Action */}
            <Card className="border-green-200 bg-green-50/30">
              <CardContent className="p-6">
                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center flex-shrink-0">
                    <Play className="w-5 h-5 text-green-600" />
                  </div>
                  <div className="flex-1">
                    <h3 className="font-semibold text-black mb-1">Ready to Generate</h3>
                    <p className="text-sm text-gray-600 mb-4">
                      Once you&apos;ve reviewed all the clips and transcript, click below to create the video files with subtitles.
                    </p>
                    <Button
                      onClick={handleGenerateClips}
                      disabled={isGeneratingClips || !transcript}
                      className="bg-green-600 hover:bg-green-700"
                      size="lg"
                    >
                      {isGeneratingClips ? (
                        <>
                          <div className="w-4 h-4 mr-2 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                          Starting Generation...
                        </>
                      ) : (
                        <>
                          <Play className="w-4 h-4 mr-2" />
                          Generate {task?.clips?.length || 0} Video Clips
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Preview Message */}
            <Card className="bg-blue-50/30 border-blue-200">
              <CardContent className="p-6">
                <div className="flex items-start gap-3">
                  <div className="w-5 h-5 mt-0.5 text-blue-500">
                    <AlertCircle className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-medium text-black mb-1">What happens next?</h3>
                    <p className="text-sm text-gray-600">
                      After you click &quot;Generate Clips&quot;, the AI will analyze the transcript to find the most engaging moments,
                      then create short video clips with subtitles. This usually takes 1-2 minutes.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        ) : clips.length === 0 ? (
          <Card>
            <CardContent className="p-8 text-center">
              {task?.status === "completed" ? (
                <>
                  <div className="text-yellow-600 mb-4">
                    <AlertCircle className="w-12 h-12 mx-auto mb-2" />
                    <h2 className="text-xl font-semibold">No Clips Generated</h2>
                  </div>
                  <p className="text-gray-600 mb-4">
                    The task completed but no clips were generated. The video may not have had suitable content for
                    clipping.
                  </p>
                  {task?.progress_message && (
                    <p className="text-sm text-left text-gray-700 bg-gray-50 border border-gray-200 rounded p-3 mb-4 dark:text-gray-100 dark:bg-slate-800/70 dark:border-slate-700">
                      {task.progress_message}
                    </p>
                  )}
                  <Link href="/">
                    <Button>
                      <ArrowLeft className="w-4 h-4 mr-2" />
                      Try Another Video
                    </Button>
                  </Link>
                </>
              ) : (
                <>
                  <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
                    <Clock className="w-8 h-8 text-blue-500 animate-pulse" />
                  </div>
                  <h2 className="text-xl font-semibold text-black mb-2">Still Generating...</h2>
                  <p className="text-gray-600">
                    Your clips are being generated. This page will refresh automatically when they&apos;re ready.
                  </p>
                </>
              )}
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-6">
            {/* Source Video Player with Clip Sync */}
            {task?.source_video_url && (
              <Card className="border-gray-200 overflow-hidden">
                <CardContent className="p-0">
                  <div className="p-4 bg-gray-50 border-b border-gray-200">
                    <h3 className="font-semibold text-black flex items-center gap-2">
                      <Play className="w-4 h-4" />
                      Source Video
                    </h3>
                    <p className="text-sm text-gray-600">
                      Click &quot;Play Clip Segment&quot; on any clip below to preview it in the source video
                    </p>
                  </div>
                  <div className="bg-black">
                    <DynamicVideoPlayer
                      ref={sourcePlayerRef}
                      src={task.source_video_url}
                      className="w-full max-h-[500px]"
                    />
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Font Settings Display */}
            {task && (
              <div className="bg-gray-50 rounded-lg p-4">
                <h3 className="text-sm font-medium text-black mb-3 flex items-center gap-2">
                  <span className="w-4 h-4">🎨</span>
                  Font Settings
                </h3>
                <div className="grid grid-cols-3 gap-4 text-xs">
                  <div>
                    <span className="text-gray-500">Font:</span>
                    <p className="font-medium">{task.font_family || "Default"}</p>
                  </div>
                  <div>
                    <span className="text-gray-500">Size:</span>
                    <p className="font-medium">{task.font_size || 24}px</p>
                  </div>
                  <div>
                    <span className="text-gray-500">Color:</span>
                    <div className="flex items-center gap-1">
                      <div
                        className="w-3 h-3 rounded border"
                        style={{ backgroundColor: task.font_color || "#FFFFFF" }}
                      ></div>
                      <p className="font-medium">{task.font_color || "#FFFFFF"}</p>
                    </div>
                  </div>
                </div>
              </div>
            )}
            {/* Retry Generate Clips Card */}
            <Card className="border-blue-200 bg-blue-50/30">
              <CardContent className="p-6">
                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center flex-shrink-0">
                    <Edit2 className="w-5 h-5 text-blue-600" />
                  </div>
                  <div className="flex-1">
                    <h3 className="font-semibold text-black mb-1">Not happy with these clips?</h3>
                    <p className="text-sm text-gray-600 mb-4">
                      The AI can analyze the transcript again to find different moments. This will delete the current clips and generate new ones for you to review and edit.
                    </p>
                    <Button
                      onClick={handleRetryGenerateClips}
                      disabled={isRetrying}
                      variant="outline"
                      className="border-blue-300 hover:bg-blue-100"
                    >
                      {isRetrying ? (
                        <>
                          <div className="w-4 h-4 mr-2 border-2 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />
                          Re-analyzing...
                        </>
                      ) : (
                        <>
                          <Edit2 className="w-4 h-4 mr-2" />
                          Retry Generate Clips
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>

            {clips.map((clip) => (
              <Card key={clip.id} className="overflow-hidden">
                <CardContent className="p-0">
                  <div className="flex flex-col lg:flex-row">
                    {/* Video Player */}
                    <div className="bg-black relative flex-shrink-0 flex items-center justify-center">
                      <DynamicVideoPlayer
                        src={`${apiUrl}${clip.video_url}`}
                        poster="/placeholder-video.jpg"
                      />
                    </div>

                    {/* Clip Details */}
                    <div className="p-6">
                      <div className="flex items-start justify-between mb-4">
                        <div>
                          <h3 className="font-semibold text-lg text-black mb-1">Clip {clip.clip_order}</h3>
                          <div className="flex items-center gap-2 text-sm text-gray-600">
                            <span className="font-mono bg-gray-100 px-2 py-1 rounded">
                              {clip.start_time} - {clip.end_time}
                            </span>
                            <span>•</span>
                            <span>{formatDuration(clip.duration)}</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge className={getScoreColor(clip.relevance_score)}>
                            <Star className="w-3 h-3 mr-1" />
                            {(clip.relevance_score * 100).toFixed(0)}%
                          </Badge>
                        </div>
                      </div>

                      {clip.text && (
                        <div className="mb-4">
                          <h4 className="font-medium text-black mb-2">Transcript</h4>
                          <p className="text-sm text-gray-700 bg-gray-50 border border-gray-200 p-3 rounded leading-relaxed dark:text-gray-100 dark:bg-slate-800/70 dark:border-slate-700">
                            {clip.text}
                          </p>
                        </div>
                      )}

                      {clip.reasoning && (
                        <div className="mb-4">
                          <h4 className="font-medium text-black mb-2">AI Analysis</h4>
                          <p className="text-sm text-gray-600">{clip.reasoning}</p>
                        </div>
                      )}

                      <div className="flex flex-wrap gap-2">
                        {sourceVideoUrl && (
                          <>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => seekToClipStart(clip.start_time)}
                            >
                              <Play className="w-4 h-4 mr-2" />
                              Preview at Start
                            </Button>
                            <Button
                              size="sm"
                              variant="secondary"
                              onClick={() => playClipSegment(clip.start_time, clip.end_time)}
                            >
                              <Play className="w-4 h-4 mr-2" />
                              Play Clip Segment
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="border-purple-300 text-purple-700 hover:bg-purple-50"
                              onClick={() => handlePreviewSubtitles(clip)}
                            >
                              <Eye className="w-4 h-4 mr-2" />
                              Preview Subtitles
                            </Button>
                          </>
                        )}
                        <Button size="sm" variant="outline" asChild>
                          <a href={`${apiUrl}${clip.video_url}`} download={clip.filename}>
                            <Download className="w-4 h-4 mr-2" />
                            Download
                          </a>
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-red-600 hover:text-red-700 hover:bg-red-50 border-red-200"
                          onClick={() => setDeletingClipId(clip.id)}
                        >
                          <Trash2 className="w-4 h-4 mr-2" />
                          Delete
                        </Button>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Delete Task Confirmation Dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Generation</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this generation? This will permanently delete all clips and cannot be
              undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteTask} disabled={isDeleting} className="bg-red-600 hover:bg-red-700">
              {isDeleting ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Clip Confirmation Dialog */}
      <AlertDialog open={!!deletingClipId} onOpenChange={(open) => !open && setDeletingClipId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Clip</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this clip? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deletingClipId && handleDeleteClip(deletingClipId)}
              className="bg-red-600 hover:bg-red-700"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Subtitle Preview Modal */}
      {previewClipId && selectedClipData && sourceVideoUrl && userId && taskId && (
        <ClipPreviewModal
          isOpen
          onClose={() => { setPreviewClipId(null); setSelectedClipData(null); }}
          clipId={previewClipId}
          taskId={taskId}
          userId={userId}
          sourceVideoUrl={sourceVideoUrl}
          startTime={selectedClipData.startTime}
          endTime={selectedClipData.endTime}
          text={selectedClipData.text}
        />
      )}
    </div>
  );
}
