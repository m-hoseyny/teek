"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Sparkles, Video, Wand2, Settings, Zap } from "lucide-react";
import { cn } from "@/lib/utils";

const navigation = [
  { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { name: "Analysis", href: "/analysis", icon: Sparkles },
  { name: "Library", href: "/library", icon: Video },
  { name: "AI Presets", href: "/presets", icon: Wand2 },
  { name: "Settings", href: "/settings", icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();
  const [credits] = useState(12); // TODO: Fetch from API

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

      {/* Pro Plan Widget */}
      <div className="p-4">
        <div className="glass rounded-xl p-4 border border-blue-500/30">
          <div className="text-xs font-semibold text-blue-400 mb-2">PRO PLAN</div>
          <p className="text-sm text-white mb-3">
            You have <span className="font-bold text-blue-400">{credits}</span> analysis credits remaining.
          </p>
          <button className="w-full py-2 px-4 rounded-lg bg-gradient-purple hover:bg-gradient-purple-hover text-white text-sm font-semibold transition-all glow-purple">
            Upgrade
          </button>
        </div>
      </div>
    </div>
  );
}
