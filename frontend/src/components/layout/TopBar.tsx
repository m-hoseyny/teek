"use client";

import { Bell, Search, User } from "lucide-react";
import { useSession } from "@/lib/auth-client";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

export function TopBar() {
  const { data: session } = useSession();

  return (
    <div className="h-16 border-b border-sidebar-border bg-card/50 backdrop-blur-sm px-6 flex items-center justify-between">
      {/* Search Bar */}
      <div className="flex-1 max-w-xl">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Paste video URL or search library..."
            className="w-full h-10 pl-10 pr-4 bg-input border border-border rounded-lg text-sm text-white placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>
      </div>

      {/* Right Section */}
      <div className="flex items-center gap-4">
        {/* Notifications */}
        <button className="relative p-2 rounded-lg hover:bg-card transition-colors">
          <Bell className="w-5 h-5 text-gray-400" />
          <span className="absolute top-1 right-1 w-2 h-2 bg-primary rounded-full"></span>
        </button>

        {/* User Profile */}
        <div className="flex items-center gap-3">
          <Avatar className="w-9 h-9">
            <AvatarImage src={session?.user?.image || undefined} />
            <AvatarFallback className="bg-gradient-purple text-white">
              {session?.user?.name?.[0] || session?.user?.email?.[0] || <User className="w-4 h-4" />}
            </AvatarFallback>
          </Avatar>
        </div>
      </div>
    </div>
  );
}
