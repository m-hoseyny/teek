"use client";

import Link from "next/link";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useSession } from "@/lib/auth-client";
import { useEffect, useState } from "react";

interface UsageSummary {
  plan: string;
  plan_name: string;
  transcription: {
    used: number;
    limit: number | string;
    remaining: number | string;
  };
  clip_generations: {
    used: number;
    limit: number | string;
    remaining: number | string;
  };
}

interface HeaderProps {
  logoSize?: number;
  containerClassName?: string;
}

function getPlanBadgeColor(plan: string): string {
  switch (plan) {
    case "business":
      return "bg-purple-100 text-purple-700 border-purple-200";
    case "pro":
      return "bg-blue-100 text-blue-700 border-blue-200";
    case "starter":
      return "bg-green-100 text-green-700 border-green-200";
    case "free":
    default:
      return "bg-gray-100 text-gray-600 border-gray-200";
  }
}

export function Header({ logoSize = 40, containerClassName }: HeaderProps) {
  const { data: session, isPending } = useSession();
  const [usage, setUsage] = useState<UsageSummary | null>(null);
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

  useEffect(() => {
    if (session?.user) {
      fetchUsage();
    }
  }, [session]);

  const fetchUsage = async () => {
    try {
      const response = await fetch(`${apiUrl}/tasks/subscription/usage`, {
        headers: {
          user_id: session?.user?.id || "",
        },
      });
      if (response.ok) {
        const data = await response.json();
        setUsage(data);
      }
    } catch (error) {
      console.error("Failed to fetch usage:", error);
    }
  };

  if (isPending) {
    return (
      <div className="border-b bg-white">
        <div className="max-w-4xl mx-auto px-4 py-4">
          <div className="max-w-xl mx-auto">
            <div className="flex items-center gap-2">
              <div className="h-10 w-10 bg-gray-200 rounded animate-pulse" />
              <div className="h-6 w-24 bg-gray-200 rounded animate-pulse" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="border-b bg-white">
      <div className={`max-w-4xl mx-auto px-4 py-4 ${containerClassName || ""}`}>
        <div className="max-w-xl mx-auto">
          <div className="flex items-center gap-2 sm:gap-3">
            <Link href="/" className="flex items-center gap-3 hover:opacity-80 transition-opacity cursor-pointer">
              <Image 
                src="/brand/logo.png" 
                alt="Teek logo" 
                width={logoSize} 
                height={logoSize} 
                className={`h-${logoSize === 96 ? '24' : '10'} w-${logoSize === 96 ? '24' : '10'} object-contain`} 
              />
              <h1 className="text-xl font-bold text-black">Teek</h1>
            </Link>
            {session?.user && (
              <>
                <Link href="/list" className="ml-1 sm:ml-2">
                  <Button variant="outline" size="sm" className="text-xs sm:text-sm px-2 sm:px-3">
                    All Generations
                  </Button>
                </Link>
                <div className="flex-1"></div>
                {usage && (
                  <span className={`hidden sm:inline-flex items-center px-2 py-1 rounded-md text-xs font-medium border ${getPlanBadgeColor(usage.plan)}`}>
                    {usage.plan_name}
                  </span>
                )}
                <Link href="/settings" className="flex items-center gap-2 sm:gap-3 hover:bg-accent rounded-lg px-2 sm:px-3 py-2 transition-colors cursor-pointer">
                  <Avatar className="w-8 h-8">
                    <AvatarImage src={session.user.image || ""} />
                    <AvatarFallback className="bg-gray-100 text-black text-sm">
                      {session.user.name?.charAt(0) || session.user.email?.charAt(0) || "U"}
                    </AvatarFallback>
                  </Avatar>
                  <div className="hidden sm:block">
                    <p className="text-sm font-medium text-black">{session.user.name}</p>
                    <p className="text-xs text-gray-500">{session.user.email}</p>
                  </div>
                </Link>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
