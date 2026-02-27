import { useEffect, useState } from "react";
import { Cloud, Cpu } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { TranscriptionProvider } from "../settings-section-types";

interface SettingsSectionTranscriptionProps {
  isSaving: boolean;
  transcriptionProvider: TranscriptionProvider;
  whisperChunkingEnabled: boolean;
  whisperChunkDurationSeconds: number;
  whisperChunkOverlapSeconds: number;
  taskTimeoutSeconds: number;
  taskTimeoutMaxSeconds: number;
  isSavingAssemblyKey: boolean;
  assemblyApiKey: string;
  hasSavedAssemblyKey: boolean;
  hasAssemblyEnvFallback: boolean;
  assemblyKeyStatus: string | null;
  assemblyKeyError: string | null;
  onTranscriptionProviderChange: (provider: TranscriptionProvider) => void;
  onWhisperChunkingEnabledChange: (enabled: boolean) => void;
  onWhisperChunkDurationSecondsChange: (seconds: number) => void;
  onWhisperChunkOverlapSecondsChange: (seconds: number) => void;
  onTaskTimeoutSecondsChange: (seconds: number) => void;
  onAssemblyApiKeyChange: (value: string) => void;
  onSaveAssemblyKey: () => void;
  onDeleteAssemblyKey: () => void;
}

