"use client";

import { useState, useEffect } from "react";

export interface Prompt {
  id: string;
  name: string;
  description: string;
}

interface UsePromptsOptions {
  apiUrl: string;
  userId: string | undefined;
}

interface UsePromptsReturn {
  prompts: Prompt[];
  selectedPromptId: string;
  setSelectedPromptId: (id: string) => void;
  isLoading: boolean;
}

export function usePrompts({ apiUrl, userId }: UsePromptsOptions): UsePromptsReturn {
  const [prompts, setPrompts] = useState<Prompt[]>([]);
  const [selectedPromptId, setSelectedPromptId] = useState<string>("default");
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    const loadPrompts = async () => {
      if (!userId) return;

      try {
        setIsLoading(true);
        const response = await fetch(`${apiUrl}/tasks/prompts`, {
          headers: {
            user_id: userId,
          },
        });

        if (!response.ok) {
          return;
        }

        const data = await response.json();
        if (data.prompts && Array.isArray(data.prompts)) {
          setPrompts(data.prompts);
          if (data.default_prompt_id) {
            setSelectedPromptId(data.default_prompt_id);
          }
        }
      } catch (promptError) {
        console.error("Failed to load prompts:", promptError);
      } finally {
        setIsLoading(false);
      }
    };

    void loadPrompts();
  }, [apiUrl, userId]);

  return {
    prompts,
    selectedPromptId,
    setSelectedPromptId,
    isLoading,
  };
}
