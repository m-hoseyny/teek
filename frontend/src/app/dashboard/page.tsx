"use client";

import { AppLayout } from "@/components/layout/AppLayout";
import { Zap, TrendingUp, Clock, Video } from "lucide-react";
import Link from "next/link";

const RECENT_ANALYSES = [
  {
    id: "1",
    title: "Podcast_Highlight_04.mp4",
    status: "completed",
    clips: 5,
    virality: 88,
    date: "2 hours ago",
  },
  {
    id: "2",
    title: "Marketing_Webinar_2024.mp4",
    status: "processing",
    clips: 0,
    virality: 0,
    date: "Processing...",
  },
  {
    id: "3",
    title: "Product_Demo_Final.mp4",
    status: "completed",
    clips: 7,
    virality: 92,
    date: "1 day ago",
  },
];

const STATS = [
  { label: "Total Analyses", value: "47", icon: Video, color: "text-blue-400", bgColor: "bg-blue-400/20" },
  { label: "Viral Clips", value: "234", icon: Zap, color: "text-yellow-400", bgColor: "bg-yellow-400/20" },
  { label: "Avg Virality", value: "87%", icon: TrendingUp, color: "text-green-400", bgColor: "bg-green-400/20" },
  { label: "Time Saved", value: "42h", icon: Clock, color: "text-blue-400", bgColor: "bg-blue-400/20" },
];

export default function DashboardPage() {
  return (
    <AppLayout>
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-white mb-2">Dashboard</h1>
          <p className="text-gray-400">Overview of your viral content creation</p>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          {STATS.map((stat, index) => (
            <div key={index} className="glass rounded-xl p-6 border border-border hover:border-primary transition-all">
              <div className="flex items-start justify-between mb-4">
                <div className={`w-12 h-12 rounded-lg ${stat.bgColor} flex items-center justify-center`}>
                  <stat.icon className={`w-6 h-6 ${stat.color}`} />
                </div>
              </div>
              <div className="text-3xl font-bold text-white mb-1">{stat.value}</div>
              <div className="text-sm text-muted-foreground">{stat.label}</div>
            </div>
          ))}
        </div>

        {/* Quick Actions */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
          <Link href="/analysis">
            <div className="glass rounded-xl p-8 border-2 border-border hover:border-primary transition-all group cursor-pointer">
              <div className="flex items-start gap-4">
                <div className="w-14 h-14 rounded-xl bg-gradient-purple flex items-center justify-center glow-purple group-hover:glow-purple-strong transition-all">
                  <Zap className="w-7 h-7 text-white" />
                </div>
                <div className="flex-1">
                  <h3 className="text-xl font-semibold text-white mb-2 group-hover:text-primary transition-colors">
                    New Analysis
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    Upload a video or paste a URL to start creating viral clips
                  </p>
                </div>
              </div>
            </div>
          </Link>

          <Link href="/library">
            <div className="glass rounded-xl p-8 border-2 border-border hover:border-primary transition-all group cursor-pointer">
              <div className="flex items-start gap-4">
                <div className="w-14 h-14 rounded-xl bg-secondary/20 flex items-center justify-center group-hover:bg-secondary/30 transition-all">
                  <Video className="w-7 h-7 text-secondary" />
                </div>
                <div className="flex-1">
                  <h3 className="text-xl font-semibold text-white mb-2 group-hover:text-primary transition-colors">
                    Browse Library
                  </h3>
                  <p className="text-sm text-muted-foreground">View all your generated clips and viral content</p>
                </div>
              </div>
            </div>
          </Link>
        </div>

        {/* Recent Analyses */}
        <div className="glass rounded-xl p-6 border border-border">
          <h2 className="text-xl font-semibold text-white mb-6">Recent Analyses</h2>
          <div className="space-y-3">
            {RECENT_ANALYSES.map((analysis) => (
              <Link key={analysis.id} href={`/tasks/${analysis.id}`}>
                <div className="p-4 rounded-lg hover:bg-card transition-colors border border-border hover:border-primary cursor-pointer group">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4 flex-1">
                      <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-blue-900/50 to-blue-900/50 flex items-center justify-center">
                        <Video className="w-6 h-6 text-primary" />
                      </div>
                      <div className="flex-1">
                        <h3 className="font-semibold text-white mb-1 group-hover:text-primary transition-colors">
                          {analysis.title}
                        </h3>
                        <div className="flex items-center gap-4 text-sm text-muted-foreground">
                          <span>{analysis.date}</span>
                          {analysis.status === "completed" && (
                            <>
                              <span>•</span>
                              <span>{analysis.clips} clips</span>
                              <span>•</span>
                              <span className="text-primary font-semibold">{analysis.virality}% virality</span>
                            </>
                          )}
                          {analysis.status === "processing" && (
                            <>
                              <span>•</span>
                              <span className="text-yellow-400 font-semibold flex items-center gap-2">
                                <span className="w-2 h-2 bg-yellow-400 rounded-full pulse-glow"></span>
                                Processing
                              </span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                    <div>
                      {analysis.status === "completed" ? (
                        <span className="px-3 py-1 rounded-full bg-green-400/20 text-green-400 text-xs font-semibold">
                          Completed
                        </span>
                      ) : (
                        <span className="px-3 py-1 rounded-full bg-yellow-400/20 text-yellow-400 text-xs font-semibold">
                          Processing
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