export function SettingsSectionTranscription({
  isSaving,
  transcriptionProvider,
  whisperChunkingEnabled,
  whisperChunkDurationSeconds,
  whisperChunkOverlapSeconds,
  taskTimeoutSeconds,
  taskTimeoutMaxSeconds,
  isSavingAssemblyKey,
  assemblyApiKey,
  hasSavedAssemblyKey,
  hasAssemblyEnvFallback,
  assemblyKeyStatus,
  assemblyKeyError,
  onTranscriptionProviderChange,
  onWhisperChunkingEnabledChange,
  onWhisperChunkDurationSecondsChange,
  onWhisperChunkOverlapSecondsChange,
  onTaskTimeoutSecondsChange,
  onAssemblyApiKeyChange,
  onSaveAssemblyKey,
  onDeleteAssemblyKey,
}: SettingsSectionTranscriptionProps) {
  const [taskTimeoutInput, setTaskTimeoutInput] = useState(String(taskTimeoutSeconds));
  const [chunkDurationInput, setChunkDurationInput] = useState(String(whisperChunkDurationSeconds));
  const [chunkOverlapInput, setChunkOverlapInput] = useState(String(whisperChunkOverlapSeconds));

  useEffect(() => {
    setTaskTimeoutInput(String(taskTimeoutSeconds));
  }, [taskTimeoutSeconds]);

  useEffect(() => {
    setChunkDurationInput(String(whisperChunkDurationSeconds));
  }, [whisperChunkDurationSeconds]);

  useEffect(() => {
    setChunkOverlapInput(String(whisperChunkOverlapSeconds));
  }, [whisperChunkOverlapSeconds]);

  const commitTaskTimeoutInput = () => {
    const parsed = Number(taskTimeoutInput);
    if (!Number.isFinite(parsed)) {
      setTaskTimeoutInput(String(taskTimeoutSeconds));
      return;
    }
    onTaskTimeoutSecondsChange(parsed);
  };

  const commitChunkDurationInput = () => {
    const parsed = Number(chunkDurationInput);
    if (!Number.isFinite(parsed)) {
      setChunkDurationInput(String(whisperChunkDurationSeconds));
      return;
    }
    onWhisperChunkDurationSecondsChange(parsed);
  };

  const commitChunkOverlapInput = () => {
    const parsed = Number(chunkOverlapInput);
    if (!Number.isFinite(parsed)) {
      setChunkOverlapInput(String(whisperChunkOverlapSeconds));
      return;
    }
    onWhisperChunkOverlapSecondsChange(parsed);
  };

  return (
    <div className="space-y-4">
      <div className="space-y-3">
        <div>
          <p className="text-sm font-medium text-black">Provider</p>
          <p className="text-xs text-gray-500">Choose AssemblyAI (default) or local Whisper for transcript generation.</p>
        </div>

        <Select
          value={transcriptionProvider}
          onValueChange={(value) => onTranscriptionProviderChange(value as TranscriptionProvider)}
          disabled={isSaving || isSavingAssemblyKey}
        >
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Select provider" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="assemblyai">
              <div className="flex items-center gap-2">
                <Cloud className="w-4 h-4" />
                AssemblyAI (Default)
              </div>
            </SelectItem>
            <SelectItem value="local">
              <div className="flex items-center gap-2">
                <Cpu className="w-4 h-4" />
                Local Whisper
              </div>
            </SelectItem>
          </SelectContent>
        </Select>

        <p className="text-xs text-gray-500">
          {transcriptionProvider === "local"
            ? "Local mode uses the local worker queue and can run in parallel across workers."
            : "AssemblyAI mode uses a dedicated single-worker queue to avoid overloading remote transcription jobs."}
        </p>

        <div className="space-y-2 rounded border border-gray-100 bg-gray-50 p-3">
          <label className="text-xs font-medium text-black">Task Timeout (seconds)</label>
          <Input
            type="number"
            min={300}
            max={taskTimeoutMaxSeconds}
            step={1}
            value={taskTimeoutInput}
            onChange={(event) => setTaskTimeoutInput(event.target.value)}
            onBlur={commitTaskTimeoutInput}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.currentTarget.blur();
              }
            }}
            disabled={isSaving || isSavingAssemblyKey}
          />
          <p className="text-xs text-gray-500">Maximum allowed by current worker config: {taskTimeoutMaxSeconds}s.</p>
        </div>

        {transcriptionProvider === "local" && (
          <div className="space-y-2 rounded border border-gray-100 bg-gray-50 p-3">
            <label className="flex items-center gap-2 text-xs font-medium text-black">
              <input
                type="checkbox"
                checked={whisperChunkingEnabled}
                onChange={(event) => onWhisperChunkingEnabledChange(event.target.checked)}
                disabled={isSaving || isSavingAssemblyKey}
              />
              Enable local Whisper chunking
            </label>
            <div className="grid gap-2 sm:grid-cols-2">
              <div className="space-y-1">
                <label className="text-xs font-medium text-black">Chunk Duration (seconds)</label>
                <Input
                  type="number"
                  min={300}
                  max={3600}
                  step={1}
                  value={chunkDurationInput}
                  onChange={(event) => setChunkDurationInput(event.target.value)}
                  onBlur={commitChunkDurationInput}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.currentTarget.blur();
                    }
                  }}
                  disabled={isSaving || isSavingAssemblyKey || !whisperChunkingEnabled}
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-black">Chunk Overlap (seconds)</label>
                <Input
                  type="number"
                  min={0}
                  max={120}
                  step={1}
                  value={chunkOverlapInput}
                  onChange={(event) => setChunkOverlapInput(event.target.value)}
                  onBlur={commitChunkOverlapInput}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.currentTarget.blur();
                    }
                  }}
                  disabled={isSaving || isSavingAssemblyKey || !whisperChunkingEnabled}
                />
              </div>
            </div>
            <p className="text-xs text-gray-500">
              Recommended defaults: 1200s duration with 8s overlap for multi-hour videos.
            </p>
          </div>
        )}

        {transcriptionProvider === "assemblyai" && (
          <div className="space-y-2 rounded border border-gray-100 bg-gray-50 p-3">
            <label htmlFor="assembly-api-key" className="text-xs font-medium text-black">
              AssemblyAI API Key
            </label>
            <Input
              id="assembly-api-key"
              type="password"
              value={assemblyApiKey}
              onChange={(event) => onAssemblyApiKeyChange(event.target.value ?? "")}
              placeholder={
                hasSavedAssemblyKey ? "Saved key present (enter new key to replace)" : "Paste your AssemblyAI key"
              }
              disabled={isSaving || isSavingAssemblyKey}
            />
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={isSaving || isSavingAssemblyKey || !assemblyApiKey.trim()}
                onClick={onSaveAssemblyKey}
              >
                {isSavingAssemblyKey ? "Saving..." : "Save Key"}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={isSaving || isSavingAssemblyKey || !hasSavedAssemblyKey}
                onClick={onDeleteAssemblyKey}
              >
                Remove Saved Key
              </Button>
              <span className="text-xs text-gray-500">
                {hasSavedAssemblyKey
                  ? "Saved key available"
                  : hasAssemblyEnvFallback
                    ? "No saved key; using backend env fallback"
                    : "No key configured"}
              </span>
            </div>
            {assemblyKeyStatus && <p className="text-xs text-green-600">{assemblyKeyStatus}</p>}
            {assemblyKeyError && <p className="text-xs text-red-600">{assemblyKeyError}</p>}
          </div>
        )}
      </div>
    </div>
  );
}
