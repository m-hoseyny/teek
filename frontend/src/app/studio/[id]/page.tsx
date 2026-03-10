"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { AppLayout } from "@/components/layout/AppLayout";
import { useSession } from "@/lib/auth-client";
import { useJwt } from "@/contexts/jwt-context";
import { VideoPlayer } from "@/components/clip/VideoPlayer";
import {
  Download, Share2, Edit, Trash2, Sparkles,
  Clock, Brain, TrendingUp, ChevronRight, Loader2, Clapperboard, RotateCcw,
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
    : pct >= 60 ? "from-blue-500 to-blue-400"
    : pct >= 40 ? "from-amber-500 to-yellow-400"
    : "from-gray-500 to-gray-400";
  return (
    <div className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-gradient-to-r ${color} text-white text-xs font-bold`}>
      <TrendingUp className="w-3 h-3" />
      {pct}%
    </div>
  );
}

export default function StudioPage() {
  const params = useParams();
  const router = useRouter();
  const { data: session } = useSession();
  const { jwt, apiFetch } = useJwt();
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
  const [videoObjectUrl, setVideoObjectUrl] = useState<string | null>(null);

  const [isReopening, setIsReopening] = useState(false);

  const handleReopen = async () => {
    if (!jwt) return;
    setIsReopening(true);
    try {
      await apiFetch(`${apiUrl}/tasks/${taskId}/reopen`, {
        method: "POST",
      });
      router.push(`/review/${taskId}`);
    } catch (e) {
      console.error("Failed to reopen task:", e);
      setIsReopening(false);
    }
  };

  const eventSourceRef = useRef<EventSource | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const connectSSERef = useRef<(() => void) | null>(null);

  const fetchClips = useCallback(async () => {
    if (!jwt) return;
    try {
      const res = await apiFetch(`${apiUrl}/tasks/${taskId}/clips`);
      if (res.ok) {
        const data = await res.json();
        const fetched: Clip[] = data.clips || [];
        setClips(fetched);
        setSelectedClip((prev) => prev ?? fetched[0] ?? null);
      }
    } catch (e) {
      console.error("Failed to fetch clips:", e);
    }
  }, [apiUrl, taskId, jwt, apiFetch]);

  const connectSSE = useCallback(() => {
    if (!jwt) return;
    if (eventSourceRef.current) eventSourceRef.current.close();

    const es = new EventSource(`/api/tasks/${taskId}/progress`);

    es.addEventListener("progress", (evt: MessageEvent) => {
      try {
        const data = JSON.parse(evt.data);
        const meta = data.metadata || {};
        setGenProgress({
          progress: data.progress ?? 0,
          message: data.message || "Generating clips…",
          clipsCompleted: meta.clips_completed ?? 0,
          clipsTotal: meta.clips_total ?? 0,
        });
        if (data.status === "completed") { es.close(); setIsProcessing(false); fetchClips(); }
        else if (data.status === "error" || data.status === "failed") { es.close(); setIsProcessing(false); }
      } catch {}
    });

    es.addEventListener("status", (evt: MessageEvent) => {
      try {
        const data = JSON.parse(evt.data);
        if (data.status === "completed") { es.close(); setIsProcessing(false); fetchClips(); }
      } catch {}
    });

    es.addEventListener("close", () => es.close());

    es.onerror = () => {
      es.close();
      if (pollRef.current) clearInterval(pollRef.current);
      pollRef.current = setInterval(async () => {
        if (!jwt) return;
        try {
          const res = await apiFetch(`${apiUrl}/tasks/${taskId}`);
          if (res.ok) {
            const data = await res.json();
            if (data.status === "completed") { clearInterval(pollRef.current!); setIsProcessing(false); fetchClips(); }
          }
        } catch {}
      }, 4000);
    };

    eventSourceRef.current = es;
  }, [apiUrl, taskId, jwt, apiFetch, fetchClips]);

  useEffect(() => { connectSSERef.current = connectSSE; }, [connectSSE]);

  useEffect(() => {
    if (!jwt || !taskId) return;
    const init = async () => {
      try {
        const [taskRes, clipsRes] = await Promise.all([
          apiFetch(`${apiUrl}/tasks/${taskId}`),
          apiFetch(`${apiUrl}/tasks/${taskId}/clips`),
        ]);
        if (taskRes.ok) {
          const taskData = await taskRes.json();
          setTask(taskData);
          if (taskData.status === "processing") { setIsProcessing(true); connectSSERef.current?.(); }
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
    return () => { eventSourceRef.current?.close(); if (pollRef.current) clearInterval(pollRef.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taskId, jwt]);

  // Fetch selected clip video as a blob to avoid static-file URL issues
  useEffect(() => {
    if (!selectedClip?.filename) {
      setVideoObjectUrl(null);
      return;
    }

    let objectUrl: string | null = null;
    let cancelled = false;

    const fetchVideo = async () => {
      setVideoObjectUrl(null);
      try {
        const res = await apiFetch(`${apiUrl}/clips/${selectedClip.filename}`);
        if (!cancelled && res.ok) {
          const blob = await res.blob();
          objectUrl = URL.createObjectURL(blob);
          setVideoObjectUrl(objectUrl);
        }
      } catch (e) {
        console.error("Failed to fetch clip video:", e);
      }
    };

    fetchVideo();

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      setVideoObjectUrl(null);
    };
  }, [selectedClip?.filename, apiUrl, jwt, apiFetch]);

  const handleDeleteClip = async (clipId: string) => {
    if (!jwt) return;
    if (!confirm("Are you sure you want to delete this clip?")) return;
    try {
      const res = await apiFetch(`${apiUrl}/tasks/${taskId}/clips/${clipId}`, {
        method: "DELETE",
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
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
            <p className="text-gray-400">Loading studio…</p>
          </div>
        </div>
      </AppLayout>
    );
  }

  if (!task) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <h2 className="text-xl font-bold text-white mb-4">Task not found</h2>
            <button onClick={() => router.push("/library")}
              className="px-6 py-3 rounded-lg bg-primary text-white font-semibold">
              Go to Library
            </button>
          </div>
        </div>
      </AppLayout>
    );
  }

  if (clips.length === 0 && !isProcessing) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center h-64">
          <div className="text-center max-w-sm px-4">
            <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mx-auto mb-4">
              <Sparkles className="w-8 h-8 text-gray-500" />
            </div>
            <h2 className="text-xl font-bold text-white mb-2">No clips generated yet</h2>
            <p className="text-gray-400 mb-6 text-sm">The AI is still analyzing your video.</p>
            <button onClick={() => router.push("/library")}
              className="px-6 py-3 rounded-lg bg-primary text-white font-semibold">
              Go to Library
            </button>
          </div>
        </div>
      </AppLayout>
    );
  }

  const selectedIndex = clips.findIndex((c) => c.id === selectedClip?.id);
  const ar = (task?.metadata?.aspect_ratio ?? "9:16") as "9:16" | "1:1" | "16:9";
  const maxW = ar === "16:9" ? "max-w-full" : ar === "1:1" ? "max-w-[400px]" : "max-w-[280px]";

  return (
    <AppLayout>
      <div className="max-w-[1600px] mx-auto space-y-4">

        {/* ── Page Header ── */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <Clapperboard className="w-5 h-5 text-primary flex-shrink-0" />
            <div className="min-w-0">
              <h1 className="text-xl md:text-2xl font-bold text-white leading-tight">Viral Clips Studio</h1>
              <p className="text-gray-400 text-sm truncate">{task.source?.title || "Generated Clips"}</p>
            </div>
          </div>
          <button
            onClick={handleReopen}
            disabled={isReopening}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-muted hover:bg-muted/80 text-white text-sm font-medium transition-all flex-shrink-0 disabled:opacity-50"
          >
            {isReopening ? <Loader2 className="w-4 h-4 animate-spin" /> : <RotateCcw className="w-4 h-4" />}
            Reopen
          </button>
        </div>

        {/* ── Generation Progress Banner ── */}
        {isProcessing && (
          <div className="glass rounded-2xl p-4 md:p-5 border border-primary/20">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Loader2 className="w-4 h-4 text-primary animate-spin" />
                <span className="text-white font-semibold text-sm">Generating Clips</span>
              </div>
              <span className="text-sm font-bold text-primary">{genProgress.progress}%</span>
            </div>
            <div className="h-2 bg-muted rounded-full overflow-hidden mb-2">
              <div className="h-full bg-gradient-purple rounded-full transition-all duration-500"
                style={{ width: `${genProgress.progress}%` }} />
            </div>
            <p className="text-xs text-gray-400">{genProgress.message}</p>
            {genProgress.clipsTotal > 0 && (
              <div className="flex gap-1.5 mt-3">
                {Array.from({ length: genProgress.clipsTotal }).map((_, i) => (
                  <div key={i} className={`flex-1 h-1.5 rounded-full transition-all duration-300 ${
                    i < genProgress.clipsCompleted ? "bg-primary"
                    : i === genProgress.clipsCompleted ? "bg-primary/40 animate-pulse"
                    : "bg-muted"
                  }`} />
                ))}
              </div>
            )}
          </div>
        )}

        {clips.length > 0 ? (
          <>
            {/* ── Mobile: horizontal clip strip ── */}
            <div className="lg:hidden flex gap-2 overflow-x-auto pb-1 -mx-4 px-4">
              {clips.map((clip, index) => {
                const isSelected = selectedClip?.id === clip.id;
                return (
                  <button
                    key={clip.id}
                    onClick={() => setSelectedClip(clip)}
                    className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-xl border text-xs font-medium transition-all ${
                      isSelected
                        ? "border-primary bg-primary/15 text-white"
                        : "border-border bg-card text-gray-400"
                    }`}
                  >
                    <div className={`w-5 h-5 rounded flex items-center justify-center text-xs font-bold ${isSelected ? "bg-primary text-white" : "bg-muted text-gray-400"}`}>
                      {index + 1}
                    </div>
                    <ScoreBadge score={clip.relevance_score} />
                    {!clip.filename && <Loader2 className="w-3 h-3 animate-spin text-yellow-400" />}
                  </button>
                );
              })}
            </div>

            {/* ── Main layout ── */}
            <div className="flex flex-col lg:grid lg:grid-cols-3 lg:items-start gap-4 lg:gap-6">

              {/* Left: Video + Details */}
              <div className="lg:col-span-2 flex flex-col gap-4">

                {/* Video Player Card */}
                {selectedClip && (
                  <div className="glass rounded-2xl border border-border">
                    {/* Card Header */}
                    <div className="flex items-center justify-between px-4 md:px-5 py-4 border-b border-border">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-8 h-8 rounded-lg bg-gradient-purple flex items-center justify-center text-white text-sm font-bold flex-shrink-0">
                          {selectedIndex + 1}
                        </div>
                        <div className="min-w-0">
                          <p className="text-white font-semibold text-sm">
                            Clip {selectedIndex + 1} <span className="text-gray-500 font-normal">of {clips.length}</span>
                          </p>
                          <div className="flex items-center gap-1.5 text-xs text-gray-500 mt-0.5">
                            <Clock className="w-3 h-3 flex-shrink-0" />
                            <span className="font-mono">{selectedClip.start_time} → {selectedClip.end_time}</span>
                            <span>·</span>
                            <span>{Math.round(selectedClip.duration)}s</span>
                          </div>
                        </div>
                      </div>
                      <ScoreBadge score={selectedClip.relevance_score} />
                    </div>

                    {/* Video + Action Buttons — same padding block */}
                    <div className="p-4 md:p-5 flex flex-col gap-4">
                      {selectedClip.filename ? (
                        <>
                          {/* Video */}
                          <div className="flex justify-center">
                            <div className={`w-full ${maxW} relative`}>
                              {videoObjectUrl ? (
                                <VideoPlayer
                                  src={videoObjectUrl}
                                  aspectRatio={ar}
                                />
                              ) : (
                                <div className="flex flex-col items-center justify-center gap-3 py-16">
                                  <Loader2 className="w-8 h-8 text-primary animate-spin" />
                                  <p className="text-gray-400 text-sm">Loading video…</p>
                                </div>
                              )}
                              {isProcessing && (
                                <div className="absolute inset-0 z-20 rounded-lg bg-black/60 flex flex-col items-center justify-center gap-2 cursor-not-allowed">
                                  <Loader2 className="w-8 h-8 text-primary animate-spin" />
                                  <p className="text-xs text-white/70">Generating clips…</p>
                                </div>
                              )}
                            </div>
                          </div>

                          {/* Action Buttons — directly below video, inside same section */}
                          <div className="flex items-center gap-2 flex-wrap pt-1 border-t border-border">
                            {videoObjectUrl && (
                              <a
                                href={videoObjectUrl}
                                download={selectedClip.filename}
                                className="flex-1 min-w-[100px] h-10 rounded-lg bg-gradient-purple hover:opacity-90 text-white font-semibold transition-all flex items-center justify-center gap-2 text-sm"
                              >
                                <Download className="w-4 h-4" />
                                Download
                              </a>
                            )}
                            <button className="h-10 px-4 rounded-lg bg-muted hover:bg-muted/80 text-white font-medium transition-all flex items-center gap-2 text-sm">
                              <Share2 className="w-4 h-4" />
                              Share
                            </button>
                            <button className="h-10 px-4 rounded-lg bg-muted hover:bg-muted/80 text-white font-medium transition-all flex items-center gap-2 text-sm">
                              <Edit className="w-4 h-4" />
                              Edit
                            </button>
                            <button
                              onClick={() => handleDeleteClip(selectedClip.id)}
                              className="h-10 px-3 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 transition-all flex items-center justify-center"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </>
                      ) : (
                        <div className="flex flex-col items-center justify-center gap-3 py-16">
                          <Loader2 className="w-8 h-8 text-primary animate-spin" />
                          <p className="text-gray-400 text-sm">Clip {selectedIndex + 1} is still being generated…</p>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Clip Details Card */}
                {selectedClip && (
                  <div className="glass rounded-2xl border border-border p-4 md:p-5 space-y-4">
                    <h3 className="text-sm font-semibold text-white uppercase tracking-wide">
                      Clip {selectedIndex + 1} Details
                    </h3>

                    <div className="grid grid-cols-3 gap-2">
                      <div className="bg-muted/50 rounded-xl p-3 text-center">
                        <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Relevance</p>
                        <p className="text-xl font-bold text-white">
                          {Math.round(selectedClip.relevance_score * 100)}<span className="text-sm text-gray-400">%</span>
                        </p>
                      </div>
                      <div className="bg-muted/50 rounded-xl p-3 text-center">
                        <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Start</p>
                        <p className="text-sm md:text-base font-bold text-white font-mono">{selectedClip.start_time}</p>
                      </div>
                      <div className="bg-muted/50 rounded-xl p-3 text-center">
                        <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">End</p>
                        <p className="text-sm md:text-base font-bold text-white font-mono">{selectedClip.end_time}</p>
                      </div>
                    </div>

                    {selectedClip.reasoning && (
                      <div>
                        <div className="flex items-center gap-2 mb-2">
                          <Brain className="w-4 h-4 text-primary" />
                          <span className="text-xs font-semibold text-primary uppercase tracking-wide">AI Reasoning</span>
                        </div>
                        <p className="text-gray-300 text-sm leading-relaxed bg-primary/5 border border-primary/15 rounded-xl p-3">
                          {selectedClip.reasoning}
                        </p>
                      </div>
                    )}

                    {selectedClip.text && (
                      <div>
                        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Transcript</p>
                        <p className="text-gray-400 text-sm leading-relaxed">{selectedClip.text}</p>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Right: Clips List (desktop only, hidden on mobile) */}
              <div className="hidden lg:flex flex-col gap-4">
                <div className="glass rounded-2xl border border-border p-5">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-base font-semibold text-white">Generated Clips</h3>
                    <span className="text-xs text-gray-500 bg-muted/60 px-2 py-1 rounded-full">{clips.length} clips</span>
                  </div>

                  <div className="space-y-2 max-h-[620px] overflow-y-auto pr-1">
                    {clips.map((clip, index) => {
                      const isSelected = selectedClip?.id === clip.id;
                      const pct = Math.round(clip.relevance_score * 100);
                      return (
                        <button
                          key={clip.id}
                          onClick={() => setSelectedClip(clip)}
                          className={`w-full text-left p-3 rounded-xl border transition-all ${
                            isSelected
                              ? "border-primary bg-primary/10 shadow-sm shadow-primary/20"
                              : "border-border hover:border-primary/40 hover:bg-muted/30"
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2 mb-2">
                            <div className="flex items-center gap-2 min-w-0">
                              <div className={`w-6 h-6 rounded flex items-center justify-center text-white text-xs font-bold flex-shrink-0 ${isSelected ? "bg-primary" : "bg-muted"}`}>
                                {index + 1}
                              </div>
                              <div className="flex items-center gap-0.5 text-xs text-gray-500 flex-wrap">
                                <Clock className="w-3 h-3 flex-shrink-0" />
                                <span className="font-mono">{clip.start_time}</span>
                                <ChevronRight className="w-3 h-3 flex-shrink-0" />
                                <span className="font-mono">{clip.end_time}</span>
                              </div>
                            </div>
                            <div className="flex-shrink-0">
                              <ScoreBadge score={clip.relevance_score} />
                            </div>
                          </div>

                          <div className="flex items-center gap-2">
                            <div className="flex-1 h-1 bg-muted rounded-full overflow-hidden">
                              <div className="h-full bg-gradient-purple rounded-full" style={{ width: `${pct}%` }} />
                            </div>
                            <span className="text-xs text-gray-500 flex-shrink-0">{Math.round(clip.duration)}s</span>
                          </div>

                          {clip.reasoning && (
                            <p className="text-xs text-gray-400 leading-snug line-clamp-2 mt-1.5">{clip.reasoning}</p>
                          )}

                          {!clip.filename && (
                            <div className="mt-2 flex items-center gap-1.5 text-xs text-yellow-500">
                              <Loader2 className="w-3 h-3 animate-spin" />
                              Generating…
                            </div>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="glass rounded-xl border border-border p-4">
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
          </>
        ) : (
          <div className="flex flex-col items-center justify-center py-24 gap-4">
            <Loader2 className="w-10 h-10 text-primary animate-spin" />
            <p className="text-gray-400 text-sm">Preparing your clips…</p>
          </div>
        )}

      </div>
    </AppLayout>
  );
}
