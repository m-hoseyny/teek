"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import Link from "next/link";
import { Clock, ArrowRight, CheckCircle, Loader2 } from "lucide-react";
import type { LatestTask } from "@/hooks/useLatestTask";

interface LatestTaskCardProps {
  task: LatestTask | null;
  isLoading: boolean;
}

export function LatestTaskCard({ task, isLoading }: LatestTaskCardProps) {
  if (isLoading) {
    return (
      <div className="mt-8">
        <Separator className="my-8" />
        <div className="text-lg font-semibold text-black mb-4">Latest Generation</div>
        <Card>
          <CardContent className="p-6">
            <div className="h-5 w-64 bg-gray-200 rounded animate-pulse mb-2" />
            <div className="h-4 w-48 bg-gray-200 rounded animate-pulse" />
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!task) {
    return null;
  }

  return (
    <div className="mt-8">
      <Separator className="my-8" />
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-black">Latest Generation</h2>
        <Link href="/list">
          <Button variant="ghost" size="sm" className="text-blue-600 hover:text-blue-700">
            See All <ArrowRight className="w-4 h-4 ml-1" />
          </Button>
        </Link>
      </div>

      <Link href={`/tasks/${task.id}`}>
        <Card className="hover:shadow-md transition-shadow cursor-pointer">
          <CardContent className="p-6">
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                <h3 className="text-lg font-semibold text-black mb-2 truncate">{task.source_title}</h3>
                <div className="flex flex-wrap items-center gap-3 text-sm text-gray-600">
                  <Badge variant="outline" className="capitalize">
                    {task.source_type}
                  </Badge>
                  <span className="flex items-center gap-1">
                    <Clock className="w-4 h-4" />
                    {new Date(task.created_at).toLocaleDateString()}
                  </span>
                  <span>
                    {task.clips_count} {task.clips_count === 1 ? "clip" : "clips"}
                  </span>
                </div>
              </div>
              <div className="flex-shrink-0">
                {task.status === "completed" ? (
                  <Badge className="bg-green-100 text-green-800">
                    <CheckCircle className="w-3 h-3 mr-1" />
                    Completed
                  </Badge>
                ) : task.status === "processing" ? (
                  <Badge className="bg-blue-100 text-blue-800">
                    <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                    Processing
                  </Badge>
                ) : (
                  <Badge variant="outline">{task.status}</Badge>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      </Link>
    </div>
  );
}
