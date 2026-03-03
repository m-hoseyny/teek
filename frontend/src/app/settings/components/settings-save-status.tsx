import { AlertCircle, CheckCircle, CircleDot, Loader2 } from "lucide-react";

interface SettingsSaveStatusProps {
  isDirty: boolean;
  isSaving: boolean;
  saveError: string | null;
}

export function SettingsSaveStatus({ isDirty, isSaving, saveError }: SettingsSaveStatusProps) {
  if (isSaving) {
    return (
      <div className="inline-flex items-center gap-2 rounded-md border border-blue-500/30 bg-blue-400/10 px-3 py-1.5 text-xs font-medium text-blue-400">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        <span>Saving...</span>
      </div>
    );
  }

  if (saveError) {
    return (
      <div className="inline-flex items-center gap-2 rounded-md border border-red-500/30 bg-red-400/10 px-3 py-1.5 text-xs font-medium text-red-400">
        <AlertCircle className="h-3.5 w-3.5" />
        <span>Error</span>
      </div>
    );
  }

  if (isDirty) {
    return (
      <div className="inline-flex items-center gap-2 rounded-md border border-amber-500/30 bg-amber-400/10 px-3 py-1.5 text-xs font-medium text-amber-400">
        <CircleDot className="h-3.5 w-3.5" />
        <span>Unsaved</span>
      </div>
    );
  }

  return (
    <div className="inline-flex items-center gap-2 rounded-md border border-green-500/30 bg-green-400/10 px-3 py-1.5 text-xs font-medium text-green-400">
      <CheckCircle className="h-3.5 w-3.5" />
      <span>Saved</span>
    </div>
  );
}
