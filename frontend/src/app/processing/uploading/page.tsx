"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AppLayout } from "@/components/layout/AppLayout";
import { ProcessingView } from "@/components/clip/ProcessingView";
import { useUploadContext } from "@/contexts/upload-context";
import { useJwt } from "@/contexts/jwt-context";

export default function UploadingPage() {
  const router = useRouter();
  const { pendingUpload, setPendingUpload } = useUploadContext();
  const { apiFetch, jwt } = useJwt();
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [phase, setPhase] = useState<"uploading" | "creating" | "failed">("uploading");
  const hasStarted = useRef(false);

  useEffect(() => {
    // Already started — don't react to pendingUpload becoming null after upload finishes
    if (hasStarted.current) return;

    // No pending upload and we haven't started yet (e.g. page refresh) → go back to analysis
    if (!pendingUpload) {
      router.replace("/analysis");
      return;
    }

    if (!jwt) return;
    hasStarted.current = true;

    const { file, config } = pendingUpload;

    const run = async () => {
      try {
        // --- 1. Upload with XHR so we get progress events ---
        const videoPath = await new Promise<string>((resolve, reject) => {
          const formData = new FormData();
          formData.append("video", file);

          const xhr = new XMLHttpRequest();
          xhr.upload.addEventListener("progress", (e) => {
            if (e.lengthComputable) {
              setUploadProgress(Math.round((e.loaded / e.total) * 100));
            }
          });
          xhr.onload = () => {
            if (xhr.status >= 200 && xhr.status < 300) {
              resolve(JSON.parse(xhr.responseText).video_path);
            } else {
              reject(new Error("Upload failed"));
            }
          };
          xhr.onerror = () => reject(new Error("Network error during upload"));
          xhr.open("POST", `/api/upload`);
          xhr.send(formData);
        });

        // --- 2. Create task ---
        setPhase("creating");

        const requestBody: Record<string, unknown> = {
          source: { url: videoPath },
          caption_options: {
            pycaps_template: "word-focus",
            transitions_enabled: false,
            transcript_review_enabled: true,
          },
          transcription_options: { provider: "assemblyai" },
          ai_options: {
            provider: "openai",
            clips_count: config.clipsCount,
            prompt_id: config.promptId || undefined,
          },
        };

        if (config.srtContent) {
          (requestBody.transcription_options as Record<string, unknown>).srt_content = config.srtContent;
        }

        const response = await apiFetch(`${apiUrl}/tasks/`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(requestBody),
        });

        if (!response.ok) {
          const err = await response.json();
          throw new Error(err.detail || "Failed to create task");
        }

        const data = await response.json();
        router.replace(`/processing/${data.task_id}`);
        setPendingUpload(null);
      } catch (err: unknown) {
        setPhase("failed");
        setUploadError(err instanceof Error ? err.message : "Upload failed");
      }
    };

    run();
  }, [pendingUpload, jwt, apiUrl, router, setPendingUpload, apiFetch]);

  const taskStatus = {
    task_id: "",
    status: phase === "failed" ? ("failed" as const) : ("processing" as const),
    progress: phase === "creating" ? 100 : uploadProgress,
    current_step: "upload",
    message:
      phase === "creating"
        ? "Setting up your project..."
        : phase === "failed"
          ? uploadError || "Upload failed"
          : "Securely transferring your media...",
    source_title: pendingUpload?.file.name,
  };

  return (
    <AppLayout>
      <ProcessingView taskStatus={taskStatus} />
    </AppLayout>
  );
}
