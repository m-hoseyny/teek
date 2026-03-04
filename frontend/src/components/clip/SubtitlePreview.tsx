"use client";

import { useEffect, useState, useRef } from "react";
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

/** CSS position style for the subtitle overlay derived from pycaps vertical_align config */
interface VerticalAlign {
  align: "top" | "center" | "bottom";
  offset?: number;
}

function verticalAlignToStyle(va: VerticalAlign): React.CSSProperties {
  const offset = typeof va.offset === "number" ? va.offset : 0;
  switch (va.align) {
    case "center":
      return {
        top: `${(0.5 + offset) * 100}%`,
        transform: "translate(-50%, -50%)",
      };
    case "top":
      return {
        top: `${offset * 100}%`,
        transform: "translateX(-50%)",
      };
    case "bottom":
    default:
      return {
        bottom: `${Math.abs(offset) * 100}%`,
        transform: "translateX(-50%)",
      };
  }
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
  const [verticalAlign, setVerticalAlign] = useState<VerticalAlign>({ align: "bottom" });
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(0);

  // Track container width to scale subtitle font sizes proportionally
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      setContainerWidth(entries[0].contentRect.width);
    });
    ro.observe(el);
    setContainerWidth(el.getBoundingClientRect().width);
    return () => ro.disconnect();
  }, []);

  // Fetch the REAL pycaps CSS from the backend (read from the installed package).
  // The backend rewrites font URLs and adds .word-active alias for .word-being-narrated
  // so what we render here matches exactly what pycaps burns into the video.
  useEffect(() => {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
    injectNotoArabicFont(apiUrl);

    const load = async () => {
      try {
        const params = new URLSearchParams();
        if (subtitleStyle?.font_size != null) params.set("font_size", String(subtitleStyle.font_size));
        if (subtitleStyle?.font_weight != null) params.set("font_weight", String(subtitleStyle.font_weight));
        if (subtitleStyle?.letter_spacing != null) params.set("letter_spacing", String(subtitleStyle.letter_spacing));
        if (subtitleStyle?.text_transform) params.set("text_transform", subtitleStyle.text_transform);
        const qs = params.toString() ? `?${params.toString()}` : "";
        const res = await fetch(`${apiUrl}/pycaps-templates/${template}/styles${qs}`);
        if (!res.ok) { setCss(defaultSubtitleStyles); return; }
        const data = await res.json();
        setCss(data.css || defaultSubtitleStyles);
        if (data.vertical_align) setVerticalAlign(data.vertical_align);
      } catch {
        setCss(defaultSubtitleStyles);
      }
    };
    load();
  }, [template, subtitleStyle?.font_size, subtitleStyle?.font_weight, subtitleStyle?.letter_spacing, subtitleStyle?.text_transform]);

  // Convert absolute video time → clip-relative ms, then find active word (derived, no state)
  const relativeMs = (currentTime - clipStartSeconds) * 1000;
  const activeWordIndex = words.findIndex((w) => relativeMs >= w.start && relativeMs < w.end);

  // Scale subtitle font sizes to match the container width.
  // CSS values from the backend are tuned for a ~600px player (containerWidth ≈ 540px = 90%).
  // On narrower screens we scale down proportionally, capped at 1 so desktop is unchanged.
  const REFERENCE_WIDTH = 540;
  const scale = containerWidth > 0 ? Math.min(1, containerWidth / REFERENCE_WIDTH) : 1;

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
        ref={containerRef}
        className={`subtitle-preview ${className}`}
        style={{
          position: "absolute",
          left: "50%",
          width: "90%",
          textAlign: "center",
          pointerEvents: "none",
          zIndex: 10,
          direction: isRTL ? "rtl" : "ltr",
          ...verticalAlignToStyle(verticalAlign),
        }}
      >
        <div
          className="segment"
          style={{
            display: "inline-block",
            zoom: scale,
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
                  // font_size/font_weight/letter_spacing/text_transform are applied
                  // via the CSS fetched from /pycaps-templates/{template}/styles,
                  // which uses the same _build_style_css() logic as the backend renderer.
                  ...(isRTL ? { fontFamily: "'NotoSansArabic', sans-serif" } : {}),
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

// Fallback CSS used only when the backend /styles fetch fails.
// No .segment background — the real pycaps templates don't have one.
export const defaultSubtitleStyles = `
.word {
  font-family: sans-serif;
  font-size: 24px;
  font-weight: 800;
  color: #ffffff;
  text-transform: uppercase;
  text-shadow:
    -2px -2px 2px #000,
     2px -2px 2px #000,
    -2px  2px 2px #000,
     2px  2px 2px #000;
  padding: 4px 4px;
  display: inline-block;
}
.word-active, .word-being-narrated {
  background-color: #f76f00;
  border-radius: 5%;
}
`;
