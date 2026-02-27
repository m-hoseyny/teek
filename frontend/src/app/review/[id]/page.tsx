"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { AppLayout } from "@/components/layout/AppLayout";
import { useSession } from "@/lib/auth-client";
import { Play, Pause, Eye, EyeOff, Check, Scissors } from "lucide-react";
import { SubtitlePreview } from "@/components/clip/SubtitlePreview";

interface Word {
  text: string;
  start: number; // absolute ms from video start
  end: number;
}

interface TranscriptSegment {
  id: number;
  start_time: string;
  end_time: string;
  start_ms: number;
  end_ms: number;
  text: string;
  word_count: number;
}

interface Clip {
  id: string;
  start_time: string;
  end_time: string;
  duration: number;
  text: string;
  relevance_score: number;
  clip_order: number;
}

interface TaskData {
  id: string;
  status: string;
  source: {
    title: string;
    url: string;
  };
  metadata?: {
    video_path?: string;
  };
}

interface PycapsTemplate {
  name: string;
  display_name: string;
  description: string;
  is_default: boolean;
}

const CLIP_COLORS = [
  "#256af4", "#3B82F6", "#10B981", "#F59E0B",
  "#EF4444", "#EC4899", "#14B8A6", "#256af4",
];

// Matches Arabic, Hebrew, and other RTL scripts
const RTL_REGEX = /[\u0591-\u07FF\uFB1D-\uFDFD\uFE70-\uFEFC]/;
function isRTL(text: string): boolean {
  return RTL_REGEX.test(text);
}

/** Parse "HH:MM:SS", "MM:SS", or float-string → seconds */
function parseTs(ts: string): number {
  if (!ts) return 0;
  const parts = ts.split(":").map(Number);
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return parseFloat(ts) || 0;
}

/** Format seconds → MM:SS */
function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
}

