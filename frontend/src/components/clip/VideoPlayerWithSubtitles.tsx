"use client";

import { useState, useEffect, useRef, forwardRef, useImperativeHandle } from "react";
import DynamicVideoPlayer, { type VideoPlayerRef } from "@/components/dynamic-video-player";
import { AssSubtitleRenderer } from "./AssSubtitleRenderer";

interface VideoPlayerWithSubtitlesProps {
  src: string;
  /** ASS subtitle content from the backend /ass endpoint. */
  assContent?: string | null;
  showSubtitles?: boolean;
  className?: string;
  poster?: string;
}

export interface VideoPlayerWithSubtitlesRef extends VideoPlayerRef {
  setShowSubtitles: (show: boolean) => void;
}

/**
 * Video player with jassub-powered ASS subtitle overlay.
 *
 * The subtitle rendering is driven by the same .ass content that ffmpeg
 * uses when burning subtitles, so preview and export are pixel-identical.
 */
export const VideoPlayerWithSubtitles = forwardRef<
  VideoPlayerWithSubtitlesRef,
  VideoPlayerWithSubtitlesProps
>(function VideoPlayerWithSubtitles(
  { src, assContent = null, showSubtitles = false, className = "", poster },
  ref
) {
  const playerRef = useRef<VideoPlayerRef | null>(null);
  const [videoElement, setVideoElement] = useState<HTMLVideoElement | null>(null);
  const [internalShowSubtitles, setInternalShowSubtitles] = useState(showSubtitles);

  useImperativeHandle(ref, () => ({
    play: () => playerRef.current?.play(),
    pause: () => playerRef.current?.pause(),
    seekTo: (time: number) => playerRef.current?.seekTo(time),
    getCurrentTime: () => playerRef.current?.getCurrentTime() ?? 0,
    getDuration: () => playerRef.current?.getDuration() ?? 0,
    getVideoElement: () => playerRef.current?.getVideoElement() ?? null,
    setShowSubtitles: (show: boolean) => setInternalShowSubtitles(show),
  }));

  // Sync internal state when the prop changes
  useEffect(() => {
    setInternalShowSubtitles(showSubtitles);
  }, [showSubtitles]);

  // Obtain the raw <video> element once the player ref is ready.
  // We poll briefly because the ref is populated after the first render.
  useEffect(() => {
    const id = setInterval(() => {
      const el = playerRef.current?.getVideoElement() ?? null;
      if (el) {
        setVideoElement(el);
        clearInterval(id);
      }
    }, 100);
    return () => clearInterval(id);
  }, []);

  return (
    <div className={`relative ${className}`}>
      <DynamicVideoPlayer
        ref={playerRef}
        src={src}
        poster={poster}
        className="w-full"
      />

      <AssSubtitleRenderer
        videoElement={videoElement}
        assContent={assContent}
        enabled={internalShowSubtitles}
      />
    </div>
  );
});
