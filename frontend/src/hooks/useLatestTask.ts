"use client";

import { useState, useEffect } from "react";

export interface LatestTask {
  id: string;
  source_title: string;
  source_type: string;
  status: string;
  clips_count: number;
  created_at: string;
}

interface UseLatestTaskOptions {
  apiUrl: string;
  apiFetch: (url: string, init?: RequestInit) => Promise<Response>;
}

interface UseLatestTaskReturn {
  task: LatestTask | null;
  isLoading: boolean;
}

export function useLatestTask({ apiUrl, apiFetch }: UseLatestTaskOptions): UseLatestTaskReturn {
  const [task, setTask] = useState<LatestTask | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    const fetchLatestTask = async () => {
      try {
        setIsLoading(true);
        const response = await apiFetch(`${apiUrl}/tasks/`);

        if (response.ok) {
          const data = await response.json();
          if (data.tasks && data.tasks.length > 0) {
            setTask(data.tasks[0]);
          }
        }
      } catch (error) {
        console.error("Failed to load latest task:", error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchLatestTask();
  }, [apiUrl, apiFetch]);

  return {
    task,
    isLoading,
  };
}