export default function ReviewPage() {
  const params = useParams();
  const router = useRouter();
  const { data: session } = useSession();
  const taskId = params.id as string;
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

  const [task, setTask] = useState<TaskData | null>(null);
  const [segments, setSegments] = useState<TranscriptSegment[]>([]);
  const [words, setWords] = useState<Word[]>([]);
  const [clips, setClips] = useState<Clip[]>([]);
  const [templates, setTemplates] = useState<PycapsTemplate[]>([]);
  const [isLoadingTemplates, setIsLoadingTemplates] = useState(false);
  const [activeTab, setActiveTab] = useState<"insights" | "transcript">("transcript");
  const [selectedStyle, setSelectedStyle] = useState("word-focus");
  const [showSubtitles, setShowSubtitles] = useState(true);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isGenerating, setIsGenerating] = useState(false);
  const [videoSrc, setVideoSrc] = useState<string | null>(null);
  const [transitionsEnabled, setTransitionsEnabled] = useState(false);
  const [aspectRatio, setAspectRatio] = useState<"9:16" | "1:1" | "16:9">("9:16");
  const [savingClipId, setSavingClipId] = useState<string | null>(null);
  const [subtitleStyle, setSubtitleStyle] = useState<{ font_size: number }>({ font_size: 28 });

  const videoRef = useRef<HTMLVideoElement>(null);
  const animFrameRef = useRef<number>();

  // Fetch task + segments + words + clips
  useEffect(() => {
    if (!session?.user?.id || !taskId) return;
    const uid = session.user.id;

    const fetchTask = async () => {
      const res = await fetch(`${apiUrl}/tasks/${taskId}`, { headers: { user_id: uid } });
      if (res.ok) setTask(await res.json());
    };

    const fetchSegments = async () => {
      const res = await fetch(`${apiUrl}/tasks/${taskId}/transcript/segments`, { headers: { user_id: uid } });
      if (res.ok) {
        const data = await res.json();
        setSegments(data.segments || []);
      }
    };

    const fetchWords = async () => {
      const res = await fetch(`${apiUrl}/tasks/${taskId}/transcript/words`, { headers: { user_id: uid } });
      if (res.ok) {
        const data = await res.json();
        setWords(data.words || []);
      }
    };

    const fetchVideo = async () => {
      const res = await fetch(`${apiUrl}/tasks/${taskId}/source-video`, { headers: { user_id: uid } });
      if (res.ok) {
        const blob = await res.blob();
        setVideoSrc(URL.createObjectURL(blob));
      }
    };

    const fetchClips = async () => {
      const res = await fetch(`${apiUrl}/tasks/${taskId}/clips`, { headers: { user_id: uid } });
      if (res.ok) {
        const data = await res.json();
        setClips(data.clips || []);
      }
    };

    const fetchSubtitleDefaults = async () => {
      try {
        const res = await fetch(`${apiUrl}/subtitle-style/defaults`);
        if (res.ok) {
          const data = await res.json();
          if (data.defaults?.font_size) {
            setSubtitleStyle({ font_size: data.defaults.font_size });
          }
        }
      } catch {
        // keep default
      }
    };

    fetchTask();
    fetchSegments();
    fetchWords();
    fetchVideo();
    fetchClips();
    fetchSubtitleDefaults();
  }, [taskId, session?.user?.id, apiUrl]);

  // Fetch available pycaps templates from the backend
  useEffect(() => {
    const load = async () => {
      try {
        setIsLoadingTemplates(true);
        const res = await fetch(`${apiUrl}/pycaps-templates`);
        if (res.ok) {
          const data = await res.json();
          const list: PycapsTemplate[] = data.templates || [];
          setTemplates(list);
          // Set the default template as selected if we haven't picked one yet
          const def = list.find((t) => t.is_default);
          if (def) setSelectedStyle(def.name);
        }
      } catch {
        // keep default
      } finally {
        setIsLoadingTemplates(false);
      }
    };
    load();
  }, [apiUrl]);

  // Smooth currentTime updates via requestAnimationFrame
  useEffect(() => {
    const tick = () => {
      if (videoRef.current) {
        setCurrentTime(videoRef.current.currentTime);
      }
      animFrameRef.current = requestAnimationFrame(tick);
    };
    animFrameRef.current = requestAnimationFrame(tick);
    return () => { if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current); };
  }, []);

  const handlePlayPause = () => {
    if (!videoRef.current) return;
    if (isPlaying) videoRef.current.pause();
    else videoRef.current.play();
    setIsPlaying(!isPlaying);
  };

  const handleLoadedMetadata = () => {
    if (videoRef.current) setDuration(videoRef.current.duration);
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const time = parseFloat(e.target.value);
    if (videoRef.current) videoRef.current.currentTime = time;
    setCurrentTime(time);
  };

  const seekTo = (seconds: number) => {
    if (videoRef.current) {
      videoRef.current.currentTime = seconds;
      setCurrentTime(seconds);
    }
  };

  const handleSegmentClick = (segment: TranscriptSegment) => {
    seekTo(segment.start_ms / 1000);
  };

  const handleSegmentEdit = (id: number, newText: string) => {
    setSegments((prev) =>
      prev.map((seg) => (seg.id === id ? { ...seg, text: newText } : seg))
    );
  };

  const handleSaveTranscript = async () => {
    if (!session?.user?.id) return;
    try {
      await fetch(`${apiUrl}/tasks/${taskId}/transcript/segments`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", user_id: session.user.id },
        body: JSON.stringify({ segments }),
      });
    } catch (error) {
      console.error("Failed to save transcript:", error);
    }
  };

  const handleAdjustClipTime = async (
    clip: Clip,
    field: "start" | "end",
    deltaSeconds: number
  ) => {
    const startSec = parseTs(clip.start_time);
    const endSec = parseTs(clip.end_time);

    let newStart = startSec;
    let newEnd = endSec;

    if (field === "start") {
      newStart = Math.max(0, startSec + deltaSeconds);
      // keep at least 5s clip and don't overlap end
      if (newStart >= newEnd - 5) return;
    } else {
      newEnd = endSec + deltaSeconds;
      if (duration > 0) newEnd = Math.min(duration, newEnd);
      // keep at least 5s clip
      if (newEnd <= newStart + 5) return;
    }

    // Optimistic update
    setClips((prev) =>
      prev.map((c) =>
        c.id === clip.id
          ? { ...c, start_time: String(newStart), end_time: String(newEnd), duration: newEnd - newStart }
          : c
      )
    );

    setSavingClipId(clip.id);
    try {
      await fetch(`${apiUrl}/tasks/${taskId}/clips/${clip.id}/time`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", user_id: session!.user.id },
        body: JSON.stringify({ start_time: String(newStart), end_time: String(newEnd) }),
      });
    } catch (error) {
      console.error("Failed to update clip time:", error);
    } finally {
      setSavingClipId(null);
    }
  };

  const handleGenerateClips = async () => {
    if (!session?.user?.id) return;
    setIsGenerating(true);
    try {
      await handleSaveTranscript();
      const response = await fetch(`${apiUrl}/tasks/${taskId}/generate-clips`, {
        method: "POST",
        headers: { "Content-Type": "application/json", user_id: session.user.id },
        body: JSON.stringify({
          transitions_enabled: transitionsEnabled,
          aspect_ratio: aspectRatio,
          subtitle_style: subtitleStyle,
          pycaps_template: selectedStyle,
        }),
      });
      if (response.ok) router.push(`/studio/${taskId}`);
    } catch (error) {
      console.error("Failed to generate clips:", error);
      setIsGenerating(false);
    }
  };

  if (!task) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center h-screen">
          <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="max-w-[1600px] mx-auto">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-white mb-2">Review & Edit Transcript</h1>
          <p className="text-gray-400">{task.source?.title || "Video Analysis"}</p>
        </div>

        <div className="grid grid-cols-3 gap-6">
          {/* Left Column - Video Player */}
          <div className="col-span-2 space-y-6">
            {/* Video Player */}
            <div className="glass rounded-2xl p-6">
              {/* Subtitle toggle */}
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm text-gray-400">
                  {words.length > 0 ? `${words.length} words loaded` : "Loading word timings..."}
                </span>
                <button
                  onClick={() => setShowSubtitles((v) => !v)}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                    showSubtitles ? "bg-primary/20 text-primary" : "bg-muted text-gray-400 hover:text-white"
                  }`}
                >
                  {showSubtitles ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                  {showSubtitles ? "Subtitles ON" : "Subtitles OFF"}
                </button>
              </div>

              {/* Player container — relative so SubtitlePreview can overlay */}
              <div className="relative aspect-video bg-black rounded-lg overflow-hidden mb-4">
                {videoSrc ? (
                  <video
                    ref={videoRef}
                    className="w-full h-full object-contain"
                    src={videoSrc}
                    onLoadedMetadata={handleLoadedMetadata}
                    onPlay={() => setIsPlaying(true)}
                    onPause={() => setIsPlaying(false)}
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin" />
                  </div>
                )}

                {/* Subtitle overlay */}
                {showSubtitles && words.length > 0 && (
                  <SubtitlePreview
                    words={words}
                    currentTime={currentTime}
                    clipStartSeconds={0}
                    template={selectedStyle}
                    subtitleStyle={subtitleStyle}
                  />
                )}

                {/* Ratio crop preview overlay */}
                {(() => {
                  // Player is 16:9. Calculate side-bar widths for each output ratio.
                  // crop_w / player_w = target_ratio / (16/9)
                  const ratioMap: Record<string, number> = {
                    "9:16": (9 / 16) / (16 / 9), // ≈ 31.64 %
                    "1:1":  1        / (16 / 9),  // = 56.25 %
                    "16:9": 1,                     // full width
                  };
                  const cropFrac = ratioMap[aspectRatio] ?? 1;
                  if (cropFrac >= 1) return null;
                  const sideBarPct = ((1 - cropFrac) / 2) * 100;
                  const centerPct  = cropFrac * 100;
                  return (
                    <div className="absolute inset-0 pointer-events-none" style={{ zIndex: 5 }}>
                      {/* Left dark bar */}
                      <div
                        className="absolute top-0 left-0 bottom-0 bg-black/55"
                        style={{ width: `${sideBarPct}%` }}
                      />
                      {/* Right dark bar */}
                      <div
                        className="absolute top-0 right-0 bottom-0 bg-black/55"
                        style={{ width: `${sideBarPct}%` }}
                      />
                      {/* Safe-zone border */}
                      <div
                        className="absolute top-0 bottom-0 border-x-2 border-white/30 border-dashed"
                        style={{ left: `${sideBarPct}%`, width: `${centerPct}%` }}
                      />
                      {/* Label */}
                      <div
                        className="absolute top-2 flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold text-white/90 bg-black/50 border border-white/20"
                        style={{ left: `calc(${sideBarPct}% + 6px)` }}
                      >
                        <span>{aspectRatio}</span>
                      </div>
                    </div>
                  );
                })()}

                {/* Play button overlay */}
                {!isPlaying && videoSrc && (
                  <button
                    onClick={handlePlayPause}
                    className="absolute inset-0 flex items-center justify-center"
                    style={{ zIndex: 10 }}
                  >
                    <div className="w-20 h-20 rounded-full bg-gradient-purple flex items-center justify-center glow-purple">
                      <Play className="w-10 h-10 text-white ml-1" fill="currentColor" />
                    </div>
                  </button>
                )}

                {/* Controls overlay */}
                <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-4" style={{ zIndex: 10 }}>
                  <div className="flex items-center gap-3 mb-2">
                    <button onClick={handlePlayPause} className="text-white hover:text-primary transition-colors">
                      {isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />}
                    </button>
                    <span className="text-white text-sm font-mono">
                      {formatTime(currentTime)} / {formatTime(duration)}
                    </span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max={duration || 0}
                    step="0.1"
                    value={currentTime}
                    onChange={handleSeek}
                    className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer"
                    style={{
                      background: `linear-gradient(to right, #256af4 0%, #256af4 ${(currentTime / (duration || 1)) * 100}%, #374151 ${(currentTime / (duration || 1)) * 100}%, #374151 100%)`,
                    }}
                  />
                </div>
              </div>
            </div>

            {/* Clip Timeline */}
            <div className="glass rounded-2xl p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-primary/20 flex items-center justify-center">
                    <Scissors className="w-4 h-4 text-primary" />
                  </div>
                  <h3 className="font-semibold text-white">Clip Timeline</h3>
                </div>
                {clips.length > 0 && (
                  <span className="text-xs font-semibold text-primary px-2 py-1 rounded bg-primary/20">
                    {clips.length} clip{clips.length !== 1 ? "s" : ""}
                  </span>
                )}
              </div>

              {/* Timeline bar */}
              <div className="relative h-10 bg-gray-800 rounded-lg overflow-hidden mb-1">
                {/* Clip blocks */}
                {duration > 0 && clips.map((clip, i) => {
                  const startSec = parseTs(clip.start_time);
                  const endSec = parseTs(clip.end_time);
                  const left = (startSec / duration) * 100;
                  const width = Math.max(((endSec - startSec) / duration) * 100, 0.5);
                  const color = CLIP_COLORS[i % CLIP_COLORS.length];
                  return (
                    <div
                      key={clip.id}
                      className="absolute top-0 bottom-0 cursor-pointer hover:brightness-125 transition-all flex items-center justify-center group"
                      style={{ left: `${left}%`, width: `${width}%`, backgroundColor: color }}
                      onClick={() => seekTo(startSec)}
                      title={`Clip ${i + 1}: ${formatTime(startSec)} → ${formatTime(endSec)}`}
                    >
                      <span className="text-white text-xs font-bold drop-shadow">{i + 1}</span>
                    </div>
                  );
                })}

                {/* Playhead */}
                {duration > 0 && (
                  <div
                    className="absolute top-0 bottom-0 w-0.5 bg-white/90 pointer-events-none z-10"
                    style={{ left: `${(currentTime / duration) * 100}%` }}
                  />
                )}

                {/* Empty state */}
                {clips.length === 0 && (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span className="text-xs text-gray-500">No clips yet</span>
                  </div>
                )}
              </div>

              {/* Time axis */}
              <div className="flex justify-between text-xs text-gray-500 mb-5 px-0.5">
                <span>00:00</span>
                <span>{formatTime(duration * 0.25)}</span>
                <span>{formatTime(duration * 0.5)}</span>
                <span>{formatTime(duration * 0.75)}</span>
                <span>{formatTime(duration)}</span>
              </div>

              {/* Clip time editor */}
              {clips.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs text-gray-400 uppercase tracking-wide font-semibold mb-3">Edit Clip Timing</p>
                  {clips.map((clip, i) => {
                    const startSec = parseTs(clip.start_time);
                    const endSec = parseTs(clip.end_time);
                    const clipDur = endSec - startSec;
                    const color = CLIP_COLORS[i % CLIP_COLORS.length];
                    const isSaving = savingClipId === clip.id;
                    const isActive = currentTime >= startSec && currentTime <= endSec;

                    return (
                      <div
                        key={clip.id}
                        className={`flex items-center gap-3 px-3 py-2.5 rounded-xl border transition-colors cursor-pointer ${
                          isActive
                            ? "border-primary/40 bg-primary/5"
                            : "border-border/50 hover:border-border bg-muted/20 hover:bg-muted/40"
                        }`}
                        onClick={() => seekTo(startSec)}
                      >
                        {/* Color badge */}
                        <div
                          className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0"
                          style={{ backgroundColor: color }}
                        >
                          {i + 1}
                        </div>

                        {/* Start time controls */}
                        <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                          <button
                            onClick={() => handleAdjustClipTime(clip, "start", -5)}
                            className="w-5 h-5 rounded text-gray-400 hover:text-white hover:bg-muted text-xs font-bold transition-colors flex items-center justify-center"
                            title="Start -5s"
                          >
                            −
                          </button>
                          <span className="font-mono text-sm text-white min-w-[38px] text-center">
                            {formatTime(startSec)}
                          </span>
                          <button
                            onClick={() => handleAdjustClipTime(clip, "start", +5)}
                            className="w-5 h-5 rounded text-gray-400 hover:text-white hover:bg-muted text-xs font-bold transition-colors flex items-center justify-center"
                            title="Start +5s"
                          >
                            +
                          </button>
                        </div>

                        <span className="text-gray-500 text-xs">→</span>

                        {/* End time controls */}
                        <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                          <button
                            onClick={() => handleAdjustClipTime(clip, "end", -5)}
                            className="w-5 h-5 rounded text-gray-400 hover:text-white hover:bg-muted text-xs font-bold transition-colors flex items-center justify-center"
                            title="End -5s"
                          >
                            −
                          </button>
                          <span className="font-mono text-sm text-white min-w-[38px] text-center">
                            {formatTime(endSec)}
                          </span>
                          <button
                            onClick={() => handleAdjustClipTime(clip, "end", +5)}
                            className="w-5 h-5 rounded text-gray-400 hover:text-white hover:bg-muted text-xs font-bold transition-colors flex items-center justify-center"
                            title="End +5s"
                          >
                            +
                          </button>
                        </div>

                        {/* Duration badge */}
                        <span
                          className="text-xs font-mono px-1.5 py-0.5 rounded shrink-0"
                          style={{ color, backgroundColor: `${color}20` }}
                        >
                          {clipDur.toFixed(0)}s
                        </span>

                        {/* Clip text snippet */}
                        <span className="text-xs text-gray-500 truncate flex-1 hidden sm:block">
                          {clip.text?.substring(0, 50)}{clip.text?.length > 50 ? "…" : ""}
                        </span>

                        {/* Saving indicator */}
                        {isSaving && (
                          <div className="w-3 h-3 border-2 border-primary border-t-transparent rounded-full animate-spin shrink-0" />
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Action Buttons */}
            <div className="flex items-center gap-4">
              <button
                onClick={handleGenerateClips}
                disabled={isGenerating}
                className="flex-1 h-14 rounded-xl bg-gradient-purple hover:bg-gradient-purple-hover disabled:opacity-50 text-white font-bold text-lg transition-all glow-purple flex items-center justify-center gap-2"
              >
                {isGenerating ? (
                  <>
                    <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Generating Clips...
                  </>
                ) : (
                  <>
                    <Check className="w-5 h-5" />
                    Generate Clips
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Right Column */}
          <div className="space-y-6">
            {/* Tabs */}
            <div className="flex gap-2 border-b border-border">
              <button
                onClick={() => setActiveTab("insights")}
                className={`px-6 py-3 font-semibold transition-colors relative ${
                  activeTab === "insights" ? "text-primary" : "text-gray-400 hover:text-white"
                }`}
              >
                AI Insights
                {activeTab === "insights" && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary" />}
              </button>
              <button
                onClick={() => setActiveTab("transcript")}
                className={`px-6 py-3 font-semibold transition-colors relative ${
                  activeTab === "transcript" ? "text-primary" : "text-gray-400 hover:text-white"
                }`}
              >
                Transcript
                {activeTab === "transcript" && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary" />}
              </button>
            </div>

            {/* Transcript Panel */}
            {activeTab === "transcript" && (
              <div className="glass rounded-2xl p-6">
                <h3 className="font-semibold text-white uppercase tracking-wide mb-4">Transcript</h3>
                <div className="space-y-3 max-h-[400px] overflow-y-auto pr-2">
                  {segments.map((segment) => {
                    const isActive =
                      currentTime * 1000 >= segment.start_ms &&
                      currentTime * 1000 <= segment.end_ms;
                    return (
                      <div
                        key={segment.id}
                        onClick={() => handleSegmentClick(segment)}
                        className={`group cursor-pointer rounded-lg transition-colors ${isActive ? "bg-primary/20" : "hover:bg-muted/50"}`}
                      >
                        <div className="flex items-start gap-3 p-3">
                          <span className={`text-xs font-mono font-semibold mt-1 min-w-[45px] ${isActive ? "text-primary" : "text-primary/70"}`}>
                            {segment.start_time}
                          </span>
                          <textarea
                            value={segment.text}
                            onChange={(e) => handleSegmentEdit(segment.id, e.target.value)}
                            onBlur={handleSaveTranscript}
                            onClick={(e) => e.stopPropagation()}
                            dir={isRTL(segment.text) ? "rtl" : "ltr"}
                            className={`flex-1 text-sm bg-transparent border-none outline-none resize-none transition-colors ${isActive ? "text-white font-medium" : "text-gray-300 group-hover:text-white"} ${isRTL(segment.text) ? "text-right" : "text-left"}`}
                            rows={Math.ceil(segment.text.length / 50)}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Caption Styles — loaded dynamically from backend */}
            <div className="glass rounded-2xl p-6">
              <h3 className="font-semibold text-white uppercase tracking-wide mb-4">Caption Style</h3>

              {isLoadingTemplates ? (
                <div className="space-y-2">
                  {[1, 2, 3, 4].map((i) => (
                    <div key={i} className="h-14 bg-muted/40 rounded-xl animate-pulse" />
                  ))}
                </div>
              ) : (
                <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                  {templates.map((tpl) => (
                    <button
                      key={tpl.name}
                      onClick={() => setSelectedStyle(tpl.name)}
                      className={`w-full text-left px-4 py-3 rounded-xl border-2 transition-all ${
                        selectedStyle === tpl.name
                          ? "border-primary bg-primary/10 glow-purple"
                          : "border-border hover:border-primary/50"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-bold text-white uppercase tracking-wide">
                          {tpl.display_name}
                        </span>
                        {tpl.is_default && (
                          <span className="text-[10px] font-semibold text-primary/70 border border-primary/30 px-1.5 py-0.5 rounded">
                            Default
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-gray-400 mt-0.5 truncate">{tpl.description}</p>
                    </button>
                  ))}
                </div>
              )}

              {/* Font Size Slider */}
              <div className="mt-5 pt-4 border-t border-border/40">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-gray-400 font-semibold uppercase tracking-wide">Font Size</span>
                  <span className="text-xs font-mono font-bold text-white bg-primary/20 px-2 py-0.5 rounded">
                    {subtitleStyle.font_size}px
                  </span>
                </div>
                <input
                  type="range"
                  min={16}
                  max={56}
                  step={2}
                  value={subtitleStyle.font_size}
                  onChange={(e) => setSubtitleStyle({ font_size: parseInt(e.target.value) })}
                  className="w-full h-2 rounded-lg appearance-none cursor-pointer"
                  style={{
                    background: `linear-gradient(to right, #256af4 0%, #256af4 ${((subtitleStyle.font_size - 16) / 40) * 100}%, #374151 ${((subtitleStyle.font_size - 16) / 40) * 100}%, #374151 100%)`,
                  }}
                />
                <div className="flex justify-between text-[10px] text-gray-600 mt-1">
                  <span>16</span>
                  <span>56</span>
                </div>
              </div>

              <p className="text-xs text-gray-500 mt-3">
                Select a style to preview it live on the video above.
              </p>
            </div>

            {/* Aspect Ratio */}
            <div className="glass rounded-2xl p-6">
              <h3 className="font-semibold text-white uppercase tracking-wide mb-4">Clip Ratio</h3>
              <div className="flex gap-3">
                {(
                  [
                    { value: "9:16", label: "9:16", desc: "Vertical", visual: "h-12 w-7" },
                    { value: "1:1",  label: "1:1",  desc: "Square",   visual: "h-9 w-9"  },
                    { value: "16:9", label: "16:9", desc: "Landscape", visual: "h-7 w-12" },
                  ] as const
                ).map(({ value, label, desc, visual }) => (
                  <button
                    key={value}
                    onClick={() => setAspectRatio(value)}
                    className={`flex-1 flex flex-col items-center gap-2 py-3 px-2 rounded-xl border-2 transition-all ${
                      aspectRatio === value
                        ? "border-primary bg-primary/10 glow-purple"
                        : "border-border hover:border-primary/50"
                    }`}
                  >
                    <div
                      className={`${visual} rounded border-2 ${
                        aspectRatio === value ? "border-primary bg-primary/20" : "border-gray-500 bg-muted"
                      }`}
                    />
                    <span className="text-xs font-bold text-white">{label}</span>
                    <span className="text-xs text-gray-400">{desc}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Transitions Toggle */}
            <div className="glass rounded-2xl p-6">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-semibold text-white">Transition Effects</h3>
                  <p className="text-xs text-gray-400 mt-0.5">Add cinematic transitions between clips</p>
                </div>
                <button
                  onClick={() => setTransitionsEnabled((v) => !v)}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${
                    transitionsEnabled ? "bg-primary" : "bg-muted"
                  }`}
                  role="switch"
                  aria-checked={transitionsEnabled}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                      transitionsEnabled ? "translate-x-6" : "translate-x-1"
                    }`}
                  />
                </button>
              </div>
            </div>

            {/* Export Health */}
            <div className="glass rounded-xl p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-gray-400 uppercase tracking-wide">Export Health</span>
                <span className="text-sm font-bold text-primary">75%</span>
              </div>
              <div className="h-2 bg-muted rounded-full overflow-hidden">
                <div className="h-full bg-gradient-purple" style={{ width: "75%" }} />
              </div>
            </div>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
