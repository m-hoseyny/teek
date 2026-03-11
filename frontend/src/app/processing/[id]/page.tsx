"use client";

import { useEffect, useState, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { AppLayout } from "@/components/layout/AppLayout";
import { ProcessingView } from "@/components/clip/ProcessingView";
import { useJwt } from "@/contexts/jwt-context";

interface TaskStatus {
  task_id: string;
  status: "pending" | "processing" | "completed" | "failed" | "awaiting_review" | "transcribed";
  progress: number;
  current_step: string;
  message: string;
  error?: string;
  source_title?: string;
  clips_count?: number;
}

export default function ProcessingPage() {
  const params = useParams();
  const router = useRouter();
  const { apiFetch, jwt } = useJwt();
  const taskId = params.id as string;
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

  const [taskStatus, setTaskStatus] = useState<TaskStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const eventSourceRef = useRef<EventSource | null>(null);

  useEffect(() => {
    if (!jwt || !taskId) return;

    // Initial fetch to get task info
    const fetchTask = async () => {
      try {
        const response = await apiFetch(`${apiUrl}/tasks/${taskId}`);

        if (response.ok) {
          const data = await response.json();
          setTaskStatus({
            task_id: data.id,
            status: data.status,
            progress: 0,
            current_step: "",
            message: "",
            source_title: data.source?.title || data.source?.url,
          });

          // If awaiting review or completed, redirect to transcript review
          if (data.status === "awaiting_review" || data.status === "transcribed" || data.status === "completed") {
            router.push(`/review/${taskId}`);
            return;
          }
        }
        setIsLoading(false);
      } catch (error) {
        console.error("Failed to fetch task:", error);
        setIsLoading(false);
      }
    };

    fetchTask();

    // Set up SSE for real-time progress updates.
    // Use the Next.js API route (/api/tasks/{id}/progress) instead of the
    // rewrite proxy (/api/backend/...) because Next.js rewrites buffer SSE.
    const setupSSE = () => {
      const eventSource = new EventSource(`/api/tasks/${taskId}/progress`);

      // Handle different SSE event types
      eventSource.addEventListener("status", (event: any) => {
        try {
          const data = JSON.parse(event.data);
          console.log("SSE status event:", data);

          setTaskStatus((prev) => ({
            task_id: taskId,
            status: data.status || prev?.status || "processing",
            progress: data.progress || prev?.progress || 0,
            current_step: data.current_step || data.metadata?.step_name || data.metadata?.stage || prev?.current_step || "",
            message: data.message || prev?.message || "",
            error: data.error,
            source_title: data.source_title || prev?.source_title,
            clips_count: data.clips_count,
          }));
        } catch (error) {
          console.error("Failed to parse SSE status:", error);
        }
      });

      eventSource.addEventListener("progress", (event: any) => {
        try {
          const data = JSON.parse(event.data);
          console.log("SSE progress event:", data);

          setTaskStatus((prev) => ({
            task_id: taskId,
            status: data.status || prev?.status || "processing",
            progress: data.progress !== undefined ? data.progress : (prev?.progress || 0),
            current_step: data.current_step || data.metadata?.step_name || data.metadata?.stage || prev?.current_step || "",
            message: data.message || prev?.message || "",
            error: data.error,
            source_title: data.source_title || prev?.source_title,
            clips_count: data.clips_count,
          }));

          // If awaiting review or completed, close SSE and redirect
          if (data.status === "awaiting_review" || data.status === "transcribed" || data.status === "completed") {
            eventSource.close();
            setTimeout(() => {
              router.push(`/review/${taskId}`);
            }, 2000);
          }

          // If failed, close SSE
          if (data.status === "failed" || data.status === "error") {
            eventSource.close();
          }
        } catch (error) {
          console.error("Failed to parse SSE progress:", error);
        }
      });

      eventSource.addEventListener("heartbeat", () => {
        // keepalive — no state update needed
      });

      eventSource.addEventListener("close", (event: any) => {
        console.log("SSE close event:", event);
        eventSource.close();
      });

      // Also handle default message events
      eventSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          console.log("SSE default message:", data);

          setTaskStatus((prev) => ({
            task_id: taskId,
            status: data.status || prev?.status || "processing",
            progress: data.progress !== undefined ? data.progress : (prev?.progress || 0),
            current_step: data.current_step || data.metadata?.step_name || data.metadata?.stage || prev?.current_step || "",
            message: data.message || prev?.message || "",
            error: data.error,
            source_title: data.source_title || prev?.source_title,
            clips_count: data.clips_count,
          }));
        } catch (error) {
          console.error("Failed to parse SSE data:", error);
        }
      };

      eventSource.onerror = (error) => {
        console.error("SSE error:", error);
        eventSource.close();

        // Fallback to polling if SSE fails
        const pollInterval = setInterval(async () => {
          try {
            const response = await apiFetch(`${apiUrl}/tasks/${taskId}`);

            if (response.ok) {
              const data = await response.json();
              setTaskStatus((prev) => ({
                task_id: taskId,
                status: data.status,
                progress: prev?.progress || 50,
                current_step: prev?.current_step || "processing",
                message: prev?.message || "Processing...",
                source_title: data.source?.title || data.source?.url,
              }));

              if (data.status === "awaiting_review" || data.status === "transcribed" || data.status === "completed") {
                clearInterval(pollInterval);
                router.push(`/review/${taskId}`);
              } else if (data.status === "failed") {
                clearInterval(pollInterval);
              }
            }
          } catch (error) {
            console.error("Polling error:", error);
          }
        }, 3000);

        return () => clearInterval(pollInterval);
      };

      eventSourceRef.current = eventSource;
    };

    setupSSE();

    // Cleanup on unmount
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
    };
  }, [taskId, jwt, apiUrl, router, apiFetch]);

  if (isLoading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center h-screen">
          <div className="text-center">
            <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
            <p className="text-gray-400">Loading task...</p>
          </div>
        </div>
      </AppLayout>
    );
  }

  if (!taskStatus) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center h-screen">
          <div className="text-center">
            <h2 className="text-2xl font-bold text-white mb-2">Task not found</h2>
            <p className="text-gray-400">The task you're looking for doesn't exist.</p>
          </div>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <ProcessingView taskStatus={taskStatus} />
    </AppLayout>
  );
}
