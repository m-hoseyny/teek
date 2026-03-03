"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Sparkles, Video, Wand2, Settings, Zap } from "lucide-react";
import { cn } from "@/lib/utils";
import { useSession } from "@/lib/auth-client";

const navigation = [
  { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { name: "Analysis", href: "/analysis", icon: Sparkles },
  { name: "Library", href: "/library", icon: Video },
  { name: "AI Presets", href: "/presets", icon: Wand2 },
  { name: "Settings", href: "/settings", icon: Settings },
];

interface UsageStat {
  used: number;
  limit: number | "Unlimited";
  remaining: number | "Unlimited";
}

interface SubscriptionData {
  plan: string;
  plan_name: string;
  transcription: UsageStat;
  clip_generations: UsageStat;
}

export function Sidebar() {
  const pathname = usePathname();
  const { data: session } = useSession();
  const [subscription, setSubscription] = useState<SubscriptionData | null>(null);
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

  useEffect(() => {
    if (!session?.user?.id) return;

    fetch(`${apiUrl}/tasks/subscription/usage`, {
      headers: { user_id: session.user.id },
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data) setSubscription(data);
      })
      .catch(() => {});
  }, [session?.user?.id, apiUrl]);

  const planName = subscription?.plan_name ?? subscription?.plan?.toUpperCase() ?? "FREE";
  const isUnlimited = subscription?.clip_generations?.limit === "Unlimited";
  const clipsUsed = subscription?.clip_generations?.used ?? 0;
  const clipsLimit = subscription?.clip_generations?.limit;
  const clipsRemaining = subscription?.clip_generations?.remaining;

  return (
    <div className="w-64 bg-sidebar border-r border-sidebar-border flex flex-col">
      {/* Logo */}
      <div className="p-6">
        <Link href="/" className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-purple flex items-center justify-center glow-purple">
            <Zap className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white">Teek Studio</h1>
            <p className="text-xs text-blue-400">VIDEO OPTIMIZER</p>
          </div>
        </Link>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-4 space-y-1">
        {navigation.map((item) => {
          const isActive = pathname === item.href || (item.href === "/analysis" && pathname.startsWith("/tasks"));
          return (
            <Link
              key={item.name}
              href={item.href}
              className={cn(
                "flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-all",
                isActive
                  ? "bg-primary text-white glow-purple"
                  : "text-gray-400 hover:text-white hover:bg-card"
              )}
            >
              <item.icon className="w-5 h-5" />
              {item.name}
            </Link>
          );
        })}
      </nav>

      {/* Subscription Widget */}
      <div className="p-4">
        <div className="glass rounded-xl p-4 border border-blue-500/30">
          <div className="text-xs font-semibold text-blue-400 mb-2 uppercase tracking-wide">
            {planName} PLAN
          </div>
          {subscription ? (
            <div className="space-y-2 mb-3">
              <div>
                <div className="flex justify-between text-xs text-gray-400 mb-1">
                  <span>Clips</span>
                  <span>
                    {clipsUsed} / {isUnlimited ? "∞" : clipsLimit}
                  </span>
                </div>
                {!isUnlimited && typeof clipsLimit === "number" && (
                  <div className="w-full h-1.5 bg-white/10 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-blue-400 rounded-full transition-all"
                      style={{ width: `${Math.min(100, (clipsUsed / clipsLimit) * 100)}%` }}
                    />
                  </div>
                )}
              </div>
              <p className="text-xs text-gray-400">
                {isUnlimited ? (
                  <span className="text-blue-400 font-semibold">Unlimited clips</span>
                ) : (
                  <>
                    <span className="font-bold text-blue-400">{clipsRemaining}</span> clips remaining
                  </>
                )}
              </p>
            </div>
          ) : (
            <p className="text-sm text-gray-400 mb-3">Loading usage...</p>
          )}
          <Link
            href="/settings"
            className="block w-full py-2 px-4 rounded-lg bg-gradient-purple hover:bg-gradient-purple-hover text-white text-sm font-semibold transition-all glow-purple text-center"
          >
            {subscription?.plan === "free" ? "Upgrade" : "Manage Plan"}
          </Link>
        </div>
      </div>
    </div>
  );
}
