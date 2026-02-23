"use client";

import { useEffect, useState } from "react";

interface Word {
  text: string;
  start: number; // milliseconds, clip-relative (0 = clip start)
  end: number;   // milliseconds, clip-relative
}

interface SubtitlePreviewProps {
  words: Word[];
  /** Current absolute playback position of the source video in seconds */
  currentTime: number;
  /** Clip start in the source video in seconds — used to convert absolute time to clip-relative */
  clipStartSeconds: number;
  template?: string;
  className?: string;
}

export function SubtitlePreview({
  words,
  currentTime,
  clipStartSeconds,
  template = "word-focus",
  className = "",
}: SubtitlePreviewProps) {
  const [css, setCss] = useState<string>(defaultSubtitleStyles);
  const [activeWordIndex, setActiveWordIndex] = useState<number>(-1);

  // Load pycaps-equivalent CSS for the selected template
  useEffect(() => {
    const load = async () => {
      try {
        const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
        const res = await fetch(`${apiUrl}/pycaps-templates/${template}/styles`);
        if (!res.ok) { setCss(defaultSubtitleStyles); return; }
        const data = await res.json();
        setCss(data.css || defaultSubtitleStyles);
      } catch {
        setCss(defaultSubtitleStyles);
      }
    };
    load();
  }, [template]);

  // Convert absolute video time → clip-relative ms, then find active word
  useEffect(() => {
    const relativeMs = (currentTime - clipStartSeconds) * 1000;
    const idx = words.findIndex((w) => relativeMs >= w.start && relativeMs < w.end);
    setActiveWordIndex(idx);
  }, [currentTime, clipStartSeconds, words]);

  // Show active word + 1 before + 2 after for context
  const windowStart = activeWordIndex <= 0 ? 0 : activeWordIndex - 1;
  const windowEnd   = Math.min(words.length, windowStart + 4);
  const visible     = words.slice(windowStart, windowEnd);

  if (words.length === 0) return null;

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: css }} />
      <div
        className={`subtitle-preview ${className}`}
        style={{
          position: "absolute",
          bottom: "18%",
          left: "50%",
          transform: "translateX(-50%)",
          width: "90%",
          textAlign: "center",
          pointerEvents: "none",
          zIndex: 10,
        }}
      >
        <div className="segment" style={{ display: "inline-block" }}>
          {visible.map((word, i) => {
            const globalIdx = windowStart + i;
            const isActive  = globalIdx === activeWordIndex;
            return (
              <span
                key={`${globalIdx}-${word.start}`}
                className={`word${isActive ? " word-active" : ""}`}
                style={{ display: "inline-block", marginRight: "6px" }}
              >
                {word.text}
              </span>
            );
          })}
        </div>
      </div>
    </>
  );
}

export const defaultSubtitleStyles = `
.subtitle-preview {
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
}
.segment {
  background: rgba(0,0,0,0.80);
  border-radius: 10px;
  padding: 10px 20px;
  backdrop-filter: blur(8px);
}
.word {
  font-size: 26px;
  font-weight: 800;
  color: #ffffff;
  text-shadow: 2px 2px 6px rgba(0,0,0,0.9);
  padding: 3px 6px;
  transition: all 0.15s ease;
  display: inline-block;
}
.word-active {
  color: #ffd700;
  transform: scale(1.15);
  text-shadow: 2px 2px 6px rgba(0,0,0,0.9), 0 0 16px rgba(255,215,0,0.55);
}
`;
