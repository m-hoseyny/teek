"use client";

import { useState, useCallback } from "react";

export interface Font {
  name: string;
  display_name: string;
}

interface UseFontsOptions {
  apiUrl: string;
}

interface UseFontsReturn {
  availableFonts: Font[];
  isUploading: boolean;
  uploadMessage: string | null;
  uploadError: string | null;
  loadFonts: () => Promise<void>;
  uploadFont: (file: File) => Promise<string | null>;
}

export function useFonts({ apiUrl }: UseFontsOptions): UseFontsReturn {
  const [availableFonts, setAvailableFonts] = useState<Font[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadMessage, setUploadMessage] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const loadFonts = useCallback(async () => {
    try {
      const response = await fetch(`${apiUrl}/fonts`);
      if (!response.ok) {
        return;
      }

      const data = await response.json();
      const fonts = data.fonts || [];
      setAvailableFonts(fonts);

      // Dynamically load fonts using @font-face
      const fontFaceStyles = fonts
        .map((font: { name: string }) => {
          return `
          @font-face {
            font-family: '${font.name}';
            src: url('${apiUrl}/fonts/${font.name}') format('truetype');
            font-weight: normal;
            font-style: normal;
          }
        `;
        })
        .join("\n");

      // Inject font styles into the page
      const styleElement = document.createElement("style");
      styleElement.id = "custom-fonts";
      styleElement.innerHTML = fontFaceStyles;

      // Remove existing custom fonts style if present
      const existingStyle = document.getElementById("custom-fonts");
      if (existingStyle) {
        existingStyle.remove();
      }

      document.head.appendChild(styleElement);
    } catch (error) {
      console.error("Failed to load fonts:", error);
    }
  }, [apiUrl]);

  const uploadFont = useCallback(
    async (file: File): Promise<string | null> => {
      setUploadError(null);
      setUploadMessage(null);

      if (!file.name.toLowerCase().endsWith(".ttf")) {
        setUploadError("Only .ttf font files are supported.");
        return null;
      }

      setIsUploading(true);
      try {
        const formData = new FormData();
        formData.append("font", file);

        const response = await fetch(`${apiUrl}/fonts/upload`, {
          method: "POST",
          body: formData,
        });

        const responseData = await response
          .json()
          .catch(() => ({} as { detail?: string; message?: string; font?: { name?: string } }));

        if (!response.ok) {
          throw new Error(responseData?.detail || "Failed to upload font");
        }

        await loadFonts();
        setUploadMessage(responseData?.message || "Font uploaded successfully.");
        return responseData?.font?.name || null;
      } catch (uploadError) {
        const message = uploadError instanceof Error ? uploadError.message : "Failed to upload font.";
        setUploadError(message);
        return null;
      } finally {
        setIsUploading(false);
      }
    },
    [apiUrl, loadFonts]
  );

  return {
    availableFonts,
    isUploading,
    uploadMessage,
    uploadError,
    loadFonts,
    uploadFont,
  };
}
