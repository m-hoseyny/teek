"use client";

import { Slider } from "@/components/ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface Prompt {
  id: string;
  name: string;
  description: string;
}

interface ClipSettingsSectionProps {
  clipsCount: number;
  setClipsCount: (count: number) => void;
  selectedPromptId: string;
  setSelectedPromptId: (id: string) => void;
  availablePrompts: Prompt[];
  transcriptReviewEnabled: boolean;
  setTranscriptReviewEnabled: (enabled: boolean) => void;
  isLoadingPrompts: boolean;
  isLoading: boolean;
}

const MIN_CLIPS_COUNT = 1;
const MAX_CLIPS_COUNT = 50;

export function ClipSettingsSection({
  clipsCount,
  setClipsCount,
  selectedPromptId,
  setSelectedPromptId,
  availablePrompts,
  transcriptReviewEnabled,
  setTranscriptReviewEnabled,
  isLoadingPrompts,
  isLoading,
}: ClipSettingsSectionProps) {
  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold text-gray-500 uppercase tracking-wide">Clip Settings</h3>

      {/* Prompt Type Selector */}
      <div className="space-y-2">
        <label htmlFor="prompt-type" className="text-sm font-medium text-black">
          Clip Style
        </label>
        <Select value={selectedPromptId} onValueChange={setSelectedPromptId} disabled={isLoading || isLoadingPrompts}>
          <SelectTrigger className="w-full">
            <SelectValue placeholder={isLoadingPrompts ? "Loading styles..." : "Select clip style"} />
          </SelectTrigger>
          <SelectContent>
            {availablePrompts.map((prompt) => (
              <SelectItem key={prompt.id} value={prompt.id}>
                <div className="flex flex-col items-start">
                  <span className="font-medium">{prompt.name}</span>
                  <span className="text-xs text-gray-500">{prompt.description}</span>
                </div>
              </SelectItem>
            ))}
            {availablePrompts.length === 0 && (
              <SelectItem value="default">
                <div className="flex flex-col items-start">
                  <span className="font-medium">Social Media Clips</span>
                  <span className="text-xs text-gray-500">General-purpose clips optimized for social media engagement</span>
                </div>
              </SelectItem>
            )}
          </SelectContent>
        </Select>
        <p className="text-xs text-gray-500">
          Choose the type of clips you want to generate. This affects how the AI selects segments.
        </p>
      </div>

      {/* Clips Count Selector */}
      <div className="space-y-2">
        <label htmlFor="clips-count" className="text-sm font-medium text-black">
          Number of Clips
        </label>
        <div className="px-2 pt-5">
          <Slider
            id="clips-count"
            value={[clipsCount]}
            onValueChange={(value) => setClipsCount(Math.max(MIN_CLIPS_COUNT, Math.min(MAX_CLIPS_COUNT, value[0])))}
            min={MIN_CLIPS_COUNT}
            max={MAX_CLIPS_COUNT}
            step={1}
            disabled={isLoading}
            className="w-full"
          />
        </div>
        <div className="flex justify-between text-xs text-gray-500">
          <span>{MIN_CLIPS_COUNT} clip</span>
          <span className="font-medium text-black">{clipsCount} clips</span>
          <span>{MAX_CLIPS_COUNT} clips</span>
        </div>
        <p className="text-xs text-gray-500">How many clips should the AI try to generate from this video.</p>
      </div>

      {/* Transcript Review Option */}
      <div className="pt-2">
        <div className="flex items-start gap-3">
          <input
            type="checkbox"
            id="transcript-review"
            checked={transcriptReviewEnabled}
            onChange={(e) => setTranscriptReviewEnabled(e.target.checked)}
            disabled={isLoading}
            className="mt-0.5 w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
          />
          <div>
            <label htmlFor="transcript-review" className="text-sm font-medium text-black cursor-pointer">
              Review and edit transcript before generating clips
            </label>
            <p className="text-xs text-gray-500 mt-1">
              When enabled, you&apos;ll be able to review and edit the transcript before the AI generates clips.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
