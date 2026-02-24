"use client";

import { useState, useRef, useEffect } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Link as LinkIcon, Upload, FileText, Clipboard, Zap, Video as VideoIcon, Minus, Plus, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSession } from "@/lib/auth-client";
import { useRouter } from "next/navigation";

interface Prompt { id: string; name: string; description: string; }

export default function AnalysisPage() {
  const { data: session } = useSession();
  const router = useRouter();
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

  const [videoUrl, setVideoUrl] = useState("");
  const [transcriptionMethod, setTranscriptionMethod] = useState<"ai" | "upload" | "paste">("ai");
  const [fileName, setFileName] = useState<string | null>(null);
  const [srtFile, setSrtFile] = useState<File | null>(null);
  const [pastedTranscript, setPastedTranscript] = useState("");
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const srtInputRef = useRef<HTMLInputElement | null>(null);

  // Clip configuration
  const [clipsCount, setClipsCount] = useState(5);
  const [prompts, setPrompts] = useState<Prompt[]>([]);
  const [promptId, setPromptId] = useState("");

  useEffect(() => {
    if (!session?.user?.id) return;
    fetch(`${apiUrl}/tasks/prompts`, { headers: { user_id: session.user.id } })
      .then((r) => r.json())
      .then((data) => {
        setPrompts(data.prompts || []);
        setPromptId(data.default_prompt_id || "");
      })
      .catch(() => {});
  }, [session?.user?.id, apiUrl]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setFileName(file.name);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file && fileInputRef.current) {
      const dataTransfer = new DataTransfer();
      dataTransfer.items.add(file);
      fileInputRef.current.files = dataTransfer.files;
      setFileName(file.name);
    }
  };

  const handleSrtUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSrtFile(file);
    }
  };

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleStartAnalysis = async () => {
    if (!session?.user?.id) {
      router.push("/sign-in");
      return;
    }

    // Validate input
    if (!videoUrl && !fileName) {
      setError("Please provide a video URL or upload a file");
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      // Prepare request body for POST /tasks/
      const requestBody: any = {
        source: { url: videoUrl || fileName },
        caption_options: {
          pycaps_template: "word-focus",
          transitions_enabled: false,
          transcript_review_enabled: true,
        },
        transcription_options: {},
        ai_options: {
          provider: "openai",
          clips_count: clipsCount,
          prompt_id: promptId || undefined,
        },
      };

      // Add SRT content if uploaded
      if (transcriptionMethod === "upload" && srtFile) {
        // Read SRT file content
        const srtContent = await srtFile.text();
        requestBody.transcription_options.srt_content = srtContent;
      } else if (transcriptionMethod === "paste" && pastedTranscript) {
        // TODO: Format pasted transcript as SRT
        requestBody.transcription_options.srt_content = pastedTranscript;
      }

      // Call POST /tasks/ endpoint
      const response = await fetch(`${apiUrl}/tasks/`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "user_id": session.user.id,
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || "Failed to start analysis");
      }

      const data = await response.json();
      const taskId = data.task_id;

      // Navigate to processing page
      router.push(`/processing/${taskId}`);
    } catch (err: any) {
      console.error("Error starting analysis:", err);
      setError(err.message || "Failed to start analysis. Please try again.");
      setIsSubmitting(false);
    }
  };

  return (
    <AppLayout>
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
            <span>Library</span>
            <span>•</span>
            <span className="text-primary">New Analysis</span>
          </div>
          <h1 className="text-3xl font-bold text-white">Import & Configure</h1>
        </div>

        {/* Main Content Grid */}
        <div className="grid grid-cols-2 gap-6 mb-8">
          {/* Left Card - Import Video */}
          <div className="glass rounded-2xl p-6">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-lg bg-primary/20 flex items-center justify-center">
                <VideoIcon className="w-5 h-5 text-primary" />
              </div>
              <h2 className="text-xl font-semibold text-white">1. Import Video</h2>
            </div>

            {/* Video URL Input */}
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-300 mb-2">VIDEO URL</label>
              <div className="relative">
                <LinkIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                <input
                  type="text"
                  value={videoUrl}
                  onChange={(e) => setVideoUrl(e.target.value)}
                  placeholder="YouTube, TikTok, or Reels link..."
                  className="w-full h-12 pl-11 pr-4 bg-input border border-border rounded-lg text-white placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                />
                <button className="absolute right-2 top-1/2 -translate-y-1/2 px-4 py-1.5 rounded-md bg-primary hover:bg-primary/90 text-white text-sm font-medium transition-colors">
                  Fetch
                </button>
              </div>
              <p className="text-xs text-muted-foreground mt-2">Supports high-quality 4K source metadata</p>
            </div>

            {/* Drag & Drop Zone */}
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setIsDragOver(true);
              }}
              onDragLeave={() => setIsDragOver(false)}
              onDrop={handleDrop}
              className={`relative border-2 border-dashed rounded-xl p-8 text-center transition-all ${
                isDragOver
                  ? "border-primary bg-primary/10"
                  : "border-purple-500/30 hover:border-primary/50"
              }`}
            >
              <div className="flex flex-col items-center gap-4">
                <div className="w-16 h-16 rounded-full bg-primary/20 flex items-center justify-center">
                  <Upload className="w-8 h-8 text-primary" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-white mb-1">Drag & Drop Local File</h3>
                  <p className="text-sm text-muted-foreground">MP4, MOV or AVI up to 500MB</p>
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="video/*"
                  onChange={handleFileChange}
                  className="hidden"
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => fileInputRef.current?.click()}
                  className="border-border hover:border-primary"
                >
                  Browse Files
                </Button>
                {fileName && (
                  <p className="text-sm text-primary mt-2">Selected: {fileName}</p>
                )}
              </div>
            </div>
          </div>

          {/* Right Card - Transcription Source */}
          <div className="glass rounded-2xl p-6">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-lg bg-secondary/20 flex items-center justify-center">
                <FileText className="w-5 h-5 text-secondary" />
              </div>
              <h2 className="text-xl font-semibold text-white">2. Transcription Source</h2>
            </div>

            {/* Transcription Options */}
            <div className="space-y-3 mb-6">
              {/* AI Auto-generate */}
              <button
                onClick={() => setTranscriptionMethod("ai")}
                className={`w-full p-4 rounded-xl border-2 transition-all text-left ${
                  transcriptionMethod === "ai"
                    ? "border-primary bg-primary/10 glow-purple"
                    : "border-border hover:border-primary/50"
                }`}
              >
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-lg bg-primary/20 flex items-center justify-center flex-shrink-0">
                    <Zap className="w-5 h-5 text-primary" />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-semibold text-white">AI Auto-generate</h3>
                      {transcriptionMethod === "ai" && (
                        <div className="w-5 h-5 rounded-full bg-primary flex items-center justify-center">
                          <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 16 16">
                            <path d="M13.485 3.515a1 1 0 0 1 0 1.414l-7 7a1 1 0 0 1-1.414 0l-3-3a1 1 0 0 1 1.414-1.414L6 10.086l6.071-6.071a1 1 0 0 1 1.414 0z"/>
                          </svg>
                        </div>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground">Multi-language high accuracy (Recommended)</p>
                  </div>
                </div>
              </button>

              {/* Upload .srt / .vtt */}
              <button
                onClick={() => setTranscriptionMethod("upload")}
                className={`w-full p-4 rounded-xl border-2 transition-all text-left ${
                  transcriptionMethod === "upload"
                    ? "border-primary bg-primary/10"
                    : "border-border hover:border-primary/50"
                }`}
              >
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center flex-shrink-0">
                    <FileText className="w-5 h-5 text-gray-400" />
                  </div>
                  <div className="flex-1">
                    <h3 className="font-semibold text-white mb-1">Upload .srt / .vtt</h3>
                    <p className="text-sm text-muted-foreground">Provide your own professional captions</p>
                  </div>
                </div>
              </button>

              {/* Paste Transcript */}
              <button
                onClick={() => setTranscriptionMethod("paste")}
                className={`w-full p-4 rounded-xl border-2 transition-all text-left ${
                  transcriptionMethod === "paste"
                    ? "border-primary bg-primary/10"
                    : "border-border hover:border-primary/50"
                }`}
              >
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center flex-shrink-0">
                    <Clipboard className="w-5 h-5 text-gray-400" />
                  </div>
                  <div className="flex-1">
                    <h3 className="font-semibold text-white mb-1">Paste Transcript</h3>
                    <p className="text-sm text-muted-foreground">Manually enter dialogue text</p>
                  </div>
                </div>
              </button>
            </div>

            {/* Transcript Content Area */}
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-2 uppercase tracking-wide">
                TRANSCRIPT CONTENT
              </label>
              {transcriptionMethod === "ai" && (
                <div className="p-4 rounded-lg bg-muted/30 border border-border">
                  <p className="text-sm text-muted-foreground">
                    AI will automatically transcribe the audio if this is left empty...
                  </p>
                </div>
              )}
              {transcriptionMethod === "upload" && (
                <div>
                  <input
                    ref={srtInputRef}
                    type="file"
                    accept=".srt,.vtt"
                    onChange={handleSrtUpload}
                    className="hidden"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => srtInputRef.current?.click()}
                    className="w-full border-border hover:border-primary"
                  >
                    {srtFile ? `Selected: ${srtFile.name}` : "Choose File"}
                  </Button>
                </div>
              )}
              {transcriptionMethod === "paste" && (
                <textarea
                  value={pastedTranscript}
                  onChange={(e) => setPastedTranscript(e.target.value)}
                  placeholder="Paste your transcript here..."
                  rows={6}
                  className="w-full p-3 bg-input border border-border rounded-lg text-white placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary resize-none"
                />
              )}
            </div>
          </div>
        </div>

        {/* Clip Configuration Card */}
        <div className="glass rounded-2xl p-6 mb-8">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-lg bg-primary/20 flex items-center justify-center">
              <Sparkles className="w-5 h-5 text-primary" />
            </div>
            <h2 className="text-xl font-semibold text-white">3. Clip Configuration</h2>
          </div>

          <div className="grid grid-cols-2 gap-8">
            {/* Clip Style */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-3">CLIP STYLE</label>
              <div className="grid grid-cols-1 gap-2">
                {prompts.length === 0 ? (
                  <div className="h-10 bg-muted/30 rounded-lg animate-pulse" />
                ) : (
                  prompts.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => setPromptId(p.id)}
                      className={`w-full text-left px-4 py-3 rounded-xl border-2 transition-all ${
                        promptId === p.id
                          ? "border-primary bg-primary/10"
                          : "border-border hover:border-primary/40"
                      }`}
                    >
                      <span className="font-semibold text-white text-sm">{p.name}</span>
                      {p.description && (
                        <p className="text-xs text-gray-400 mt-0.5 line-clamp-1">{p.description}</p>
                      )}
                    </button>
                  ))
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                Determines how the AI selects and frames your clips.
              </p>
            </div>

            {/* Number of Clips */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-3">NUMBER OF CLIPS</label>
              <div className="flex items-center gap-4">
                <button
                  onClick={() => setClipsCount((n) => Math.max(1, n - 1))}
                  className="w-10 h-10 rounded-lg bg-muted hover:bg-muted/70 text-white flex items-center justify-center transition-colors"
                >
                  <Minus className="w-4 h-4" />
                </button>
                <div className="flex-1 text-center">
                  <div className="text-5xl font-bold text-white tabular-nums">{clipsCount}</div>
                  <div className="text-xs text-gray-500 mt-1">clips</div>
                </div>
                <button
                  onClick={() => setClipsCount((n) => Math.min(20, n + 1))}
                  className="w-10 h-10 rounded-lg bg-muted hover:bg-muted/70 text-white flex items-center justify-center transition-colors"
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>
              <div className="flex justify-between text-xs text-gray-500 mt-4 px-1">
                {[1, 5, 10, 15, 20].map((n) => (
                  <button
                    key={n}
                    onClick={() => setClipsCount(n)}
                    className={`px-2 py-1 rounded transition-colors ${clipsCount === n ? "text-primary font-semibold" : "hover:text-white"}`}
                  >
                    {n}
                  </button>
                ))}
              </div>
              <p className="text-xs text-muted-foreground mt-3">
                The AI will try to generate up to this many clips from your video.
              </p>
            </div>
          </div>
        </div>

        {/* Security Notice */}
        <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground mb-6">
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 16 16">
            <path d="M8 1a2 2 0 0 1 2 2v4H6V3a2 2 0 0 1 2-2zm3 6V3a3 3 0 0 0-6 0v4a2 2 0 0 0-2 2v5a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2z"/>
          </svg>
          <span>All uploads are encrypted and private</span>
        </div>

        {/* Error Message */}
        {error && (
          <div className="mb-4 p-4 rounded-xl bg-red-500/10 border border-red-500/30 flex items-center gap-3">
            <svg className="w-5 h-5 text-red-400 flex-shrink-0" fill="currentColor" viewBox="0 0 16 16">
              <path d="M8 15A7 7 0 1 1 8 1a7 7 0 0 1 0 14zm0 1A8 8 0 1 0 8 0a8 8 0 0 0 0 16z"/>
              <path d="M7.002 11a1 1 0 1 1 2 0 1 1 0 0 1-2 0zM7.1 4.995a.905.905 0 1 1 1.8 0l-.35 3.507a.552.552 0 0 1-1.1 0L7.1 4.995z"/>
            </svg>
            <p className="text-sm text-red-400">{error}</p>
          </div>
        )}

        {/* Start Button */}
        <button
          onClick={handleStartAnalysis}
          disabled={isSubmitting}
          className="w-full h-14 rounded-xl bg-gradient-purple hover:bg-gradient-purple-hover disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold text-lg transition-all glow-purple-strong flex items-center justify-center gap-3"
        >
          {isSubmitting ? (
            <>
              <svg className="w-6 h-6 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              STARTING ANALYSIS...
            </>
          ) : (
            <>
              <Zap className="w-6 h-6" fill="currentColor" />
              START VIRAL ANALYSIS
            </>
          )}
        </button>

        {/* Footer Stats */}
        <div className="grid grid-cols-3 gap-6 mt-8">
          <div className="text-center">
            <div className="text-2xl font-bold text-white mb-1">~2 min</div>
            <div className="text-sm text-muted-foreground">EST. DURATION</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-white mb-1">4K HDR</div>
            <div className="text-sm text-muted-foreground">MAX QUALITY</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-white mb-1">24 Languages</div>
            <div className="text-sm text-muted-foreground">SUPPORTED</div>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
