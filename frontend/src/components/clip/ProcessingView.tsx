"use client";

import { useEffect, useState } from "react";
import { Loader2, Check, Clock, X } from "lucide-react";

interface ProcessingStep {
  id: string;
  title: string;
  description: string;
  status: "pending" | "active" | "completed";
  progress?: number;
}

interface TaskStatus {
  task_id: string;
  status: "pending" | "processing" | "completed" | "failed";
  progress: number;
  current_step: string;
  message: string;
  error?: string;
  source_title?: string;
  clips_count?: number;
}

interface ProcessingViewProps {
  taskStatus: TaskStatus;
}

const STEP_MAPPING: Record<string, number> = {
  upload: 0,
  download: 0,
  audio: 1,
  extract_audio: 1,
  transcript: 2,
  transcribe: 2,
  transcription: 2,
  analysis: 3,
  analyze: 3,
  clips: 3,
  virality_analysis: 3,
};

export function ProcessingView({ taskStatus }: ProcessingViewProps) {
  const [notifyWhenFinished, setNotifyWhenFinished] = useState(false);

  const [steps, setSteps] = useState<ProcessingStep[]>([
    {
      id: "upload",
      title: "Uploading Video",
      description: "Securely transferring your media to our processing servers...",
      status: "pending",
      progress: 0,
    },
    {
      id: "audio",
      title: "Extracting Audio",
      description: "Waiting for upload completion...",
      status: "pending",
    },
    {
      id: "transcript",
      title: "Generating AI Transcript",
      description: "Awaiting audio extraction...",
      status: "pending",
    },
    {
      id: "analysis",
      title: "Identifying Viral Moments",
      description: "Final analysis step using engagement models.",
      status: "pending",
    },
  ]);

  // Update steps based on real taskStatus from SSE
  useEffect(() => {
    if (!taskStatus || !taskStatus.current_step) return;

    // Map current_step to step index
    const currentStepName = (taskStatus.current_step || "").toLowerCase();
    const currentStepIndex = STEP_MAPPING[currentStepName] ?? -1;

    console.log("ProcessingView: Updating steps", {
      currentStepName,
      currentStepIndex,
      taskStatus,
    });

    // If we have a valid step index, update the steps
    if (currentStepIndex >= 0) {
      setSteps((prevSteps) =>
        prevSteps.map((step, index) => {
          if (index < currentStepIndex) {
            // Previous steps are completed
            return { ...step, status: "completed" as const };
          } else if (index === currentStepIndex) {
            // Current step is active
            return {
              ...step,
              status: "active" as const,
              progress: taskStatus.progress,
              description: taskStatus.message || step.description,
            };
          } else {
            // Future steps remain pending
            return { ...step, status: "pending" as const };
          }
        })
      );
    } else if (taskStatus.progress > 0) {
      // If no specific step but we have progress, mark first step as active
      setSteps((prevSteps) =>
        prevSteps.map((step, index) => {
          if (index === 0) {
            return {
              ...step,
              status: "active" as const,
              progress: taskStatus.progress,
              description: taskStatus.message || step.description,
            };
          }
          return step;
        })
      );
    }
  }, [taskStatus]);

  // Calculate current step index for UI display
  const currentStepName = taskStatus?.current_step?.toLowerCase() || "";
  const currentStepIndex = STEP_MAPPING[currentStepName] ?? 0;
  const overallProgress = taskStatus?.progress || 0;

  return (
    <div className="max-w-5xl mx-auto">
      {/* Header */}
      <div className="mb-6 md:mb-8">
        <div className="flex items-center gap-2 text-blue-400 mb-2">
          <svg className="w-4 h-4 md:w-5 md:h-5" fill="currentColor" viewBox="0 0 16 16">
            <path d="M8 4.754a3.246 3.246 0 1 0 0 6.492 3.246 3.246 0 0 0 0-6.492zM5.754 8a2.246 2.246 0 1 1 4.492 0 2.246 2.246 0 0 1-4.492 0z"/>
            <path d="M9.796 1.343c-.527-1.79-3.065-1.79-3.592 0l-.094.319a.873.873 0 0 1-1.255.52l-.292-.16c-1.64-.892-3.433.902-2.54 2.541l.159.292a.873.873 0 0 1-.52 1.255l-.319.094c-1.79.527-1.79 3.065 0 3.592l.319.094a.873.873 0 0 1 .52 1.255l-.16.292c-.892 1.64.901 3.434 2.541 2.54l.292-.159a.873.873 0 0 1 1.255.52l.094.319c.527 1.79 3.065 1.79 3.592 0l.094-.319a.873.873 0 0 1 1.255-.52l.292.16c1.64.893 3.434-.902 2.54-2.541l-.159-.292a.873.873 0 0 1 .52-1.255l.319-.094c1.79-.527 1.79-3.065 0-3.592l-.319-.094a.873.873 0 0 1-.52-1.255l.16-.292c.893-1.64-.902-3.433-2.541-2.54l-.292.159a.873.873 0 0 1-1.255-.52l-.094-.319z"/>
          </svg>
          <span className="font-medium text-sm md:text-base">Processing & Analysis</span>
        </div>
        <h1 className="text-2xl md:text-4xl font-bold text-white mb-2 md:mb-3 line-clamp-2">
          {taskStatus?.source_title || "Analyzing your video..."}
        </h1>
        <p className="text-gray-400 text-sm md:text-lg">
          {taskStatus?.status === "failed"
            ? "Processing failed. Please try again."
            : "Our AI is identifying viral hooks, high-energy moments, and potential trending highlights."}
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6">
        {/* Left Column - Progress */}
        <div className="col-span-1 md:col-span-2 space-y-4 md:space-y-6">
          {/* Progress Ring & Bar */}
          <div className="glass rounded-2xl p-5 md:p-8">
            {/* Ring + bar: row on md+, column on mobile */}
            <div className="flex flex-col md:flex-row md:items-center gap-6 mb-0 md:mb-6">
              {/* Circular Progress — centered on mobile */}
              <div className="relative flex-shrink-0 self-center w-32 h-32 md:w-40 md:h-40">
                <svg className="w-full h-full transform -rotate-90" viewBox="0 0 128 128">
                  <circle
                    cx="64"
                    cy="64"
                    r="54"
                    stroke="rgba(37, 106, 244, 0.2)"
                    strokeWidth="8"
                    fill="none"
                  />
                  <circle
                    cx="64"
                    cy="64"
                    r="54"
                    stroke="url(#gradient)"
                    strokeWidth="8"
                    fill="none"
                    strokeDasharray={`${(overallProgress / 100) * 339} 339`}
                    strokeLinecap="round"
                    className="transition-all duration-300"
                  />
                  <defs>
                    <linearGradient id="gradient" x1="0%" y1="0%" x2="100%" y2="100%">
                      <stop offset="0%" stopColor="#256af4" />
                      <stop offset="100%" stopColor="#3b82f6" />
                    </linearGradient>
                  </defs>
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <div className="text-3xl md:text-4xl font-bold text-white">{overallProgress}%</div>
                  <div className="text-xs md:text-sm text-primary font-medium uppercase tracking-wide">Current Task</div>
                </div>
              </div>

              {/* Overall Progress Bar */}
              <div className="flex-1 w-full">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm font-medium text-gray-300">Overall Progress</span>
                  <span className="text-sm text-primary font-semibold">Step {currentStepIndex + 1} of 4</span>
                </div>
                <div className="h-2 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-purple transition-all duration-300"
                    style={{ width: `${overallProgress}%` }}
                  />
                </div>

                {/* Notify Toggle */}
                <div className="flex items-center gap-3 mt-5 md:mt-6">
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={notifyWhenFinished}
                      onChange={(e) => setNotifyWhenFinished(e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-muted rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
                  </label>
                  <span className="text-sm text-gray-300">Notify me when finished</span>
                </div>

                <button className="mt-3 md:mt-4 px-6 py-2 rounded-lg border border-border hover:border-primary text-sm text-gray-300 hover:text-white transition-colors">
                  Cancel Analysis
                </button>
              </div>
            </div>
          </div>

          {/* Processing Steps */}
          <div className="space-y-2 md:space-y-3">
            {steps.map((step, index) => (
              <div
                key={step.id}
                className={`glass rounded-xl p-4 border-2 transition-all ${
                  step.status === "active"
                    ? "border-primary glow-purple"
                    : step.status === "completed"
                      ? "border-green-500/30"
                      : "border-border"
                }`}
              >
                <div className="flex items-start gap-4">
                  {/* Icon */}
                  <div
                    className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${
                      step.status === "active"
                        ? "bg-primary/20"
                        : step.status === "completed"
                          ? "bg-green-500/20"
                          : "bg-muted"
                    }`}
                  >
                    {step.status === "completed" ? (
                      <Check className="w-5 h-5 text-green-400" />
                    ) : step.status === "active" ? (
                      <Loader2 className="w-5 h-5 text-primary animate-spin" />
                    ) : (
                      <Clock className="w-5 h-5 text-gray-500" />
                    )}
                  </div>

                  {/* Content */}
                  <div className="flex-1">
                    <h3 className="font-semibold text-white mb-1">{step.title}</h3>
                    <p className="text-sm text-muted-foreground">{step.description}</p>
                    {step.status === "active" && step.progress !== undefined && step.progress > 0 && (
                      <div className="mt-2 flex items-center gap-3">
                        <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                          <div
                            className="h-full bg-gradient-purple transition-all duration-300"
                            style={{ width: `${step.progress}%` }}
                          />
                        </div>
                        <span className="text-xs font-mono text-primary w-10 text-right">{step.progress}%</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Right Column - Preview & Status */}
        <div className="space-y-4 md:space-y-6">
          {/* Video Preview */}
          <div className="glass rounded-2xl p-4">
            <div className="aspect-video bg-black rounded-lg flex items-center justify-center mb-3 overflow-hidden">
              <div className="relative w-full h-full">
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="w-16 h-16 rounded-full bg-gradient-purple flex items-center justify-center glow-purple">
                    <svg className="w-8 h-8 text-white" fill="currentColor" viewBox="0 0 16 16">
                      <path d="M11.596 8.697l-6.363 3.692c-.54.313-1.233-.066-1.233-.697V4.308c0-.63.692-1.01 1.233-.696l6.363 3.692a.802.802 0 0 1 0 1.393z"/>
                    </svg>
                  </div>
                  <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent"></div>
                </div>
              </div>
            </div>
            <h3 className="font-semibold text-white mb-1 truncate">
              {taskStatus?.source_title || "Processing..."}
            </h3>
            <p className="text-xs text-muted-foreground">
              {taskStatus?.status === "processing" ? "Processing..." : "Ready"}
              {taskStatus?.clips_count ? ` • ${taskStatus.clips_count} clips` : ""}
            </p>
          </div>

          {/* Viral Tip */}
          <div className="glass rounded-xl p-4 border-l-4 border-primary">
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-lg bg-primary/20 flex items-center justify-center flex-shrink-0">
                <svg className="w-4 h-4 text-primary" fill="currentColor" viewBox="0 0 16 16">
                  <path d="M8 16A8 8 0 1 0 8 0a8 8 0 0 0 0 16zm.93-9.412-1 4.705c-.07.34.029.533.304.533.194 0 .487-.07.686-.246l-.088.416c-.287.346-.92.598-1.465.598-.703 0-1.002-.422-.808-1.319l.738-3.468c.064-.293.006-.399-.287-.47l-.451-.081.082-.381 2.29-.287zM8 5.5a1 1 0 1 1 0-2 1 1 0 0 1 0 2z"/>
                </svg>
              </div>
              <div>
                <h4 className="text-sm font-semibold text-primary mb-2">VIRAL TIP</h4>
                <p className="text-sm text-gray-300">
                  "Videos with burnt-in captions have a{" "}
                  <span className="text-primary font-semibold">40% higher retention rate</span> on mobile
                  platforms like TikTok and Instagram."
                </p>
              </div>
            </div>
          </div>

          {/* AI Engine Status */}
          <div className="glass rounded-xl p-4">
            <h4 className="text-sm font-semibold text-white mb-4 uppercase tracking-wide">AI ENGINE STATUS</h4>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-300">Context Model</span>
                <span className="text-xs font-semibold text-green-400 px-2 py-1 rounded bg-green-400/20">
                  READY
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-300">Face Recognition</span>
                <span className="text-xs font-semibold text-green-400 px-2 py-1 rounded bg-green-400/20">
                  ACTIVE
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-300">Sentiment Engine</span>
                <span className="text-xs font-semibold text-yellow-400 px-2 py-1 rounded bg-yellow-400/20 pulse-glow">
                  WARMING UP
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Notification */}
      {notifyWhenFinished && (
        <div className="mt-4 md:mt-6 glass rounded-xl p-4 border-l-4 border-primary flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-primary/20 flex items-center justify-center">
            <svg className="w-5 h-5 text-primary" fill="currentColor" viewBox="0 0 16 16">
              <path d="M8 16a2 2 0 0 0 2-2H6a2 2 0 0 0 2 2zM8 1.918l-.797.161A4.002 4.002 0 0 0 4 6c0 .628-.134 2.197-.459 3.742-.16.767-.376 1.566-.663 2.258h10.244c-.287-.692-.502-1.49-.663-2.258C12.134 8.197 12 6.628 12 6a4.002 4.002 0 0 0-3.203-3.92L8 1.917zM14.22 12c.223.447.481.801.78 1H1c.299-.199.557-.553.78-1C2.68 10.2 3 6.88 3 6c0-2.42 1.72-4.44 4.005-4.901a1 1 0 1 1 1.99 0A5.002 5.002 0 0 1 13 6c0 .88.32 4.2 1.22 6z"/>
            </svg>
          </div>
          <div className="flex-1">
            <h4 className="text-sm font-semibold text-white">Notifications Enabled</h4>
            <p className="text-xs text-muted-foreground">We'll alert you once identification is complete.</p>
          </div>
        </div>
      )}
    </div>
  );
}
