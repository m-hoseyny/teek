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
  userId: string | undefined;
}

interface UseLatestTaskReturn {
  task: LatestTask | null;
  isLoading: boolean;
}

export function useLatestTask({ apiUrl, userId }: UseLatestTaskOptions): UseLatestTaskReturn {
  const [task, setTask] = useState<LatestTask | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    const fetchLatestTask = async () => {
      if (!userId) return;

      try {
        setIsLoading(true);
        const response = await fetch(`${apiUrl}/tasks/`, {
          headers: {
            user_id: userId,
          },
        });

        if (response.ok) {
          const data = await response.json();
          if (data.tasks && data.tasks.length > 0) {
            setTask(data.tasks[0]); // Get the first (latest) task
          }
        }
      } catch (error) {
        console.error("Failed to load latest task:", error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchLatestTask();
  }, [apiUrl, userId]);

  return {
    task,
    isLoading,
  };
}
