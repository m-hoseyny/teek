"use client";

import { AppLayout } from "@/components/layout/AppLayout";
import { Sparkles, TrendingUp, Video, MessageSquare, Zap, Star } from "lucide-react";

const PRESETS = [
  {
    id: "viral-hooks",
    name: "Viral Hooks",
    description: "Identify attention-grabbing openings and pattern interrupts that stop the scroll",
    icon: Zap,
    color: "text-yellow-400",
    bgColor: "bg-yellow-400/20",
    clips: 127,
    avgVirality: 92,
  },
  {
    id: "trending-moments",
    name: "Trending Moments",
    description: "Extract high-energy segments with potential for trending sounds and memes",
    icon: TrendingUp,
    color: "text-green-400",
    bgColor: "bg-green-400/20",
    clips: 89,
    avgVirality: 88,
  },
  {
    id: "educational-clips",
    name: "Educational Clips",
    description: "Find valuable tips, insights, and how-to segments perfect for educational content",
    icon: Video,
    color: "text-blue-400",
    bgColor: "bg-blue-400/20",
    clips: 156,
    avgVirality: 85,
  },
  {
    id: "quotable-moments",
    name: "Quotable Moments",
    description: "Detect powerful statements and memorable quotes ideal for text overlays",
    icon: MessageSquare,
    color: "text-purple-400",
    bgColor: "bg-purple-400/20",
    clips: 203,
    avgVirality: 87,
  },
  {
    id: "emotional-peaks",
    name: "Emotional Peaks",
    description: "Capture moments of excitement, humor, or inspiration that drive engagement",
    icon: Star,
    color: "text-pink-400",
    bgColor: "bg-pink-400/20",
    clips: 142,
    avgVirality: 90,
  },
  {
    id: "custom-prompt",
    name: "Custom Prompt",
    description: "Create your own AI analysis prompt tailored to your specific content needs",
    icon: Sparkles,
    color: "text-indigo-400",
    bgColor: "bg-indigo-400/20",
    clips: 0,
    avgVirality: 0,
    custom: true,
  },
];

export default function PresetsPage() {
  return (
    <AppLayout>
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-white mb-2">AI Presets</h1>
          <p className="text-gray-400">
            Pre-configured AI analysis modes optimized for different content types and goals
          </p>
        </div>

        {/* Presets Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {PRESETS.map((preset) => (
            <div
              key={preset.id}
              className="glass rounded-2xl p-6 border border-border hover:border-primary transition-all group cursor-pointer"
            >
              <div className="flex items-start gap-4">
                {/* Icon */}
                <div className={`w-14 h-14 rounded-xl ${preset.bgColor} flex items-center justify-center flex-shrink-0`}>
                  <preset.icon className={`w-7 h-7 ${preset.color}`} />
                </div>

                {/* Content */}
                <div className="flex-1">
                  <h3 className="text-xl font-semibold text-white mb-2 group-hover:text-primary transition-colors">
                    {preset.name}
                  </h3>
                  <p className="text-sm text-muted-foreground mb-4">{preset.description}</p>

                  {/* Stats */}
                  {!preset.custom ? (
                    <div className="flex items-center gap-6 text-sm">
                      <div>
                        <span className="text-muted-foreground">Clips: </span>
                        <span className="text-white font-semibold">{preset.clips}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Avg Virality: </span>
                        <span className={`font-semibold ${preset.color}`}>{preset.avgVirality}%</span>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <button className="px-4 py-2 rounded-lg bg-gradient-purple hover:bg-gradient-purple-hover text-white text-sm font-medium transition-all">
                        Create Preset
                      </button>
                    </div>
                  )}
                </div>

                {/* Select Button */}
                <div className="flex-shrink-0">
                  <button className="px-4 py-2 rounded-lg border-2 border-border hover:border-primary hover:bg-primary/10 text-white text-sm font-medium transition-all">
                    Select
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Info Card */}
        <div className="mt-8 glass rounded-xl p-6 border-l-4 border-primary">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-lg bg-primary/20 flex items-center justify-center flex-shrink-0">
              <Sparkles className="w-6 h-6 text-primary" />
            </div>
            <div>
              <h3 className="font-semibold text-white mb-2">How AI Presets Work</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Each preset uses a specialized AI prompt engineered to identify specific types of content in your
                videos. Select a preset before starting your analysis to get clips optimized for your content goals.
                The AI will analyze your video's transcript, sentiment, pacing, and visual elements to find the best
                moments matching your chosen preset.
              </p>
            </div>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
