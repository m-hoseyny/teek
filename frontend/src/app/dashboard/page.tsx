"use client";

import { useState, useEffect } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Zap, TrendingUp, Clock, Video } from "lucide-react";
import Link from "next/link";
import { useSession } from "@/lib/auth-client";

interface RecentTask {
  id: string;
  title: string;
  status: string;
  clips_count: number;
  avg_virality: number;
  created_at: string | null;
}

interface DashboardStats {
  total_tasks: number;
  total_clips: number;
  avg_virality_score: number;
  recent_tasks: RecentTask[];
}

function timeAgo(isoDate: string | null): string {
  if (!isoDate) return "Unknown";
  const diff = Date.now() - new Date(isoDate).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export default function DashboardPage() {
  const { data: session } = useSession();
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchDashboard = async () => {
      if (!session?.user?.id) return;

      try {
        setIsLoading(true);
        const response = await fetch(`${apiUrl}/tasks/dashboard`, {
          headers: { user_id: session.user.id },
        });

        if (!response.ok) throw new Error("Failed to fetch dashboard stats");

        const data: DashboardStats = await response.json();
        setStats(data);
      } catch (error) {
        console.error("Failed to fetch dashboard stats:", error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchDashboard();
  }, [session?.user?.id, apiUrl]);

  const statCards = stats
    ? [
        {
          label: "Total Analyses",
          value: String(stats.total_tasks),
          icon: Video,
          color: "text-blue-400",
          bgColor: "bg-blue-400/20",
        },
        {
          label: "Viral Clips",
          value: String(stats.total_clips),
          icon: Zap,
          color: "text-yellow-400",
          bgColor: "bg-yellow-400/20",
        },
        {
          label: "Avg Virality",
          value: `${Math.round(stats.avg_virality_score)}%`,
          icon: TrendingUp,
          color: "text-green-400",
          bgColor: "bg-green-400/20",
        },
        {
          label: "Time Saved",
          value: `${Math.round((stats.total_clips * 5) / 60)}h`,
          icon: Clock,
          color: "text-blue-400",
          bgColor: "bg-blue-400/20",
        },
      ]
    : [];

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
          {isLoading
            ? Array.from({ length: 4 }).map((_, i) => (
                <div
                  key={i}
                  className="glass rounded-xl p-6 border border-border animate-pulse"
                >
                  <div className="w-12 h-12 rounded-lg bg-muted mb-4" />
                  <div className="h-8 bg-muted rounded w-16 mb-2" />
                  <div className="h-4 bg-muted rounded w-24" />
                </div>
              ))
            : statCards.map((stat, index) => (
                <div
                  key={index}
                  className="glass rounded-xl p-6 border border-border hover:border-primary transition-all"
                >
                  <div className="flex items-start justify-between mb-4">
                    <div
                      className={`w-12 h-12 rounded-lg ${stat.bgColor} flex items-center justify-center`}
                    >
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

          {isLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="p-4 rounded-lg border border-border animate-pulse">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-lg bg-muted flex-shrink-0" />
                    <div className="flex-1">
                      <div className="h-4 bg-muted rounded w-48 mb-2" />
                      <div className="h-3 bg-muted rounded w-32" />
                    </div>
                    <div className="h-6 bg-muted rounded-full w-20" />
                  </div>
                </div>
              ))}
            </div>
          ) : !stats || stats.recent_tasks.length === 0 ? (
            <div className="text-center py-10 text-muted-foreground">
              <Video className="w-10 h-10 mx-auto mb-3 opacity-40" />
              <p>No analyses yet. Start by uploading a video!</p>
            </div>
          ) : (
            <div className="space-y-3">
              {stats.recent_tasks.map((task) => (
                <Link key={task.id} href={`/studio/${task.id}`}>
                  <div className="p-4 rounded-lg hover:bg-card transition-colors border border-border hover:border-primary cursor-pointer group">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4 flex-1">
                        <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-blue-900/50 to-blue-900/50 flex items-center justify-center flex-shrink-0">
                          <Video className="w-6 h-6 text-primary" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <h3 className="font-semibold text-white mb-1 group-hover:text-primary transition-colors truncate">
                            {task.title}
                          </h3>
                          <div className="flex items-center gap-4 text-sm text-muted-foreground flex-wrap">
                            <span>{timeAgo(task.created_at)}</span>
                            {task.status === "completed" && (
                              <>
                                <span>•</span>
                                <span>{task.clips_count} clips</span>
                                {task.avg_virality > 0 && (
                                  <>
                                    <span>•</span>
                                    <span className="text-primary font-semibold">
                                      {Math.round(task.avg_virality)}% virality
                                    </span>
                                  </>
                                )}
                              </>
                            )}
                            {task.status === "processing" || task.status === "queued" ? (
                              <>
                                <span>•</span>
                                <span className="text-yellow-400 font-semibold flex items-center gap-2">
                                  <span className="w-2 h-2 bg-yellow-400 rounded-full pulse-glow"></span>
                                  Processing
                                </span>
                              </>
                            ) : null}
                            {task.status === "error" && (
                              <>
                                <span>•</span>
                                <span className="text-red-400 font-semibold">Failed</span>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="ml-4 flex-shrink-0">
                        {task.status === "completed" && (
                          <span className="px-3 py-1 rounded-full bg-green-400/20 text-green-400 text-xs font-semibold">
                            Completed
                          </span>
                        )}
                        {(task.status === "processing" || task.status === "queued") && (
                          <span className="px-3 py-1 rounded-full bg-yellow-400/20 text-yellow-400 text-xs font-semibold">
                            Processing
                          </span>
                        )}
                        {task.status === "error" && (
                          <span className="px-3 py-1 rounded-full bg-red-400/20 text-red-400 text-xs font-semibold">
                            Failed
                          </span>
                        )}
                        {task.status === "awaiting_review" && (
                          <span className="px-3 py-1 rounded-full bg-blue-400/20 text-blue-400 text-xs font-semibold">
                            Review
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
