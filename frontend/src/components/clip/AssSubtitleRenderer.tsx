"use client";

import { useEffect, useRef } from "react";

// Keys must be lowercase — jassub worker does `.trim().toLowerCase()` before lookup.
const AVAILABLE_FONTS: Record<string, string> = {
  "liberation sans": "/api/jassub-font-default",
  "anton": "/fonts/Anton-Regular.ttf",
  "archivo black": "/fonts/ArchivoBlack-Regular.ttf",
  "barlow condensed": "/fonts/BarlowCondensed-SemiBold.ttf",
  "bebas neue": "/fonts/BebasNeue-Regular.ttf",
  "indie flower": "/fonts/IndieFlower-Regular.ttf",
  "inter": "/fonts/Inter-Variable.ttf",
  "lato": "/fonts/Lato-Bold.ttf",
  "noto sans": "/fonts/NotoSans-Regular.ttf",
  "noto sans arabic": "/fonts/NotoSansArabic-Regular.ttf",
  "open sans": "/fonts/OpenSans-Variable.ttf",
  "oswald": "/fonts/Oswald-Variable.ttf",
  "poppins": "/fonts/Poppins-SemiBold.ttf",
  "roboto": "/fonts/Roboto-Variable.ttf",
  "the bold font": "/fonts/THEBOLDFONT-FREEVERSION.ttf",
  "tiktok sans": "/fonts/TikTokSans-Regular.ttf",
};

interface AssSubtitleRendererProps {
  videoElement: HTMLVideoElement | null;
  assContent: string | null;
  enabled?: boolean;
}

/** Apply assContent to a live jassub renderer and force a visual update. */
function applyTrack(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  renderer: any,
  content: string,
  video: HTMLVideoElement | null,
) {
  renderer.setTrack(content);
  try { renderer.resize(); } catch { /* ignore */ }
  if (video?.paused) {
    // requestVideoFrameCallback only fires on new frames.
    // Setting currentTime on a paused video forces the browser to decode
    // and present a frame → callback fires → jassub renders the new track.
    video.currentTime = video.currentTime;
  }
}

export function AssSubtitleRenderer({
  videoElement,
  assContent,
  enabled = true,
}: AssSubtitleRendererProps) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rendererRef = useRef<any>(null);

  // Always holds the latest assContent so the async init callback can read it
  // without being a stale closure.
  const assContentRef = useRef(assContent);
  assContentRef.current = assContent;

  // If assContent arrives while the jassub import is still in flight, store it
  // here so the init callback can apply it right after the renderer is created.
  const pendingTrackRef = useRef<string | null>(null);

  // ── Effect 1: lifecycle — create / destroy jassub ──────────────────────────
  // Does NOT list assContent as a dep.  Track updates use Effect 2 + pendingTrackRef
  // so the worker is never torn down just because the subtitle content changed.
  useEffect(() => {
    if (!videoElement || !enabled) {
      if (rendererRef.current) {
        try { rendererRef.current.destroy(); } catch { /* ignore */ }
        rendererRef.current = null;
      }
      return;
    }

    const container = videoElement.parentElement;
    if (!container) return;
    if (getComputedStyle(container).position === "static") {
      container.style.position = "relative";
    }

    let cancelled = false;

    import("jassub").then(({ default: JASSUB }) => {
      if (cancelled) return;
      if (rendererRef.current) {
        try { rendererRef.current.destroy(); } catch { /* ignore */ }
        rendererRef.current = null;
      }
      try {
        // Use the latest available content at init time (may still be "").
        const initContent = assContentRef.current ?? "";
        rendererRef.current = new JASSUB({
          video: videoElement,
          subContent: initContent,
          workerUrl: "/api/jassub-worker",
          wasmUrl: "/api/jassub-wasm",
          modernWasmUrl: "/api/jassub-wasm-modern",
          legacyWasmUrl: "/api/jassub-wasm-legacy",
          availableFonts: AVAILABLE_FONTS,
          offscreenRender: false,
        });

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const jassubDiv: HTMLElement | undefined = (rendererRef.current as any)._canvasParent;
        if (jassubDiv) {
          jassubDiv.style.position = "absolute";
          jassubDiv.style.top = "0";
          jassubDiv.style.left = "0";
          jassubDiv.style.right = "0";
          jassubDiv.style.bottom = "0";
          jassubDiv.style.pointerEvents = "none";
          jassubDiv.style.zIndex = "2";
          try { rendererRef.current.resize(); } catch { /* ignore */ }
        }

        // If a track arrived while the import was in flight (Effect 2 stored it
        // in pendingTrackRef), apply it now.  Otherwise use whatever we already
        // passed as subContent.
        const pending = pendingTrackRef.current;
        if (pending && pending !== initContent) {
          applyTrack(rendererRef.current, pending, videoElement);
          pendingTrackRef.current = null;
        } else if (initContent && videoElement.paused) {
          videoElement.currentTime = videoElement.currentTime;
        }
      } catch (err) {
        console.error("[AssSubtitleRenderer] Failed to initialise jassub:", err);
      }
    }).catch((err) => {
      console.error("[AssSubtitleRenderer] Failed to load jassub:", err);
    });

    return () => {
      cancelled = true;
      if (rendererRef.current) {
        try { rendererRef.current.destroy(); } catch { /* ignore */ }
        rendererRef.current = null;
      }
    };
  // assContent intentionally omitted — track updates handled by Effect 2.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoElement, enabled]);

  // ── Effect 2: hot-update the subtitle track ────────────────────────────────
  // Fires whenever assContent changes (e.g. font size patched client-side or
  // template changed).  If the renderer is already alive, updates it instantly.
  // If the renderer is still initialising, stores the content in pendingTrackRef
  // so Effect 1's init callback picks it up.
  useEffect(() => {
    if (!assContent) return;

    if (rendererRef.current) {
      applyTrack(rendererRef.current, assContent, videoElement ?? null);
      pendingTrackRef.current = null;
    } else {
      // Renderer not ready yet — queue for after init.
      pendingTrackRef.current = assContent;
    }
  }, [assContent, videoElement]);

  return null;
}
