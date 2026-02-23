"use client";

import { useState, useEffect, useRef, forwardRef, useImperativeHandle } from "react";
import DynamicVideoPlayer, { type VideoPlayerRef } from "@/components/dynamic-video-player";
import { SubtitlePreview } from "./SubtitlePreview";

interface Word {
  text: string;
  start: number; // milliseconds
  end: number; // milliseconds
}

interface VideoPlayerWithSubtitlesProps {
  src: string;
  words?: Word[];
  template?: string;
  showSubtitles?: boolean;
  className?: string;
  poster?: string;
  /** Clip start in the source video (seconds), used to convert absolute time to clip-relative */
  clipStartSeconds?: number;
}

export interface VideoPlayerWithSubtitlesRef extends VideoPlayerRef {
  setShowSubtitles: (show: boolean) => void;
  setTemplate: (template: string) => void;
}

/**
 * Video player component with synchronized subtitle overlay
 */
export const VideoPlayerWithSubtitles = forwardRef<VideoPlayerWithSubtitlesRef, VideoPlayerWithSubtitlesProps>(
  function VideoPlayerWithSubtitles(
    {
      src,
      words = [],
      template = "word-focus",
      showSubtitles = false,
      className = "",
      poster,
      clipStartSeconds = 0,
    },
    ref
  ) {
    const playerRef = useRef<VideoPlayerRef | null>(null);
    const [currentTime, setCurrentTime] = useState(0);
    const [internalShowSubtitles, setInternalShowSubtitles] = useState(showSubtitles);
    const [internalTemplate, setInternalTemplate] = useState(template);
    const animationFrameRef = useRef<number>();

    // Expose methods to parent via ref
    useImperativeHandle(ref, () => ({
      play: () => playerRef.current?.play(),
      pause: () => playerRef.current?.pause(),
      seekTo: (time: number) => playerRef.current?.seekTo(time),
      getCurrentTime: () => playerRef.current?.getCurrentTime() ?? 0,
      getDuration: () => playerRef.current?.getDuration() ?? 0,
      setShowSubtitles: (show: boolean) => setInternalShowSubtitles(show),
      setTemplate: (newTemplate: string) => setInternalTemplate(newTemplate),
    }));

    // Sync currentTime with video playback using requestAnimationFrame for smooth subtitle updates
    useEffect(() => {
      const updateTime = () => {
        if (playerRef.current) {
          const time = playerRef.current.getCurrentTime() ?? 0;
          setCurrentTime(time);
        }
        animationFrameRef.current = requestAnimationFrame(updateTime);
      };

      animationFrameRef.current = requestAnimationFrame(updateTime);

      return () => {
        if (animationFrameRef.current) {
          cancelAnimationFrame(animationFrameRef.current);
        }
      };
    }, []);

    // Update internal state when props change
    useEffect(() => {
      setInternalShowSubtitles(showSubtitles);
    }, [showSubtitles]);

    useEffect(() => {
      setInternalTemplate(template);
    }, [template]);

    return (
      <div className={`relative ${className}`}>
        <DynamicVideoPlayer
          ref={playerRef}
          src={src}
          poster={poster}
          className="w-full"
        />

        {/* Subtitle overlay */}
        {internalShowSubtitles && words.length > 0 && (
          <SubtitlePreview
            words={words}
            currentTime={currentTime}
            clipStartSeconds={clipStartSeconds}
            template={internalTemplate}
          />
        )}
      </div>
    );
  }
);
