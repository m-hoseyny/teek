"use client";

import { useRef, useState, useEffect } from "react";
import { Play, Pause, Volume2, VolumeX, Maximize, Download } from "lucide-react";

interface VideoPlayerProps {
  src: string;
  poster?: string;
  className?: string;
  autoPlay?: boolean;
  controls?: boolean;
  aspectRatio?: "9:16" | "1:1" | "16:9" | "auto";
}

export function VideoPlayer({
  src,
  poster,
  className = "",
  autoPlay = false,
  controls = true,
  aspectRatio = "auto"
}: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [detectedAspectRatio, setDetectedAspectRatio] = useState<string>("16:9");

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const updateTime = () => setCurrentTime(video.currentTime);
    const updateDuration = () => setDuration(video.duration);
    const handleEnded = () => setIsPlaying(false);

    const detectAspectRatio = () => {
      if (video.videoWidth && video.videoHeight) {
        const ratio = video.videoWidth / video.videoHeight;
        if (ratio < 0.7) {
          setDetectedAspectRatio("9:16"); // Vertical/Portrait
        } else if (ratio >= 0.9 && ratio <= 1.1) {
          setDetectedAspectRatio("1:1"); // Square
        } else if (ratio > 1.5) {
          setDetectedAspectRatio("16:9"); // Horizontal/Landscape
        } else {
          setDetectedAspectRatio("16:9"); // Default
        }
      }
    };

    video.addEventListener("timeupdate", updateTime);
    video.addEventListener("loadedmetadata", () => {
      updateDuration();
      detectAspectRatio();
    });
    video.addEventListener("ended", handleEnded);

    return () => {
      video.removeEventListener("timeupdate", updateTime);
      video.removeEventListener("loadedmetadata", updateDuration);
      video.removeEventListener("ended", handleEnded);
    };
  }, []);

  const togglePlay = () => {
    const video = videoRef.current;
    if (!video) return;

    if (isPlaying) {
      video.pause();
    } else {
      video.play();
    }
    setIsPlaying(!isPlaying);
  };

  const toggleMute = () => {
    const video = videoRef.current;
    if (!video) return;

    video.muted = !isMuted;
    setIsMuted(!isMuted);
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const video = videoRef.current;
    if (!video) return;

    const newVolume = parseFloat(e.target.value);
    video.volume = newVolume;
    setVolume(newVolume);
    setIsMuted(newVolume === 0);
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const video = videoRef.current;
    if (!video) return;

    const newTime = parseFloat(e.target.value);
    video.currentTime = newTime;
    setCurrentTime(newTime);
  };

  const toggleFullscreen = () => {
    const video = videoRef.current;
    if (!video) return;

    if (!document.fullscreenElement) {
      video.requestFullscreen();
      setIsFullscreen(true);
    } else {
      document.exitFullscreen();
      setIsFullscreen(false);
    }
  };

  const formatTime = (seconds: number) => {
    if (isNaN(seconds)) return "0:00";
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const handleDownload = () => {
    const link = document.createElement("a");
    link.href = src;
    link.download = src.split("/").pop() || "video.mp4";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Determine the aspect ratio to use
  const finalAspectRatio = aspectRatio === "auto" ? detectedAspectRatio : aspectRatio;

  // Get aspect ratio class
  const getAspectRatioClass = () => {
    switch (finalAspectRatio) {
      case "9:16":
        return "aspect-[9/16]"; // Vertical/Portrait
      case "1:1":
        return "aspect-square"; // Square
      case "16:9":
        return "aspect-video"; // Horizontal/Landscape
      default:
        return "aspect-video";
    }
  };

  return (
    <div ref={containerRef} className={`relative group ${className}`}>
      {/* Video Container with proper aspect ratio */}
      <div className={`w-full ${getAspectRatioClass()} bg-black rounded-lg overflow-hidden`}>
        {/* Video Element */}
        <video
          ref={videoRef}
          src={src}
          poster={poster}
          className="w-full h-full object-contain bg-black"
          autoPlay={autoPlay}
          onClick={togglePlay}
        />

      {/* Play/Pause Overlay */}
      {!isPlaying && (
        <div
          className="absolute inset-0 flex items-center justify-center bg-black/30 rounded-lg cursor-pointer"
          onClick={togglePlay}
        >
          <div className="w-20 h-20 rounded-full bg-gradient-purple flex items-center justify-center glow-purple-strong transition-transform hover:scale-110">
            <Play className="w-10 h-10 text-white ml-1" fill="currentColor" />
          </div>
        </div>
      )}

      {/* Custom Controls */}
      {controls && (
        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent px-3 pb-3 pt-6 opacity-0 group-hover:opacity-100 transition-opacity rounded-b-lg">
          {/* Progress Bar */}
          <div className="mb-2">
            <input
              type="range"
              min="0"
              max={duration || 0}
              value={currentTime}
              onChange={handleSeek}
              className="w-full h-1 bg-gray-600 rounded-lg appearance-none cursor-pointer slider-thumb-purple"
              style={{
                background: `linear-gradient(to right, #256af4 0%, #256af4 ${(currentTime / duration) * 100}%, #4B5563 ${(currentTime / duration) * 100}%, #4B5563 100%)`,
              }}
            />
          </div>

          {/* Controls Row — compact to fit narrow players */}
          <div className="flex items-center justify-between gap-1">
            {/* Left: Play + Mute + Time */}
            <div className="flex items-center gap-1 min-w-0">
              {/* Play/Pause */}
              <button
                onClick={togglePlay}
                className="w-7 h-7 rounded bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors flex-shrink-0"
              >
                {isPlaying ? (
                  <Pause className="w-3.5 h-3.5 text-white" fill="currentColor" />
                ) : (
                  <Play className="w-3.5 h-3.5 text-white ml-0.5" fill="currentColor" />
                )}
              </button>

              {/* Mute toggle (no slider — saves space) */}
              <button
                onClick={toggleMute}
                className="w-7 h-7 rounded bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors flex-shrink-0"
              >
                {isMuted || volume === 0 ? (
                  <VolumeX className="w-3.5 h-3.5 text-white" />
                ) : (
                  <Volume2 className="w-3.5 h-3.5 text-white" />
                )}
              </button>

              {/* Time */}
              <span className="text-xs text-white/80 font-mono truncate">
                {formatTime(currentTime)} / {formatTime(duration)}
              </span>
            </div>

            {/* Right: Download + Fullscreen */}
            <div className="flex items-center gap-1 flex-shrink-0">
              <button
                onClick={handleDownload}
                className="w-7 h-7 rounded bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors"
                title="Download"
              >
                <Download className="w-3.5 h-3.5 text-white" />
              </button>
              <button
                onClick={toggleFullscreen}
                className="w-7 h-7 rounded bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors"
                title="Fullscreen"
              >
                <Maximize className="w-3.5 h-3.5 text-white" />
              </button>
            </div>
          </div>
        </div>
      )}
      </div>
    </div>
  );
}
