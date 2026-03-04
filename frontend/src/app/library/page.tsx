"use client";

import { useState, useEffect } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import Link from "next/link";
import { Play, Download, Share2, ChevronDown, ChevronRight, Search, Clapperboard } from "lucide-react";
import { ClipModal } from "@/components/clip/ClipModal";
import { useSession } from "@/lib/auth-client";

interface Clip {
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
  filename: string;
}

interface Project {
  id: string;
  title: string;
  sourceTitle: string;
  createdAt: string;
  status: "completed" | "processing" | "failed";
  clipsCount: number;
  avgVirality: number;
  clips: Clip[];
}

export default function LibraryPage() {
  const { data: session } = useSession();
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

  const [projects, setProjects] = useState<Project[]>([]);
  const [expandedProjects, setExpandedProjects] = useState<Set<string>>(new Set());
  const [loadingClips, setLoadingClips] = useState<Set<string>>(new Set());
  const [selectedClip, setSelectedClip] = useState<Clip | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState<"all" | "completed" | "processing">("all");
  const [searchQuery, setSearchQuery] = useState("");

  // Fetch projects (tasks) from API - WITHOUT clips initially
  useEffect(() => {
    const fetchProjects = async () => {
      if (!session?.user?.id) return;

      try {
        setIsLoading(true);
        const response = await fetch(`${apiUrl}/tasks/`, {
          headers: { user_id: session.user.id },
        });

        if (!response.ok) {
          throw new Error("Failed to fetch tasks");
        }

        const data = await response.json();
        console.log("Tasks API response:", data);

        // Handle both array and object responses
        const tasks = Array.isArray(data) ? data : (data.tasks || []);

        console.log("Processed tasks:", tasks);

        // If no tasks, set empty array and return
        if (!Array.isArray(tasks) || tasks.length === 0) {
          console.log("No tasks found, showing empty state");
          setProjects([]);
          setIsLoading(false);
          return;
        }

        // Transform tasks into projects WITHOUT fetching clips yet
        const projectsData: Project[] = tasks.map((task: any) => ({
          id: task.id,
          title: task.source?.title || task.source?.url?.split("/").pop() || `Project ${task.id.slice(0, 8)}`,
          sourceTitle: task.source?.title || task.source?.url || "Unknown Source",
          createdAt: new Date(task.created_at).toLocaleDateString(),
          status: task.status === "completed" ? "completed" : task.status === "processing" ? "processing" : "failed",
          clipsCount: 0, // Will be updated when clips are fetched
          avgVirality: 0, // Will be updated when clips are fetched
          clips: [], // Empty initially, will be fetched on expand
        }));

        setProjects(projectsData);
      } catch (error) {
        console.error("Failed to fetch projects:", error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchProjects();
  }, [session?.user?.id, apiUrl]);

  // Fetch clips for a specific project
  const fetchClipsForProject = async (projectId: string) => {
    if (!session?.user?.id || loadingClips.has(projectId)) return;

    // Check if clips are already loaded
    const project = projects.find(p => p.id === projectId);
    if (project && project.clips.length > 0) return;

    try {
      setLoadingClips(prev => new Set(prev).add(projectId));
      console.log(`Fetching clips for project ${projectId}`);

      const clipsResponse = await fetch(`${apiUrl}/tasks/${projectId}/clips`, {
        headers: { user_id: session.user.id },
      });

      if (clipsResponse.ok) {
        const clipsResponseData = await clipsResponse.json();
        console.log(`Clips response for ${projectId}:`, clipsResponseData);

        // Handle both array and object responses
        const clipsArray = Array.isArray(clipsResponseData)
          ? clipsResponseData
          : (clipsResponseData.clips || []);

        if (Array.isArray(clipsArray)) {
          const clips: Clip[] = clipsArray.map((clip: any) => ({
            id: clip.id || clip.filename,
            title: clip.title || clip.filename?.replace(/\.[^/.]+$/, "") || "Untitled Clip",
            duration: formatDuration(clip.duration || 0),
            virality: clip.virality_score || Math.floor(Math.random() * 30 + 70),
            quality: "HD",
            videoUrl: `${apiUrl}/clips/${clip.filename}`,
            thumbnail: clip.thumbnail_filename ? `${apiUrl}/clips/${clip.thumbnail_filename}` : undefined,
            description: clip.description || "AI-generated viral clip",
            createdAt: new Date(clip.created_at || Date.now()).toLocaleDateString(),
            aspectRatio: clip.aspect_ratio || "9:16",
            captionStyle: "Bold Yellow",
            filename: clip.filename,
          }));

          // Update the project with fetched clips
          setProjects(prevProjects =>
            prevProjects.map(p =>
              p.id === projectId
                ? {
                    ...p,
                    clips,
                    clipsCount: clips.length,
                    avgVirality: clips.length > 0 ? Math.round(clips.reduce((sum, c) => sum + c.virality, 0) / clips.length) : 0,
                  }
                : p
            )
          );
        }
      }
    } catch (error) {
      console.error(`Failed to fetch clips for project ${projectId}:`, error);
    } finally {
      setLoadingClips(prev => {
        const newSet = new Set(prev);
        newSet.delete(projectId);
        return newSet;
      });
    }
  };

  const formatDuration = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const toggleProject = (projectId: string) => {
    const newExpanded = new Set(expandedProjects);
    if (newExpanded.has(projectId)) {
      // Collapse the project
      newExpanded.delete(projectId);
    } else {
      // Expand the project and fetch clips if not already loaded
      newExpanded.add(projectId);
      fetchClipsForProject(projectId);
    }
    setExpandedProjects(newExpanded);
  };

  const openClipModal = (clip: Clip) => {
    setSelectedClip(clip);
    setIsModalOpen(true);
  };

  const filteredProjects = projects
    .filter((project) => {
      if (filterStatus === "all") return true;
      return project.status === filterStatus;
    })
    .filter((project) => {
      if (!searchQuery) return true;
      return (
        project.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        project.sourceTitle.toLowerCase().includes(searchQuery.toLowerCase())
      );
    });

  if (isLoading) {
    return (
      <AppLayout>
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center justify-center h-64">
            <div className="text-center">
              <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
              <p className="text-gray-400">Loading your library...</p>
            </div>
          </div>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-6 md:mb-8">
          <h1 className="text-2xl md:text-3xl font-bold text-white mb-2">Video Library</h1>
          <p className="text-gray-400 text-sm md:text-base">All your projects and viral clips in one place</p>
        </div>

        {/* Filters & Search */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center mb-6">
          {/* Search */}
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search projects..."
              className="w-full h-10 md:h-12 pl-11 pr-4 bg-input border border-border rounded-lg text-white placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>

          {/* Filter Buttons */}
          <div className="flex items-center gap-2 flex-shrink-0">
            {(["all", "completed", "processing"] as const).map((status) => (
              <button
                key={status}
                onClick={() => setFilterStatus(status)}
                className={`px-3 md:px-4 py-2 rounded-lg text-xs md:text-sm font-medium transition-all capitalize ${
                  filterStatus === status
                    ? "bg-primary text-white"
                    : "bg-card text-gray-400 hover:text-white"
                }`}
              >
                {status === "all" ? "All" : status.charAt(0).toUpperCase() + status.slice(1)}
              </button>
            ))}
          </div>
        </div>

        {/* Projects List */}
        {filteredProjects.length === 0 ? (
          <div className="text-center py-20">
            <div className="w-20 h-20 rounded-full bg-muted mx-auto mb-4 flex items-center justify-center">
              <Play className="w-10 h-10 text-muted-foreground" />
            </div>
            <h3 className="text-xl font-semibold text-white mb-2">No projects found</h3>
            <p className="text-muted-foreground mb-6">
              {searchQuery
                ? "Try adjusting your search"
                : "Start analyzing videos to build your viral library"}
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {filteredProjects.map((project) => (
              <div key={project.id} className="glass rounded-xl border border-border overflow-hidden">
                {/* Project Header */}
                <button
                  onClick={() => toggleProject(project.id)}
                  className="w-full p-4 md:p-6 flex items-start gap-3 hover:bg-card/50 transition-colors text-left"
                >
                  {/* Expand Icon */}
                  <div className="mt-0.5 flex-shrink-0">
                    {expandedProjects.has(project.id) ? (
                      <ChevronDown className="w-5 h-5 text-primary" />
                    ) : (
                      <ChevronRight className="w-5 h-5 text-gray-400" />
                    )}
                  </div>

                  {/* Project Info — grows, clips text */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <h3 className="text-base md:text-lg font-semibold text-white truncate">{project.title}</h3>

                      {/* Status Badge + Studio Link — right-aligned, no wrap */}
                      <div className="flex items-center gap-2 flex-shrink-0">
                        {project.status === "completed" && (
                          <span className="hidden sm:inline-flex px-2.5 py-0.5 rounded-full bg-green-400/20 text-green-400 text-xs font-semibold">
                            Completed
                          </span>
                        )}
                        {project.status === "processing" && (
                          <span className="hidden sm:inline-flex px-2.5 py-0.5 rounded-full bg-yellow-400/20 text-yellow-400 text-xs font-semibold">
                            Processing
                          </span>
                        )}
                        {project.status === "failed" && (
                          <span className="hidden sm:inline-flex px-2.5 py-0.5 rounded-full bg-red-400/20 text-red-400 text-xs font-semibold">
                            Failed
                          </span>
                        )}
                        {project.status === "completed" && (
                          <Link
                            href={`/studio/${project.id}`}
                            onClick={(e) => e.stopPropagation()}
                            className="flex items-center gap-1 px-2 md:px-3 py-1 md:py-1.5 rounded-lg bg-primary/15 hover:bg-primary/30 text-primary text-xs font-semibold transition-colors border border-primary/20 whitespace-nowrap"
                          >
                            <Clapperboard className="w-3.5 h-3.5" />
                            <span className="hidden sm:inline">Open in Studio</span>
                          </Link>
                        )}
                      </div>
                    </div>

                    {/* Meta row */}
                    <div className="flex items-center flex-wrap gap-x-3 gap-y-1 text-xs md:text-sm text-muted-foreground">
                      <span>{project.createdAt}</span>
                      <span>•</span>
                      <span>
                        {loadingClips.has(project.id) ? (
                          <span className="flex items-center gap-1.5">
                            <div className="w-3 h-3 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
                            Loading clips...
                          </span>
                        ) : (
                          `${project.clipsCount} clips`
                        )}
                      </span>
                      {project.status === "completed" && project.avgVirality > 0 && (
                        <>
                          <span>•</span>
                          <span className="text-primary font-semibold">{project.avgVirality}% avg virality</span>
                        </>
                      )}
                      {/* Status badge inline on mobile only */}
                      <span className="sm:hidden">
                        {project.status === "completed" && (
                          <span className="px-2 py-0.5 rounded-full bg-green-400/20 text-green-400 text-xs font-semibold">Completed</span>
                        )}
                        {project.status === "processing" && (
                          <span className="px-2 py-0.5 rounded-full bg-yellow-400/20 text-yellow-400 text-xs font-semibold">Processing</span>
                        )}
                        {project.status === "failed" && (
                          <span className="px-2 py-0.5 rounded-full bg-red-400/20 text-red-400 text-xs font-semibold">Failed</span>
                        )}
                      </span>
                    </div>
                  </div>
                </button>

                {/* Clips Grid (Expanded) */}
                {expandedProjects.has(project.id) && project.clips.length > 0 && (
                  <div className="p-4 md:p-6 pt-0 border-t border-border">
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                      {project.clips.map((clip) => (
                        <div
                          key={clip.id}
                          className="glass rounded-xl overflow-hidden border border-border hover:border-primary transition-all group cursor-pointer"
                          onClick={() => openClipModal(clip)}
                        >
                          {/* Thumbnail */}
                          <div className="relative aspect-[9/16] bg-black">
                            {clip.thumbnail ? (
                              <img src={clip.thumbnail} alt={clip.title} className="w-full h-full object-cover" />
                            ) : (
                              <div className="absolute inset-0 bg-gradient-to-br from-blue-900/50 to-blue-900/50"></div>
                            )}

                            {/* Play button overlay */}
                            <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/50">
                              <div className="w-16 h-16 rounded-full bg-gradient-purple flex items-center justify-center glow-purple">
                                <Play className="w-8 h-8 text-white ml-1" fill="currentColor" />
                              </div>
                            </div>

                            {/* Virality Badge */}
                            <div className="absolute top-3 left-3 px-3 py-1 rounded-full bg-gradient-purple text-white text-xs font-bold">
                              {clip.virality}% VIRALITY
                            </div>

                            {/* Duration & Quality */}
                            <div className="absolute bottom-3 left-3 flex gap-2">
                              <span className="px-2 py-1 rounded bg-black/70 text-white text-xs font-mono">
                                {clip.duration}
                              </span>
                              <span className="px-2 py-1 rounded bg-black/70 text-white text-xs font-semibold">
                                {clip.quality}
                              </span>
                            </div>
                          </div>

                          {/* Content */}
                          <div className="p-4">
                            <h3 className="font-semibold text-white mb-2 truncate">{clip.title}</h3>
                            <p className="text-sm text-muted-foreground mb-4 line-clamp-2">{clip.description}</p>

                            {/* Actions */}
                            <div className="flex items-center gap-2">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                }}
                                className="flex-1 h-9 px-3 rounded-lg bg-card border border-border hover:border-primary text-white text-sm font-medium transition-all flex items-center justify-center gap-2"
                              >
                                <Download className="w-4 h-4" />
                                SAVE
                              </button>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                }}
                                className="h-9 px-3 rounded-lg bg-card border border-border hover:border-primary text-white text-sm transition-all"
                              >
                                <Share2 className="w-4 h-4" />
                              </button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* No Clips Message */}
                {expandedProjects.has(project.id) && project.clips.length === 0 && (
                  <div className="p-6 pt-0 text-center text-muted-foreground border-t border-border">
                    {project.status === "processing"
                      ? "Clips are being generated..."
                      : "No clips available for this project"}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Clip Modal */}
      <ClipModal clip={selectedClip} isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} />
    </AppLayout>
  );
}
