"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { AppLayout } from "@/components/layout/AppLayout";
import { useSession } from "@/lib/auth-client";
import { VideoPlayer } from "@/components/clip/VideoPlayer";
import { Download, Share2, Edit, Trash2, Sparkles } from "lucide-react";

interface Clip {
  id: string;
  task_id: string;
  start_time: number;
  end_time: number;
  duration: number;
  virality_score: number;
  hook: string;
  transcript_text: string;
  filename: string | null;
  aspect_ratio: string;
  created_at: string;
}

interface TaskData {
  id: string;
  status: string;
  source: {
    title: string;
    url: string;
  };
  clips: Clip[];
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

  useEffect(() => {
    if (!session?.user?.id || !taskId) return;

    const fetchTaskAndClips = async () => {
      try {
        // Fetch task details
        const taskResponse = await fetch(`${apiUrl}/tasks/${taskId}`, {
          headers: { user_id: session.user.id },
        });

        if (taskResponse.ok) {
          const taskData = await taskResponse.json();
          setTask(taskData);

          // Fetch clips
          const clipsResponse = await fetch(`${apiUrl}/tasks/${taskId}/clips`, {
            headers: { user_id: session.user.id },
          });

          if (clipsResponse.ok) {
            const clipsData = await clipsResponse.json();
            setClips(clipsData.clips || []);
            if (clipsData.clips && clipsData.clips.length > 0) {
              setSelectedClip(clipsData.clips[0]);
            }
          }
        }
      } catch (error) {
        console.error("Failed to fetch task and clips:", error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchTaskAndClips();
  }, [taskId, session?.user?.id, apiUrl]);

  const handleDeleteClip = async (clipId: string) => {
    if (!session?.user?.id) return;
    if (!confirm("Are you sure you want to delete this clip?")) return;

    try {
      const response = await fetch(`${apiUrl}/tasks/${taskId}/clips/${clipId}`, {
        method: "DELETE",
        headers: { user_id: session.user.id },
      });

      if (response.ok) {
        setClips(clips.filter((c) => c.id !== clipId));
        if (selectedClip?.id === clipId) {
          setSelectedClip(clips[0] || null);
        }
      }
    } catch (error) {
      console.error("Failed to delete clip:", error);
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  if (isLoading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center h-screen">
          <div className="text-center">
            <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
            <p className="text-gray-400">Loading clips...</p>
          </div>
        </div>
      </AppLayout>
    );
  }

  if (!task || clips.length === 0) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center h-screen">
          <div className="text-center max-w-md">
            <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mx-auto mb-4">
              <Sparkles className="w-8 h-8 text-gray-500" />
            </div>
            <h2 className="text-2xl font-bold text-white mb-2">
              {clips.length === 0 ? "No clips generated yet" : "Task not found"}
            </h2>
            <p className="text-gray-400 mb-6">
              {clips.length === 0
                ? "The AI is still analyzing your video. Clips will appear here once processing is complete."
                : "The task you're looking for doesn't exist."}
            </p>
            <button
              onClick={() => router.push("/library")}
              className="px-6 py-3 rounded-lg bg-primary hover:bg-primary/90 text-white font-semibold transition-colors"
            >
              Go to Library
            </button>
          </div>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="max-w-[1600px] mx-auto">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-white mb-2">Viral Clips Studio</h1>
          <p className="text-gray-400">{task.source?.title || "Generated Clips"}</p>
        </div>

        <div className="grid grid-cols-3 gap-6">
          {/* Left Column - Video Player */}
          <div className="col-span-2 space-y-6">
            {/* Main Clip Player */}
            {selectedClip && selectedClip.filename && (
              <div className="glass rounded-2xl p-6">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="text-lg font-semibold text-white mb-1">
                      Clip {clips.findIndex((c) => c.id === selectedClip.id) + 1} of {clips.length}
                    </h3>
                    <p className="text-sm text-gray-400">
                      {formatTime(selectedClip.start_time)} - {formatTime(selectedClip.end_time)} •{" "}
                      {selectedClip.duration}s
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="px-3 py-1 rounded-full bg-primary/20 text-primary text-sm font-semibold">
                      {Math.round(selectedClip.virality_score * 100)}% Viral
                    </span>
                  </div>
                </div>

                <VideoPlayer
                  src={`${apiUrl}/clips/${selectedClip.filename}`}
                  aspectRatio={selectedClip.aspect_ratio as "9:16" | "1:1" | "16:9"}
                />

                {/* Clip Actions */}
                <div className="flex items-center gap-3 mt-4">
                  <button className="flex-1 h-12 rounded-lg bg-gradient-purple hover:bg-gradient-purple-hover text-white font-semibold transition-all flex items-center justify-center gap-2">
                    <Download className="w-4 h-4" />
                    Download
                  </button>
                  <button className="h-12 px-6 rounded-lg bg-muted hover:bg-muted/80 text-white font-semibold transition-all flex items-center justify-center gap-2">
                    <Share2 className="w-4 h-4" />
                    Share
                  </button>
                  <button className="h-12 px-6 rounded-lg bg-muted hover:bg-muted/80 text-white font-semibold transition-all flex items-center justify-center gap-2">
                    <Edit className="w-4 h-4" />
                    Edit
                  </button>
                  <button
                    onClick={() => handleDeleteClip(selectedClip.id)}
                    className="h-12 px-6 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 font-semibold transition-all flex items-center justify-center gap-2"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}

            {/* Clip Details */}
            {selectedClip && (
              <div className="glass rounded-2xl p-6">
                <h3 className="text-lg font-semibold text-white mb-4">Clip Details</h3>
                <div className="space-y-4">
                  <div>
                    <label className="text-sm font-medium text-gray-400 uppercase tracking-wide mb-2 block">
                      Hook
                    </label>
                    <p className="text-white">{selectedClip.hook || "No hook identified"}</p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-400 uppercase tracking-wide mb-2 block">
                      Transcript
                    </label>
                    <p className="text-gray-300 text-sm leading-relaxed">
                      {selectedClip.transcript_text || "No transcript available"}
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Right Column - Clips List */}
          <div className="space-y-6">
            <div className="glass rounded-2xl p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-white">Generated Clips</h3>
                <span className="text-sm text-gray-400">{clips.length} clips</span>
              </div>

              <div className="space-y-3 max-h-[700px] overflow-y-auto pr-2">
                {clips.map((clip, index) => (
                  <button
                    key={clip.id}
                    onClick={() => setSelectedClip(clip)}
                    className={`w-full text-left p-4 rounded-xl border-2 transition-all ${
                      selectedClip?.id === clip.id
                        ? "border-primary bg-primary/10"
                        : "border-border hover:border-primary/50"
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <div className="flex-shrink-0 w-12 h-12 rounded-lg bg-gradient-purple flex items-center justify-center text-white font-bold">
                        {index + 1}
                      </div>
                      <div className="flex-1 min-w-0">
                        <h4 className="font-semibold text-white mb-1 truncate">
                          {clip.hook || `Clip ${index + 1}`}
                        </h4>
                        <div className="flex items-center gap-2 text-xs text-gray-400 mb-2">
                          <span>{clip.duration}s</span>
                          <span>•</span>
                          <span>
                            {formatTime(clip.start_time)} - {formatTime(clip.end_time)}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                            <div
                              className="h-full bg-gradient-purple"
                              style={{ width: `${clip.virality_score * 100}%` }}
                            />
                          </div>
                          <span className="text-xs font-semibold text-primary">
                            {Math.round(clip.virality_score * 100)}%
                          </span>
                        </div>
                      </div>
                    </div>

                    {!clip.filename && (
                      <div className="mt-3 flex items-center gap-2 text-xs text-yellow-500">
                        <svg
                          className="w-4 h-4 animate-spin"
                          fill="none"
                          viewBox="0 0 24 24"
                        >
                          <circle
                            className="opacity-25"
                            cx="12"
                            cy="12"
                            r="10"
                            stroke="currentColor"
                            strokeWidth="4"
                          ></circle>
                          <path
                            className="opacity-75"
                            fill="currentColor"
                            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                          ></path>
                        </svg>
                        Generating...
                      </div>
                    )}
                  </button>
                ))}
              </div>
            </div>

            {/* Bulk Actions */}
            <div className="glass rounded-xl p-4">
              <h4 className="text-sm font-semibold text-white mb-3 uppercase tracking-wide">
                Bulk Actions
              </h4>
              <div className="space-y-2">
                <button className="w-full h-10 rounded-lg bg-muted hover:bg-muted/80 text-white text-sm font-semibold transition-all">
                  Download All
                </button>
                <button className="w-full h-10 rounded-lg bg-muted hover:bg-muted/80 text-white text-sm font-semibold transition-all">
                  Share All
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
