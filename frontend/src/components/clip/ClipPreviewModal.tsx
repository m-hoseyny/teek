"use client";

import { useState, useEffect, useRef } from "react";
import { useJwt } from "@/contexts/jwt-context";
import { X, Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { VideoPlayerWithSubtitles, type VideoPlayerWithSubtitlesRef } from "./VideoPlayerWithSubtitles";

interface Word {
  text: string;
  start: number;
  end: number;
}

interface ClipPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  clipId: string;
  taskId: string;
  sourceVideoUrl: string;
  startTime: string;
  endTime: string;
  text: string;
}

interface PycapsTemplate {
  name: string;
  display_name: string;
  description: string;
  is_default: boolean;
}

export function ClipPreviewModal({
  isOpen,
  onClose,
  clipId,
  taskId,
  sourceVideoUrl,
  startTime,
  endTime,
  text,
}: ClipPreviewModalProps) {
  const { apiFetch } = useJwt();
  const [words, setWords] = useState<Word[]>([]);
  const [templates, setTemplates] = useState<PycapsTemplate[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<string>("word-focus");
  const [showSubtitles, setShowSubtitles] = useState(true);
  const [isLoadingWords, setIsLoadingWords] = useState(false);
  const [isLoadingTemplates, setIsLoadingTemplates] = useState(false);
  const playerRef = useRef<VideoPlayerWithSubtitlesRef | null>(null);

  const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

  // Load word-level timing data for the clip
  useEffect(() => {
    if (!isOpen || !clipId || !taskId) return;

    const loadClipWords = async () => {
      try {
        setIsLoadingWords(true);
        const response = await apiFetch(`${apiUrl}/tasks/${taskId}/clips/${clipId}/words`);

        if (!response.ok) {
          console.error(`Failed to load clip words: ${response.status}`);
          return;
        }

        const data = await response.json();
        setWords(data.words || []);
        setSelectedTemplate(data.pycaps_template || "word-focus");
      } catch (error) {
        console.error("Error loading clip words:", error);
      } finally {
        setIsLoadingWords(false);
      }
    };

    loadClipWords();
  }, [isOpen, clipId, taskId, apiUrl, apiFetch]);

  // Load available pycaps templates
  useEffect(() => {
    if (!isOpen) return;

    const loadTemplates = async () => {
      try {
        setIsLoadingTemplates(true);
        const response = await fetch(`${apiUrl}/pycaps-templates`);

        if (!response.ok) {
          console.error(`Failed to load templates: ${response.status}`);
          return;
        }

        const data = await response.json();
        setTemplates(data.templates || []);
      } catch (error) {
        console.error("Error loading pycaps templates:", error);
      } finally {
        setIsLoadingTemplates(false);
      }
    };

    loadTemplates();
  }, [isOpen, apiUrl]);

  // Update player template when selection changes
  useEffect(() => {
    if (playerRef.current) {
      playerRef.current.setTemplate(selectedTemplate);
    }
  }, [selectedTemplate]);

  const toggleSubtitles = () => {
    const newState = !showSubtitles;
    setShowSubtitles(newState);
    if (playerRef.current) {
      playerRef.current.setShowSubtitles(newState);
    }
  };

  const timeToSeconds = (timeStr: string): number => {
    const parts = timeStr.split(':').map(Number);
    if (parts.length === 2) {
      return parts[0] * 60 + parts[1];
    }
    if (parts.length === 3) {
      return parts[0] * 3600 + parts[1] * 60 + parts[2];
    }
    return parseInt(timeStr) || 0;
  };

  // Auto-seek to clip start when modal opens.
  // Poll until the video has loaded (getDuration > 0) before seeking,
  // because 100ms is rarely enough for a large source video to be seekable.
  useEffect(() => {
    if (!isOpen || !startTime) return;
    const startSeconds = timeToSeconds(startTime);
    let attempts = 0;
    let timerId: ReturnType<typeof setTimeout>;
    const trySeek = () => {
      const duration = playerRef.current?.getDuration() ?? 0;
      if (duration > 0) {
        playerRef.current?.seekTo(startSeconds);
      } else if (attempts < 30) {
        attempts++;
        timerId = setTimeout(trySeek, 200);
      }
    };
    timerId = setTimeout(trySeek, 200);
    return () => clearTimeout(timerId);
  }, [isOpen, startTime]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
      <Card className="max-w-5xl w-full max-h-[90vh] overflow-hidden">
        <CardContent className="p-0">
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b bg-gray-50">
            <div>
              <h2 className="text-lg font-semibold text-black">Subtitle Preview</h2>
              <p className="text-sm text-gray-600">
                Preview how subtitles will look with different templates
              </p>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={onClose}
              className="rounded-full"
            >
              <X className="w-5 h-5" />
            </Button>
          </div>

          {/* Content */}
          <div className="p-6 overflow-y-auto max-h-[calc(90vh-140px)]">
            <div className="grid grid-cols-3 gap-6">
              {/* Left: Video Player */}
              <div className="col-span-2">
                <div className="bg-black rounded-lg overflow-hidden relative">
                  <VideoPlayerWithSubtitles
                    ref={playerRef}
                    src={sourceVideoUrl}
                    words={words}
                    template={selectedTemplate}
                    showSubtitles={showSubtitles}
                    clipStartSeconds={timeToSeconds(startTime)}
                    className="w-full"
                  />
                </div>

                {/* Clip Info */}
                <div className="mt-4 p-4 bg-gray-50 rounded-lg">
                  <div className="flex items-center gap-2 text-sm text-gray-600 mb-2">
                    <span className="font-mono bg-white px-2 py-1 rounded">
                      {startTime} - {endTime}
                    </span>
                  </div>
                  <p className="text-sm text-gray-700">{text}</p>
                </div>
              </div>

              {/* Right: Template Selector */}
              <div className="space-y-4">
                {/* Subtitle Toggle */}
                <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <span className="text-sm font-medium text-gray-700">Show Subtitles</span>
                  <Button
                    variant={showSubtitles ? "default" : "outline"}
                    size="sm"
                    onClick={toggleSubtitles}
                  >
                    {showSubtitles ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                  </Button>
                </div>

                {/* Template Selection */}
                <div>
                  <h3 className="text-sm font-semibold text-gray-700 mb-3">
                    Subtitle Template
                  </h3>

                  {isLoadingTemplates ? (
                    <div className="space-y-2">
                      {[1, 2, 3].map((i) => (
                        <div key={i} className="h-16 bg-gray-100 rounded-lg animate-pulse" />
                      ))}
                    </div>
                  ) : (
                    <div className="space-y-2 max-h-[400px] overflow-y-auto">
                      {templates.map((template) => (
                        <button
                          key={template.name}
                          onClick={() => setSelectedTemplate(template.name)}
                          className={`w-full text-left p-3 rounded-lg border-2 transition-all ${
                            selectedTemplate === template.name
                              ? "border-blue-500 bg-blue-50"
                              : "border-gray-200 bg-white hover:border-gray-300"
                          }`}
                        >
                          <div className="flex items-center justify-between mb-1">
                            <span className="font-medium text-sm text-gray-900">
                              {template.display_name}
                            </span>
                            {template.is_default && (
                              <Badge variant="outline" className="text-xs">
                                Default
                              </Badge>
                            )}
                          </div>
                          <p className="text-xs text-gray-600">{template.description}</p>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Loading State */}
                {isLoadingWords && (
                  <div className="text-center py-4">
                    <div className="inline-block w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                    <p className="text-sm text-gray-600 mt-2">Loading word timing data...</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
