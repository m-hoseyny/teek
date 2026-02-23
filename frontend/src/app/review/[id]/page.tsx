"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { AppLayout } from "@/components/layout/AppLayout";
import { useSession } from "@/lib/auth-client";
import { Play, Pause, Eye, EyeOff, Check } from "lucide-react";
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

// Map review-page style IDs to pycaps template names
const STYLE_TO_TEMPLATE: Record<string, string> = {
  "word-focus": "word-focus",
  "explosive": "explosive",
  "minimalist": "minimalist",
  "vibrant": "vibrant",
};

const CAPTION_STYLES = [
  { id: "word-focus",  name: "WORD FOCUS",  subtitle: "Yellow highlight" },
  { id: "explosive",   name: "EXPLOSIVE",   subtitle: "Energetic" },
  { id: "minimalist",  name: "MINIMALIST",  subtitle: "Clean & modern" },
  { id: "vibrant",     name: "VIBRANT",     subtitle: "Colorful" },
];

export default function ReviewPage() {
  const params = useParams();
  const router = useRouter();
  const { data: session } = useSession();
  const taskId = params.id as string;
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

  const [task, setTask] = useState<TaskData | null>(null);
  const [segments, setSegments] = useState<TranscriptSegment[]>([]);
  const [words, setWords] = useState<Word[]>([]);
  const [activeTab, setActiveTab] = useState<"insights" | "transcript">("transcript");
  const [selectedStyle, setSelectedStyle] = useState("word-focus");
  const [showSubtitles, setShowSubtitles] = useState(true);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isGenerating, setIsGenerating] = useState(false);
  const [videoSrc, setVideoSrc] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const animFrameRef = useRef<number>();

  // Fetch task + segments + words
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

    fetchTask();
    fetchSegments();
    fetchWords();
    fetchVideo();
  }, [taskId, session?.user?.id, apiUrl]);

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

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  const handleSegmentClick = (segment: TranscriptSegment) => {
    if (videoRef.current) {
      videoRef.current.currentTime = segment.start_ms / 1000;
      setCurrentTime(segment.start_ms / 1000);
    }
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

  const handleGenerateClips = async () => {
    if (!session?.user?.id) return;
    setIsGenerating(true);
    try {
      await handleSaveTranscript();
      const response = await fetch(`${apiUrl}/tasks/${taskId}/generate-clips`, {
        method: "POST",
        headers: { "Content-Type": "application/json", user_id: session.user.id },
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
                    template={STYLE_TO_TEMPLATE[selectedStyle] ?? "word-focus"}
                  />
                )}

                {/* Play button overlay */}
                {!isPlaying && videoSrc && (
                  <button
                    onClick={handlePlayPause}
                    className="absolute inset-0 flex items-center justify-center"
                  >
                    <div className="w-20 h-20 rounded-full bg-gradient-purple flex items-center justify-center glow-purple">
                      <Play className="w-10 h-10 text-white ml-1" fill="currentColor" />
                    </div>
                  </button>
                )}

                {/* Controls overlay */}
                <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-4">
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
                      background: `linear-gradient(to right, #A855F7 0%, #A855F7 ${(currentTime / (duration || 1)) * 100}%, #374151 ${(currentTime / (duration || 1)) * 100}%, #374151 100%)`,
                    }}
                  />
                </div>
              </div>
            </div>

            {/* Virality Heatmap */}
            <div className="glass rounded-2xl p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-primary/20 flex items-center justify-center">
                    <svg className="w-4 h-4 text-primary" fill="currentColor" viewBox="0 0 16 16">
                      <path d="M8.5 2.687c.654-.689 1.782-.886 3.112-.752 1.234.124 2.503.523 3.388.893v9.923c-.918-.35-2.107-.692-3.287-.81-1.094-.111-2.278-.039-3.213.492V2.687zM8 1.783C7.015.936 5.587.81 4.287.94c-1.514.153-3.042.672-3.994 1.105A.5.5 0 0 0 0 2.5v11a.5.5 0 0 0 .707.455c.882-.4 2.303-.881 3.68-1.02 1.409-.142 2.59.087 3.223.877a.5.5 0 0 0 .78 0c.633-.79 1.814-1.019 3.222-.877 1.378.139 2.8.62 3.681 1.02A.5.5 0 0 0 16 13.5v-11a.5.5 0 0 0-.293-.455c-.952-.433-2.48-.952-3.994-1.105C10.413.809 8.985.936 8 1.783z"/>
                    </svg>
                  </div>
                  <h3 className="font-semibold text-white">Virality Heatmap</h3>
                </div>
                <span className="text-xs font-semibold text-red-400 px-2 py-1 rounded bg-red-400/20">
                  PEAK: 01:32
                </span>
              </div>

              <div className="relative h-16 rounded-lg overflow-hidden">
                <div className="absolute inset-0 flex">
                  {Array.from({ length: 20 }).map((_, i) => {
                    const height = Math.sin(i * 0.5) * 40 + 60;
                    const colors = ["#22c55e", "#84cc16", "#facc15", "#fb923c", "#ef4444"];
                    const colorIndex = Math.floor((height / 100) * colors.length);
                    const timeAtSegment = (i / 20) * duration;
                    return (
                      <div
                        key={i}
                        className="flex-1 cursor-pointer hover:opacity-80 transition-opacity"
                        style={{
                          backgroundColor: colors[colorIndex],
                          height: `${height}%`,
                          alignSelf: "flex-end",
                        }}
                        onClick={() => {
                          if (videoRef.current) {
                            videoRef.current.currentTime = timeAtSegment;
                            setCurrentTime(timeAtSegment);
                          }
                        }}
                        title={`Jump to ${formatTime(timeAtSegment)}`}
                      />
                    );
                  })}
                </div>
                <div className="absolute -bottom-5 left-0 right-0 flex justify-between text-xs text-gray-500 pointer-events-none">
                  <span>00:00</span>
                  <span>{formatTime(duration * 0.25)}</span>
                  <span>{formatTime(duration * 0.5)}</span>
                  <span>{formatTime(duration * 0.75)}</span>
                  <span>{formatTime(duration)}</span>
                </div>
              </div>
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
                            className={`flex-1 text-sm bg-transparent border-none outline-none resize-none transition-colors ${isActive ? "text-white font-medium" : "text-gray-300 group-hover:text-white"}`}
                            rows={Math.ceil(segment.text.length / 50)}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Caption Styles */}
            <div className="glass rounded-2xl p-6">
              <h3 className="font-semibold text-white uppercase tracking-wide mb-4">Caption Style</h3>
              <div className="grid grid-cols-2 gap-3">
                {CAPTION_STYLES.map((style) => (
                  <button
                    key={style.id}
                    onClick={() => setSelectedStyle(style.id)}
                    className={`p-4 rounded-xl border-2 transition-all text-center ${
                      selectedStyle === style.id
                        ? "border-primary bg-primary/10 glow-purple"
                        : "border-border hover:border-primary/50"
                    }`}
                  >
                    <div className="text-xs font-bold mb-1 text-white">{style.name}</div>
                    <div className="text-xs text-gray-400">{style.subtitle}</div>
                  </button>
                ))}
              </div>
              <p className="text-xs text-gray-500 mt-3">
                Select a style to preview it live on the video above.
              </p>
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
