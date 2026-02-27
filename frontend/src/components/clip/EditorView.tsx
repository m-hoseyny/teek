"use client";

import { useState } from "react";
import { Play, FileText, Palette, Download, Share2, Check } from "lucide-react";

const CAPTION_STYLES = [
  { id: "bold-yellow", name: "BOLD YELLOW", subtitle: "Alex Hormozi", active: true },
  { id: "outline-white", name: "OUTLINE WHITE", subtitle: "Classic" },
  { id: "minimalist", name: "MINIMALIST", subtitle: "Modern" },
  { id: "news-box", name: "NEWS BOX", subtitle: "Informative" },
];

const ASPECT_RATIOS = [
  { id: "9:16", name: "9:16", subtitle: "Stories" },
  { id: "1:1", name: "1:1", subtitle: "Feed" },
  { id: "16:9", name: "16:9", subtitle: "YouTube" },
];

const TRANSCRIPT_ITEMS = [
  { time: "00:12", text: "Hello world! Welcome to the future of automated video content creation." },
  { time: "00:15", text: "Today we are looking at how AI can transform your workflow." },
  { time: "00:19", text: "Notice the high-retention segments marked on your heatmap." },
  { time: "00:24", text: "Let's dive into the visual hook techniques used here." },
];

export function EditorView() {
  const [activeTab, setActiveTab] = useState<"insights" | "transcript">("insights");
  const [selectedAspectRatio, setSelectedAspectRatio] = useState("9:16");
  const [selectedCaptionStyle, setSelectedCaptionStyle] = useState("bold-yellow");
  const [exportHealth] = useState(75);

  return (
    <div className="max-w-7xl mx-auto">
      {/* Top Search Bar */}
      <div className="mb-6 flex items-center gap-4">
        <div className="flex-1 relative">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" fill="currentColor" viewBox="0 0 16 16">
            <path d="M11.742 10.344a6.5 6.5 0 1 0-1.397 1.398h-.001c.03.04.062.078.098.115l3.85 3.85a1 1 0 0 0 1.415-1.414l-3.85-3.85a1.007 1.007 0 0 0-.115-.1zM12 6.5a5.5 5.5 0 1 1-11 0 5.5 5.5 0 0 1 11 0z"/>
          </svg>
          <input
            type="text"
            placeholder="Paste video URL or search library..."
            className="w-full h-10 pl-10 pr-4 bg-input border border-border rounded-lg text-white placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-6">
        {/* Left & Center Column - Video Player */}
        <div className="col-span-2 space-y-6">
          {/* Video Player */}
          <div className="glass rounded-2xl p-6">
            <div className="aspect-video bg-black rounded-lg overflow-hidden mb-4 relative">
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="w-16 h-16 rounded-full bg-gradient-purple flex items-center justify-center glow-purple cursor-pointer hover:scale-110 transition-transform">
                  <Play className="w-8 h-8 text-white ml-1" fill="currentColor" />
                </div>
              </div>
              <div className="absolute bottom-0 left-0 right-0 p-4">
                <div className="h-1 bg-muted rounded-full overflow-hidden mb-2">
                  <div className="h-full bg-primary" style={{ width: "34%" }} />
                </div>
                <div className="flex items-center justify-between text-xs text-white">
                  <span>01:34</span>
                  <div className="flex items-center gap-2">
                    <button className="hover:text-primary transition-colors">
                      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 16 16">
                        <path d="M9 1a1 1 0 0 0-1-1H5.5a1 1 0 0 0-1 1H2a1 1 0 0 0-1 1v3a1 1 0 0 0 1 1h1v7.5A1.5 1.5 0 0 0 4.5 15h7a1.5 1.5 0 0 0 1.5-1.5V6h1a1 1 0 0 0 1-1V2a1 1 0 0 0-1-1h-2.5zM6 1h3v1H6V1z"/>
                      </svg>
                    </button>
                    <button className="hover:text-primary transition-colors">
                      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 16 16">
                        <path d="M8 15A7 7 0 1 1 8 1a7 7 0 0 1 0 14zm0 1A8 8 0 1 0 8 0a8 8 0 0 0 0 16z"/>
                      </svg>
                    </button>
                    <button className="hover:text-primary transition-colors">
                      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 16 16">
                        <path d="M1.5 1a.5.5 0 0 0-.5.5v13a.5.5 0 0 0 .5.5h13a.5.5 0 0 0 .5-.5v-13a.5.5 0 0 0-.5-.5h-13zM1 1.5A.5.5 0 0 1 1.5 1H6v6.086a.5.5 0 0 1-.146.353l-1 1a.5.5 0 0 1-.708 0l-1-1A.5.5 0 0 1 3 7.086V1H1.5a.5.5 0 0 1-.5-.5zM8 1h6.5a.5.5 0 0 1 .5.5v6.086a.5.5 0 0 1-.146.353l-1 1a.5.5 0 0 1-.708 0l-1-1A.5.5 0 0 1 12 7.086V1H8z"/>
                      </svg>
                    </button>
                  </div>
                  <span>04:50</span>
                </div>
              </div>
            </div>

            {/* Virality Heatmap */}
            <div className="glass rounded-xl p-4 border border-blue-500/30">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <svg className="w-5 h-5 text-primary" fill="currentColor" viewBox="0 0 16 16">
                    <path d="M4 11H2v3h2v-3zm5-4H7v7h2V7zm5-5v12h-2V2h2zm-2-1a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1h2a1 1 0 0 0 1-1V2a1 1 0 0 0-1-1h-2zM6 7a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v7a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V7zm-5 4a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1H2a1 1 0 0 1-1-1v-3z"/>
                  </svg>
                  <h3 className="font-semibold text-white">Virality Heatmap</h3>
                </div>
                <span className="text-sm font-semibold text-red-400">PEAK: 01:32</span>
              </div>

              {/* Gradient Heatmap */}
              <div className="h-12 rounded-lg overflow-hidden relative">
                <div className="absolute inset-0 flex">
                  <div className="virality-low" style={{ width: "20%" }}></div>
                  <div className="virality-medium" style={{ width: "25%" }}></div>
                  <div className="virality-high" style={{ width: "30%" }}></div>
                  <div className="virality-peak" style={{ width: "15%" }}></div>
                  <div className="virality-high" style={{ width: "10%" }}></div>
                </div>
                {/* Time markers */}
                <div className="absolute bottom-0 left-0 right-0 flex justify-between px-2 pb-1 text-xs text-white font-mono">
                  <span>00:00</span>
                  <span>01:00</span>
                  <span>02:00</span>
                  <span>03:00</span>
                  <span>04:00</span>
                </div>
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-4">
            <button className="flex-1 h-14 rounded-xl bg-gradient-purple hover:bg-gradient-purple-hover text-white font-semibold transition-all glow-purple flex items-center justify-center gap-2">
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 16 16">
                <path d="M8.5 2.687c.654-.689 1.782-.886 3.112-.752 1.234.124 2.503.523 3.388.893v9.923c-.918-.35-2.107-.692-3.287-.81-1.094-.111-2.278-.039-3.213.492V2.687zM8 1.783C7.015.936 5.587.81 4.287.94c-1.514.153-3.042.672-3.994 1.105A.5.5 0 0 0 0 2.5v11a.5.5 0 0 0 .707.455c.882-.4 2.303-.881 3.68-1.02 1.409-.142 2.59.087 3.223.877a.5.5 0 0 0 .78 0c.633-.79 1.814-1.019 3.222-.877 1.378.139 2.8.62 3.681 1.02A.5.5 0 0 0 16 13.5v-11a.5.5 0 0 0-.293-.455c-.952-.433-2.48-.952-3.994-1.105C10.413.809 8.985.936 8 1.783z"/>
              </svg>
              Export Viral Clip
            </button>
            <button className="px-8 h-14 rounded-xl border-2 border-border hover:border-primary text-white font-semibold transition-all flex items-center gap-2">
              <Share2 className="w-5 h-5" />
              Share to Socials
            </button>
          </div>
        </div>

        {/* Right Column - Tabs */}
        <div className="space-y-6">
          {/* Tab Navigation */}
          <div className="glass rounded-xl p-1 flex gap-1">
            <button
              onClick={() => setActiveTab("insights")}
              className={`flex-1 py-2 px-4 rounded-lg text-sm font-medium transition-all ${
                activeTab === "insights"
                  ? "bg-primary text-white"
                  : "text-gray-400 hover:text-white"
              }`}
            >
              AI Insights
            </button>
            <button
              onClick={() => setActiveTab("transcript")}
              className={`flex-1 py-2 px-4 rounded-lg text-sm font-medium transition-all ${
                activeTab === "transcript"
                  ? "bg-primary text-white"
                  : "text-gray-400 hover:text-white"
              }`}
            >
              Transcript
            </button>
          </div>

          {/* Tab Content */}
          {activeTab === "transcript" && (
            <div className="glass rounded-xl p-4">
              <div className="flex items-center gap-2 mb-4">
                <FileText className="w-5 h-5 text-primary" />
                <h3 className="font-semibold text-white">TRANSCRIPT</h3>
              </div>
              <div className="space-y-3 max-h-96 overflow-y-auto">
                {TRANSCRIPT_ITEMS.map((item, index) => (
                  <button
                    key={index}
                    className="w-full text-left p-3 rounded-lg hover:bg-card transition-colors group"
                  >
                    <div className="text-xs font-mono text-primary mb-1">{item.time}</div>
                    <p className="text-sm text-gray-300 group-hover:text-white transition-colors">
                      {item.text}
                    </p>
                  </button>
                ))}
              </div>
            </div>
          )}

          {activeTab === "insights" && (
            <>
              {/* Caption Styles */}
              <div className="glass rounded-xl p-4">
                <div className="flex items-center gap-2 mb-4">
                  <Palette className="w-5 h-5 text-secondary" />
                  <h3 className="font-semibold text-white">CAPTION STYLES</h3>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {CAPTION_STYLES.map((style) => (
                    <button
                      key={style.id}
                      onClick={() => setSelectedCaptionStyle(style.id)}
                      className={`p-3 rounded-lg border-2 transition-all text-left ${
                        selectedCaptionStyle === style.id
                          ? "border-primary bg-primary/10"
                          : "border-border hover:border-primary/50"
                      }`}
                    >
                      <div className={`text-sm font-bold mb-0.5 ${
                        style.active ? "text-yellow-400" : "text-white"
                      }`}>
                        {style.name}
                      </div>
                      <div className="text-xs text-muted-foreground">{style.subtitle}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Aspect Ratio */}
              <div className="glass rounded-xl p-4">
                <h3 className="font-semibold text-white mb-4 text-sm">ASPECT RATIO</h3>
                <div className="grid grid-cols-3 gap-2">
                  {ASPECT_RATIOS.map((ratio) => (
                    <button
                      key={ratio.id}
                      onClick={() => setSelectedAspectRatio(ratio.id)}
                      className={`p-3 rounded-lg border-2 transition-all ${
                        selectedAspectRatio === ratio.id
                          ? "border-primary bg-primary/10"
                          : "border-border hover:border-primary/50"
                      }`}
                    >
                      <div className="text-sm font-bold text-white mb-0.5">{ratio.name}</div>
                      <div className="text-xs text-muted-foreground">{ratio.subtitle}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Apply Button */}
              <button className="w-full h-12 rounded-xl bg-gradient-purple hover:bg-gradient-purple-hover text-white font-semibold transition-all glow-purple flex items-center justify-center gap-2">
                <Check className="w-5 h-5" />
                Apply to Clip
              </button>

              {/* Export Health */}
              <div className="glass rounded-xl p-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-semibold text-white text-sm">EXPORT HEALTH</h3>
                  <span className="text-lg font-bold text-primary">{exportHealth}%</span>
                </div>
                <div className="h-2 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-purple transition-all"
                    style={{ width: `${exportHealth}%` }}
                  />
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
