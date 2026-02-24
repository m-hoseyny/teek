"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { AppLayout } from "@/components/layout/AppLayout";
import { useSession } from "@/lib/auth-client";
import { VideoPlayer } from "@/components/clip/VideoPlayer";
import {
  Download, Share2, Edit, Trash2, Sparkles,
  Clock, Brain, TrendingUp, ChevronRight, Loader2, Clapperboard,
} from "lucide-react";

interface Clip {
  id: string;
  task_id?: string;
  start_time: string;
  end_time: string;
  duration: number;
  relevance_score: number;
  text: string;
  reasoning: string;
  filename: string | null;
  clip_order: number;
  created_at: string;
}

interface TaskData {
  id: string;
  status: string;
  source: { title: string; url: string };
  clips: Clip[];
  metadata?: { aspect_ratio?: string };
}

interface GenProgress {
  progress: number;
  message: string;
  clipsCompleted: number;
  clipsTotal: number;
}

function ScoreBadge({ score }: { score: number }) {
  const pct = Math.round(score * 100);
  const color =
    pct >= 80 ? "from-emerald-500 to-green-400"
    : pct >= 60 ? "from-violet-500 to-purple-400"
    : pct >= 40 ? "from-amber-500 to-yellow-400"
    : "from-gray-500 to-gray-400";
  return (
    <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-gradient-to-r ${color} text-white text-xs font-bold shadow-sm`}>
      <TrendingUp className="w-3 h-3" />
      {pct}%
    </div>
  );
}

export default function StudioPage() {
  const params = useParams();
  const router = useRouter();
  const { data: session } = useSession();
  const taskId = params.id as string;
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

  const [task, setTask] = useState<TaskData | null>(null);
  const [clips, setClips] = useState<Clip[]>([]);
  const [selectedClip, setSelectedClip] = useState<Clip | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [genProgress, setGenProgress] = useState<GenProgress>({
    progress: 0, message: "Generating clips…", clipsCompleted: 0, clipsTotal: 0,
  });

  const eventSourceRef = useRef<EventSource | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const connectSSERef = useRef<(() => void) | null>(null);

  // Fetch clips only (called after processing completes to refresh)
  // NOTE: no selectedClip dependency — use functional update to avoid re-render loop
  const fetchClips = useCallback(async () => {
    if (!session?.user?.id) return;
    try {
      const res = await fetch(`${apiUrl}/tasks/${taskId}/clips`, {
        headers: { user_id: session.user.id },
      });
      if (res.ok) {
        const data = await res.json();
        const fetched: Clip[] = data.clips || [];
        setClips(fetched);
        setSelectedClip((prev) => prev ?? fetched[0] ?? null);
      }
    } catch (e) {
      console.error("Failed to fetch clips:", e);
    }
  }, [apiUrl, taskId, session?.user?.id]);

  // Connect to SSE for real-time clip generation progress
  const connectSSE = useCallback(() => {
    if (!session?.user?.id) return;
    if (eventSourceRef.current) eventSourceRef.current.close();

    const es = new EventSource(
      `${apiUrl}/tasks/${taskId}/progress?user_id=${session.user.id}`
    );

    es.addEventListener("progress", (evt: MessageEvent) => {
      try {
        const data = JSON.parse(evt.data);
        const meta = data.metadata || {};

        const clipsCompleted = meta.clips_completed ?? 0;
        const clipsTotal = meta.clips_total ?? 0;

        setGenProgress({
          progress: data.progress ?? 0,
          message: data.message || "Generating clips…",
          clipsCompleted,
          clipsTotal,
        });

        if (data.status === "completed") {
          es.close();
          setIsProcessing(false);
          fetchClips();
        } else if (data.status === "error" || data.status === "failed") {
          es.close();
          setIsProcessing(false);
        }
      } catch {}
    });

    es.addEventListener("status", (evt: MessageEvent) => {
      try {
        const data = JSON.parse(evt.data);
        if (data.status === "completed") {
          es.close();
          setIsProcessing(false);
          fetchClips();
        }
      } catch {}
    });

    es.addEventListener("close", () => {
      es.close();
    });

    es.onerror = () => {
      es.close();
      // Fallback: poll task status every 4 seconds
      if (pollRef.current) clearInterval(pollRef.current);
      pollRef.current = setInterval(async () => {
        if (!session?.user?.id) return;
        try {
          const res = await fetch(`${apiUrl}/tasks/${taskId}`, {
            headers: { user_id: session.user.id },
          });
          if (res.ok) {
            const data = await res.json();
            if (data.status === "completed") {
              clearInterval(pollRef.current!);
              setIsProcessing(false);
              fetchClips();
            }
          }
        } catch {}
      }, 4000);
    };

    eventSourceRef.current = es;
  }, [apiUrl, taskId, session?.user?.id, fetchClips]);

  // Keep connectSSERef up-to-date without adding it to the effect deps
  useEffect(() => {
    connectSSERef.current = connectSSE;
  }, [connectSSE]);

  // Run once on mount (taskId / userId are stable identifiers)
  useEffect(() => {
    if (!session?.user?.id || !taskId) return;

    const init = async () => {
      try {
        const [taskRes, clipsRes] = await Promise.all([
          fetch(`${apiUrl}/tasks/${taskId}`, { headers: { user_id: session.user.id } }),
          fetch(`${apiUrl}/tasks/${taskId}/clips`, { headers: { user_id: session.user.id } }),
        ]);

        if (taskRes.ok) {
          const taskData = await taskRes.json();
          setTask(taskData);
          if (taskData.status === "processing") {
            setIsProcessing(true);
            connectSSERef.current?.();
          }
        }

        if (clipsRes.ok) {
          const clipsData = await clipsRes.json();
          const fetched: Clip[] = clipsData.clips || [];
          setClips(fetched);
          if (fetched.length > 0) setSelectedClip(fetched[0]);
        }
      } catch (e) {
        console.error("Failed to fetch task/clips:", e);
      } finally {
        setIsLoading(false);
      }
    };

    init();

    return () => {
      eventSourceRef.current?.close();
      if (pollRef.current) clearInterval(pollRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taskId, session?.user?.id]);

  const handleDeleteClip = async (clipId: string) => {
    if (!session?.user?.id) return;
    if (!confirm("Are you sure you want to delete this clip?")) return;
    try {
      const res = await fetch(`${apiUrl}/tasks/${taskId}/clips/${clipId}`, {
        method: "DELETE",
        headers: { user_id: session.user.id },
      });
      if (res.ok) {
        const remaining = clips.filter((c) => c.id !== clipId);
        setClips(remaining);
        if (selectedClip?.id === clipId) setSelectedClip(remaining[0] || null);
      }
    } catch (e) {
      console.error("Failed to delete clip:", e);
    }
  };

  if (isLoading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center h-screen">
          <div className="text-center">
            <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
            <p className="text-gray-400">Loading studio…</p>
          </div>
        </div>
      </AppLayout>
    );
  }

  // Task not found
  if (!task) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center h-screen">
          <div className="text-center max-w-md">
            <h2 className="text-2xl font-bold text-white mb-2">Task not found</h2>
            <button onClick={() => router.push("/library")}
              className="px-6 py-3 rounded-lg bg-primary hover:bg-primary/90 text-white font-semibold transition-colors">
              Go to Library
            </button>
          </div>
        </div>
      </AppLayout>
    );
  }

  // No clips and not processing → empty state
  if (clips.length === 0 && !isProcessing) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center h-screen">
          <div className="text-center max-w-md">
            <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mx-auto mb-4">
              <Sparkles className="w-8 h-8 text-gray-500" />
            </div>
            <h2 className="text-2xl font-bold text-white mb-2">No clips generated yet</h2>
            <p className="text-gray-400 mb-6">
              The AI is still analyzing your video. Clips will appear here once processing is complete.
            </p>
            <button onClick={() => router.push("/library")}
              className="px-6 py-3 rounded-lg bg-primary hover:bg-primary/90 text-white font-semibold transition-colors">
              Go to Library
            </button>
          </div>
        </div>
      </AppLayout>
    );
  }

  const selectedIndex = clips.findIndex((c) => c.id === selectedClip?.id);

  return (
    <AppLayout>
      <div className="max-w-[1600px] mx-auto">
        {/* Header */}
        <div className="mb-5">
          <div className="flex items-center gap-2 mb-1">
            <Clapperboard className="w-5 h-5 text-primary" />
            <h1 className="text-2xl font-bold text-white">Viral Clips Studio</h1>
          </div>
          <p className="text-gray-400 text-sm">{task.source?.title || "Generated Clips"}</p>
        </div>

        {/* ── Generation Progress Banner ── */}
        {isProcessing && (
          <div className="glass rounded-2xl p-5 mb-5 border border-primary/20">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Loader2 className="w-4 h-4 text-primary animate-spin" />
                <span className="text-white font-semibold text-sm">Generating Clips</span>
              </div>
              <span className="text-sm font-bold text-primary">{genProgress.progress}%</span>
            </div>

            {/* Overall progress bar */}
            <div className="h-2 bg-muted rounded-full overflow-hidden mb-2">
              <div
                className="h-full bg-gradient-purple rounded-full transition-all duration-500"
                style={{ width: `${genProgress.progress}%` }}
              />
            </div>

            <p className="text-xs text-gray-400">{genProgress.message}</p>

            {/* Per-clip pill indicators */}
            {genProgress.clipsTotal > 0 && (
              <div className="flex gap-1.5 mt-3">
                {Array.from({ length: genProgress.clipsTotal }).map((_, i) => (
                  <div
                    key={i}
                    className={`flex-1 h-1.5 rounded-full transition-all duration-300 ${
                      i < genProgress.clipsCompleted
                        ? "bg-primary"
                        : i === genProgress.clipsCompleted
                        ? "bg-primary/40 animate-pulse"
                        : "bg-muted"
                    }`}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {/* Only show studio grid when we have clips */}
        {clips.length > 0 ? (
          <div className="grid grid-cols-3 gap-6">
            {/* Left Column - Video Player + Details */}
            <div className="col-span-2 space-y-4">
              {selectedClip && selectedClip.filename && (
                <div className="glass rounded-2xl p-5">
                  {/* Clip header */}
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-gradient-purple flex items-center justify-center text-white text-sm font-bold">
                        {selectedIndex + 1}
                      </div>
                      <div>
                        <p className="text-white font-semibold text-sm leading-tight">
                          Clip {selectedIndex + 1} of {clips.length}
                        </p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <Clock className="w-3 h-3 text-gray-500" />
                          <span className="text-xs text-gray-400">
                            {selectedClip.start_time} → {selectedClip.end_time}
                          </span>
                          <span className="text-gray-600">·</span>
                          <span className="text-xs text-gray-400">{Math.round(selectedClip.duration)}s</span>
                        </div>
                      </div>
                    </div>
                    <ScoreBadge score={selectedClip.relevance_score} />
                  </div>

                  {/* Video player sized to match clip aspect ratio */}
                  {(() => {
                    const ar = (task?.metadata?.aspect_ratio ?? "9:16") as "9:16" | "1:1" | "16:9";
                    const maxW = ar === "16:9" ? "max-w-full" : ar === "1:1" ? "max-w-[420px]" : "max-w-[320px]";
                    return (
                      <div className="flex justify-center">
                        <div className={`w-full ${maxW}`}>
                          <VideoPlayer
                            src={`${apiUrl}/clips/${selectedClip.filename}`}
                            aspectRatio={ar}
                          />
                        </div>
                      </div>
                    );
                  })()}

                  {/* Actions */}
                  <div className="flex items-center gap-3 mt-4">
                    <a
                      href={`${apiUrl}/clips/${selectedClip.filename}`}
                      download
                      className="flex-1 h-10 rounded-lg bg-gradient-purple hover:opacity-90 text-white font-semibold transition-all flex items-center justify-center gap-2 text-sm"
                    >
                      <Download className="w-4 h-4" />
                      Download
                    </a>
                    <button className="h-10 px-4 rounded-lg bg-muted hover:bg-muted/80 text-white font-semibold transition-all flex items-center justify-center gap-2 text-sm">
                      <Share2 className="w-4 h-4" />
                      Share
                    </button>
                    <button className="h-10 px-4 rounded-lg bg-muted hover:bg-muted/80 text-white font-semibold transition-all flex items-center justify-center gap-2 text-sm">
                      <Edit className="w-4 h-4" />
                      Edit
                    </button>
                    <button
                      onClick={() => handleDeleteClip(selectedClip.id)}
                      className="h-10 px-4 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 transition-all flex items-center justify-center"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}

              {/* If selected clip has no file yet */}
              {selectedClip && !selectedClip.filename && (
                <div className="glass rounded-2xl p-5 flex flex-col items-center justify-center gap-3 min-h-[300px]">
                  <Loader2 className="w-8 h-8 text-primary animate-spin" />
                  <p className="text-gray-400 text-sm">
                    Clip {selectedIndex + 1} is still being generated…
                  </p>
                </div>
              )}

              {/* Clip Details */}
              {selectedClip && (
                <div className="glass rounded-2xl p-5 space-y-4">
                  <h3 className="text-base font-semibold text-white">
                    Clip {selectedIndex + 1} Details
                  </h3>

                  <div className="grid grid-cols-3 gap-3">
                    <div className="bg-muted/50 rounded-xl p-3 text-center">
                      <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Relevance</p>
                      <p className="text-2xl font-bold text-white">
                        {Math.round(selectedClip.relevance_score * 100)}
                        <span className="text-sm text-gray-400">%</span>
                      </p>
                    </div>
                    <div className="bg-muted/50 rounded-xl p-3 text-center">
                      <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Start</p>
                      <p className="text-xl font-bold text-white font-mono">{selectedClip.start_time}</p>
                    </div>
                    <div className="bg-muted/50 rounded-xl p-3 text-center">
                      <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">End</p>
                      <p className="text-xl font-bold text-white font-mono">{selectedClip.end_time}</p>
                    </div>
                  </div>

                  {selectedClip.reasoning && (
                    <div>
                      <div className="flex items-center gap-2 mb-2">
                        <Brain className="w-4 h-4 text-primary" />
                        <label className="text-xs font-semibold text-primary uppercase tracking-wide">
                          AI Reasoning
                        </label>
                      </div>
                      <p className="text-gray-300 text-sm leading-relaxed bg-primary/5 border border-primary/15 rounded-xl p-3">
                        {selectedClip.reasoning}
                      </p>
                    </div>
                  )}

                  {selectedClip.text && (
                    <div>
                      <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2 block">
                        Transcript
                      </label>
                      <p className="text-gray-400 text-sm leading-relaxed">{selectedClip.text}</p>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Right Column - Clips List */}
            <div className="space-y-4">
              <div className="glass rounded-2xl p-5">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-base font-semibold text-white">Generated Clips</h3>
                  <span className="text-xs text-gray-500 bg-muted/60 px-2 py-1 rounded-full">
                    {clips.length} clips
                  </span>
                </div>

                <div className="space-y-2.5 max-h-[680px] overflow-y-auto pr-1">
                  {clips.map((clip, index) => {
                    const isSelected = selectedClip?.id === clip.id;
                    const pct = Math.round(clip.relevance_score * 100);

                    return (
                      <button
                        key={clip.id}
                        onClick={() => setSelectedClip(clip)}
                        className={`w-full text-left p-3.5 rounded-xl border transition-all ${
                          isSelected
                            ? "border-primary bg-primary/10 shadow-sm shadow-primary/20"
                            : "border-border hover:border-primary/40 hover:bg-muted/30"
                        }`}
                      >
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2.5">
                            <div className={`w-7 h-7 rounded-lg flex items-center justify-center text-white text-xs font-bold flex-shrink-0 ${isSelected ? "bg-primary" : "bg-muted"}`}>
                              {index + 1}
                            </div>
                            <div className="flex items-center gap-1 text-xs text-gray-500">
                              <Clock className="w-3 h-3" />
                              <span className="font-mono">{clip.start_time}</span>
                              <ChevronRight className="w-3 h-3" />
                              <span className="font-mono">{clip.end_time}</span>
                            </div>
                          </div>
                          <ScoreBadge score={clip.relevance_score} />
                        </div>

                        <div className="flex items-center gap-2 mb-2">
                          <div className="flex-1 h-1 bg-muted rounded-full overflow-hidden">
                            <div className="h-full bg-gradient-purple rounded-full transition-all" style={{ width: `${pct}%` }} />
                          </div>
                          <span className="text-xs text-gray-500">{Math.round(clip.duration)}s</span>
                        </div>

                        {clip.reasoning && (
                          <p className="text-xs text-gray-400 leading-snug line-clamp-2">{clip.reasoning}</p>
                        )}

                        {!clip.filename && (
                          <div className="mt-2 flex items-center gap-2 text-xs text-yellow-500">
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            Generating…
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="glass rounded-xl p-4">
                <h4 className="text-xs font-semibold text-gray-500 mb-3 uppercase tracking-wide">Bulk Actions</h4>
                <div className="space-y-2">
                  <button className="w-full h-9 rounded-lg bg-muted hover:bg-muted/80 text-white text-sm font-medium transition-all">
                    Download All
                  </button>
                  <button className="w-full h-9 rounded-lg bg-muted hover:bg-muted/80 text-white text-sm font-medium transition-all">
                    Share All
                  </button>
                </div>
              </div>
            </div>
          </div>
        ) : (
          /* Processing but no clips in DB yet */
          <div className="flex flex-col items-center justify-center py-24 gap-4">
            <Loader2 className="w-10 h-10 text-primary animate-spin" />
            <p className="text-gray-400 text-sm">Preparing your clips…</p>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
