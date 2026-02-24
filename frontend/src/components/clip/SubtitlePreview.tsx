"use client";

import { useEffect, useState } from "react";
import type React from "react";

// Matches Arabic, Hebrew, and other RTL scripts
const RTL_REGEX = /[\u0591-\u07FF\uFB1D-\uFDFD\uFE70-\uFEFC]/;

function detectRTL(words: { text: string }[]): boolean {
  return words.some((w) => RTL_REGEX.test(w.text));
}

interface Word {
  text: string;
  start: number; // milliseconds, clip-relative (0 = clip start)
  end: number;   // milliseconds, clip-relative
}

interface SubtitleStyle {
  font_size?: number;
  font_weight?: number;
  letter_spacing?: number;
  text_transform?: string;
}

interface SubtitlePreviewProps {
  words: Word[];
  /** Current absolute playback position of the source video in seconds */
  currentTime: number;
  /** Clip start in the source video in seconds — used to convert absolute time to clip-relative */
  clipStartSeconds: number;
  template?: string;
  subtitleStyle?: SubtitleStyle;
  className?: string;
}

// Inject Noto Sans Arabic from the backend fonts API once
let notoArabicInjected = false;
function injectNotoArabicFont(apiUrl: string) {
  if (notoArabicInjected || typeof document === "undefined") return;
  notoArabicInjected = true;
  const style = document.createElement("style");
  style.textContent = `@font-face {
  font-family: 'NotoSansArabic';
  src: url('${apiUrl}/fonts/NotoSansArabic-Regular') format('truetype');
  font-weight: normal;
  font-style: normal;
  font-display: swap;
}`;
  document.head.appendChild(style);
}

export function SubtitlePreview({
  words,
  currentTime,
  clipStartSeconds,
  template = "word-focus",
  subtitleStyle,
  className = "",
}: SubtitlePreviewProps) {
  const [css, setCss] = useState<string>(defaultSubtitleStyles);
  const [activeWordIndex, setActiveWordIndex] = useState<number>(-1);

  // Load pycaps-equivalent CSS for the selected template + inject Arabic font
  // Re-fetch whenever font_size changes so the template CSS reflects the same base size
  useEffect(() => {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
    injectNotoArabicFont(apiUrl);

    const load = async () => {
      try {
        const params = subtitleStyle?.font_size != null
          ? `?font_size=${subtitleStyle.font_size}`
          : "";
        const res = await fetch(`${apiUrl}/pycaps-templates/${template}/styles${params}`);
        if (!res.ok) { setCss(defaultSubtitleStyles); return; }
        const data = await res.json();
        setCss(data.css || defaultSubtitleStyles);
      } catch {
        setCss(defaultSubtitleStyles);
      }
    };
    load();
  }, [template, subtitleStyle?.font_size]);

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
  const isRTL       = detectRTL(visible.length > 0 ? visible : words);

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
          direction: isRTL ? "rtl" : "ltr",
        }}
      >
        <div
          className="segment"
          style={{
            display: "inline-block",
            direction: isRTL ? "rtl" : "ltr",
            ...(isRTL ? { fontFamily: "'NotoSansArabic', sans-serif" } : {}),
          }}
        >
          {visible.map((word, i) => {
            const globalIdx = windowStart + i;
            const isActive  = globalIdx === activeWordIndex;
            return (
              <span
                key={`${globalIdx}-${word.start}`}
                className={`word${isActive ? " word-active" : ""}`}
                style={{
                  display: "inline-block",
                  margin: "0 3px",
                  ...(isRTL ? { fontFamily: "'NotoSansArabic', sans-serif" } : {}),
                  ...(subtitleStyle?.font_size != null ? { fontSize: `${subtitleStyle.font_size}px` } : {}),
                  ...(subtitleStyle?.font_weight != null ? { fontWeight: subtitleStyle.font_weight } : {}),
                  ...(subtitleStyle?.letter_spacing != null ? { letterSpacing: `${subtitleStyle.letter_spacing}px` } : {}),
                  ...(subtitleStyle?.text_transform ? { textTransform: subtitleStyle.text_transform as React.CSSProperties["textTransform"] } : {}),
                }}
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
