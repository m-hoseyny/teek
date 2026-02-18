"use client";

import { Progress } from "@/components/ui/progress";
import { CheckCircle, Loader2 } from "lucide-react";
import { type JSX } from "react";

interface ProcessingStatusProps {
  progress: number;
  statusMessage: string;
  currentStep: string;
  sourceTitle: string | null;
  sourceType: "upload_file" | "video_url";
}

const stepLabels: Record<string, { label: string; threshold: number }> = {
  validation: { label: "Validation", threshold: 15 },
  user_check: { label: "Validation", threshold: 15 },
  download: { label: "Download", threshold: 30 },
  youtube_info: { label: "Download", threshold: 30 },
  transcript: { label: "Transcript", threshold: 45 },
  ai_analysis: { label: "AI Analysis", threshold: 60 },
  clip_generation: { label: "Create Clips", threshold: 75 },
  complete: { label: "Complete", threshold: 100 },
};

export function ProcessingStatus({
  progress,
  statusMessage,
  currentStep,
  sourceTitle,
  sourceType,
}: ProcessingStatusProps) {
  const getStepIcon = (step: string): JSX.Element => {
    const iconMap: Record<string, JSX.Element> = {
      validation: <Loader2 className="w-4 h-4 animate-spin text-blue-500" />,
      user_check: <Loader2 className="w-4 h-4 animate-spin text-blue-500" />,
      source_analysis: <Loader2 className="w-4 h-4 animate-spin text-blue-500" />,
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

  // Upload flow only shows upload progress
  if (sourceType === "upload_file" && currentStep === "upload") {
    return (
      <div className="space-y-2">
        <div className="flex justify-between text-sm">
          <span className="text-gray-600">Upload</span>
          <span className="text-black">{progress}%</span>
        </div>
        <Progress value={progress} className="h-2" />
        {statusMessage && <p className="text-sm text-black">{statusMessage}</p>}
      </div>
    );
  }

  return (
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
              {sourceTitle && <p className="text-xs text-gray-500 mt-1">Processing: {sourceTitle}</p>}
            </div>
          </div>

          {/* Step Progress Indicator */}
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div
              className={`flex items-center gap-2 p-2 rounded ${
                currentStep === "validation" || currentStep === "user_check"
                  ? "bg-blue-100"
                  : progress > 15
                    ? "bg-green-100"
                    : "bg-gray-100"
              }`}
            >
              <CheckCircle className={`w-3 h-3 ${progress > 15 ? "text-green-500" : "text-gray-400"}`} />
              <span className={progress > 15 ? "text-green-700" : "text-gray-600"}>Validation</span>
            </div>
            <div
              className={`flex items-center gap-2 p-2 rounded ${
                currentStep === "download" || currentStep === "youtube_info"
                  ? "bg-green-100"
                  : progress > 30
                    ? "bg-green-100"
                    : "bg-gray-100"
              }`}
            >
              <CheckCircle className={`w-3 h-3 ${progress > 30 ? "text-green-500" : "text-gray-400"}`} />
              <span className={progress > 30 ? "text-green-700" : "text-gray-600"}>Download</span>
            </div>
            <div
              className={`flex items-center gap-2 p-2 rounded ${
                currentStep === "transcript" ? "bg-purple-100" : progress > 45 ? "bg-green-100" : "bg-gray-100"
              }`}
            >
              <CheckCircle className={`w-3 h-3 ${progress > 45 ? "text-green-500" : "text-gray-400"}`} />
              <span className={progress > 45 ? "text-green-700" : "text-gray-600"}>Transcript</span>
            </div>
            <div
              className={`flex items-center gap-2 p-2 rounded ${
                currentStep === "ai_analysis" ? "bg-orange-100" : progress > 60 ? "bg-green-100" : "bg-gray-100"
              }`}
            >
              <CheckCircle className={`w-3 h-3 ${progress > 60 ? "text-green-500" : "text-gray-400"}`} />
              <span className={progress > 60 ? "text-green-700" : "text-gray-600"}>AI Analysis</span>
            </div>
            <div
              className={`flex items-center gap-2 p-2 rounded ${
                currentStep === "clip_generation" ? "bg-indigo-100" : progress > 75 ? "bg-green-100" : "bg-gray-100"
              }`}
            >
              <CheckCircle className={`w-3 h-3 ${progress > 75 ? "text-green-500" : "text-gray-400"}`} />
              <span className={progress > 75 ? "text-green-700" : "text-gray-600"}>Create Clips</span>
            </div>
            <div
              className={`flex items-center gap-2 p-2 rounded ${
                currentStep === "complete" ? "bg-green-100" : progress >= 100 ? "bg-green-100" : "bg-gray-100"
              }`}
            >
              <CheckCircle className={`w-3 h-3 ${progress >= 100 ? "text-green-500" : "text-gray-400"}`} />
              <span className={progress >= 100 ? "text-green-700" : "text-gray-600"}>Complete</span>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
