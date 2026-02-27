"use client";

import { createContext, useContext, useState, ReactNode } from "react";

export interface PendingUploadConfig {
  clipsCount: number;
  promptId: string;
  userId: string;
  srtContent?: string;
}

export interface PendingUpload {
  file: File;
  config: PendingUploadConfig;
}

interface UploadContextValue {
  pendingUpload: PendingUpload | null;
  setPendingUpload: (upload: PendingUpload | null) => void;
}

const UploadContext = createContext<UploadContextValue>({
  pendingUpload: null,
  setPendingUpload: () => {},
});

export function UploadProvider({ children }: { children: ReactNode }) {
  const [pendingUpload, setPendingUpload] = useState<PendingUpload | null>(null);
  return (
    <UploadContext.Provider value={{ pendingUpload, setPendingUpload }}>
      {children}
    </UploadContext.Provider>
  );
}

export function useUploadContext() {
  return useContext(UploadContext);
}
