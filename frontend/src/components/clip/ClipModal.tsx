"use client";

import { X, Download, Share2, Edit, Trash2, Clock, Video } from "lucide-react";
import { VideoPlayer } from "./VideoPlayer";

interface ClipData {
  id: string;
  title: string;
  duration: string;
  virality: number;
  quality: string;
  videoUrl: string;
  thumbnail?: string;
  description: string;
  createdAt: string;
  aspectRatio: string;
  captionStyle: string;
}

interface ClipModalProps {
  clip: ClipData | null;
  isOpen: boolean;
  onClose: () => void;
}

export function ClipModal({ clip, isOpen, onClose }: ClipModalProps) {
  if (!isOpen || !clip) return null;

  const handleShare = () => {
    // TODO: Implement share functionality
    console.log("Share clip:", clip.id);
  };

  const handleEdit = () => {
    // TODO: Navigate to editor
    console.log("Edit clip:", clip.id);
  };

  const handleDelete = () => {
    // TODO: Implement delete with confirmation
    console.log("Delete clip:", clip.id);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
      <div className="glass rounded-2xl border border-border max-w-6xl w-full max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-border">
          <div>
            <h2 className="text-2xl font-bold text-white mb-1">{clip.title}</h2>
            <div className="flex items-center gap-4 text-sm text-muted-foreground">
              <span className="flex items-center gap-1">
                <Clock className="w-4 h-4" />
                {clip.duration}
              </span>
              <span>•</span>
              <span className="flex items-center gap-1">
                <Video className="w-4 h-4" />
                {clip.aspectRatio}
              </span>
              <span>•</span>
              <span>{clip.quality}</span>
              <span>•</span>
              <span className="text-primary font-semibold">{clip.virality}% Virality</span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-10 h-10 rounded-lg bg-card hover:bg-muted flex items-center justify-center transition-colors"
          >
            <X className="w-6 h-6 text-gray-400" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto max-h-[calc(90vh-180px)]">
          <div className="grid grid-cols-3 gap-6">
            {/* Left - Video Player */}
            <div className="col-span-2">
              <div className="rounded-xl overflow-hidden bg-black flex items-center justify-center">
                <div className={clip.aspectRatio === "9:16" ? "w-[280px]" : "w-full"}>
                  <VideoPlayer
                    src={clip.videoUrl}
                    poster={clip.thumbnail}
                    aspectRatio={clip.aspectRatio as "9:16" | "1:1" | "16:9" | "auto"}
                  />
                </div>
              </div>

              {/* Description */}
              <div className="mt-6">
                <h3 className="text-sm font-semibold text-white mb-2 uppercase tracking-wide">Description</h3>
                <p className="text-gray-300 leading-relaxed">{clip.description}</p>
              </div>

              {/* Metadata */}
              <div className="mt-6 grid grid-cols-2 gap-4">
                <div className="glass rounded-lg p-4 border border-border">
                  <div className="text-xs text-muted-foreground mb-1">Created</div>
                  <div className="text-sm font-medium text-white">{clip.createdAt}</div>
                </div>
                <div className="glass rounded-lg p-4 border border-border">
                  <div className="text-xs text-muted-foreground mb-1">Caption Style</div>
                  <div className="text-sm font-medium text-white">{clip.captionStyle}</div>
                </div>
              </div>
            </div>

            {/* Right - Actions & Info */}
            <div className="space-y-4">
              {/* Virality Score */}
              <div className="glass rounded-xl p-6 border border-primary/30 glow-purple">
                <div className="text-center">
                  <div className="text-5xl font-bold text-transparent bg-clip-text bg-gradient-purple mb-2">
                    {clip.virality}%
                  </div>
                  <div className="text-sm text-muted-foreground">Virality Score</div>
                  <div className="mt-4 h-2 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-purple transition-all"
                      style={{ width: `${clip.virality}%` }}
                    />
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="space-y-2">
                <button className="w-full h-12 rounded-lg bg-gradient-purple hover:bg-gradient-purple-hover text-white font-semibold transition-all glow-purple flex items-center justify-center gap-2">
                  <Download className="w-5 h-5" />
                  Download Clip
                </button>

                <button
                  onClick={handleShare}
                  className="w-full h-12 rounded-lg border-2 border-border hover:border-primary text-white font-semibold transition-all flex items-center justify-center gap-2"
                >
                  <Share2 className="w-5 h-5" />
                  Share to Socials
                </button>

                <button
                  onClick={handleEdit}
                  className="w-full h-12 rounded-lg border-2 border-border hover:border-primary text-white font-semibold transition-all flex items-center justify-center gap-2"
                >
                  <Edit className="w-5 h-5" />
                  Edit in Studio
                </button>

                <button
                  onClick={handleDelete}
                  className="w-full h-12 rounded-lg border-2 border-destructive/30 hover:border-destructive hover:bg-destructive/10 text-red-400 font-semibold transition-all flex items-center justify-center gap-2"
                >
                  <Trash2 className="w-5 h-5" />
                  Delete Clip
                </button>
              </div>

              {/* Performance Stats */}
              <div className="glass rounded-xl p-4 border border-border">
                <h4 className="text-sm font-semibold text-white mb-3 uppercase tracking-wide">
                  AI Analysis
                </h4>
                <div className="space-y-3">
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs text-muted-foreground">Hook Strength</span>
                      <span className="text-xs font-semibold text-green-400">92%</span>
                    </div>
                    <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                      <div className="h-full bg-green-400" style={{ width: "92%" }} />
                    </div>
                  </div>
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs text-muted-foreground">Retention</span>
                      <span className="text-xs font-semibold text-yellow-400">87%</span>
                    </div>
                    <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                      <div className="h-full bg-yellow-400" style={{ width: "87%" }} />
                    </div>
                  </div>
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs text-muted-foreground">Engagement</span>
                      <span className="text-xs font-semibold text-primary">94%</span>
                    </div>
                    <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                      <div className="h-full bg-primary" style={{ width: "94%" }} />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
