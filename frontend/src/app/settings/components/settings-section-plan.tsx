"use client";

import { useEffect, useState } from "react";
import { Check } from "lucide-react";
import { useSession } from "@/lib/auth-client";

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
  features: {
    watermark: boolean;
    custom_font: boolean;
    custom_size: boolean;
  };
}

function UsageBar({ used, limit }: { used: number; limit: number | "Unlimited" }) {
  if (limit === "Unlimited") {
    return (
      <div className="flex items-center gap-2">
        <div className="flex-1 h-2 bg-white/10 rounded-full" />
        <span className="text-xs text-blue-400 font-medium shrink-0">Unlimited</span>
      </div>
    );
  }
  const pct = limit > 0 ? Math.min(100, (used / limit) * 100) : 0;
  const color = pct >= 90 ? "bg-red-400" : pct >= 70 ? "bg-yellow-400" : "bg-blue-400";
  return (
    <div className="w-full h-2 bg-white/10 rounded-full overflow-hidden">
      <div className={`h-full ${color} rounded-full transition-all`} style={{ width: `${pct}%` }} />
    </div>
  );
}

const PLAN_FEATURES: Record<string, string[]> = {
  free: ["10 clip generations/month", "60 transcription minutes/month", "Watermark on clips", "Local transcription"],
  pro: [
    "100 clip generations/month",
    "300 transcription minutes/month",
    "No watermark",
    "Custom fonts",
    "All transcription providers",
  ],
  business: [
    "Unlimited clip generations",
    "Unlimited transcription minutes",
    "No watermark",
    "Custom fonts & sizes",
    "Priority processing",
    "All transcription providers",
  ],
};

export function SettingsSectionPlan() {
  const { data: session } = useSession();
  const [subscription, setSubscription] = useState<SubscriptionData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

  useEffect(() => {
    if (!session?.user?.id) return;

    setIsLoading(true);
    fetch(`${apiUrl}/tasks/subscription/usage`, {
      headers: { user_id: session.user.id },
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data) setSubscription(data);
      })
      .catch(() => {})
      .finally(() => setIsLoading(false));
  }, [session?.user?.id, apiUrl]);

  if (isLoading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-16 rounded-md bg-white/5 animate-pulse" />
        ))}
      </div>
    );
  }

  if (!subscription) {
    return (
      <p className="text-sm text-gray-400">Unable to load subscription data. Make sure the backend is running.</p>
    );
  }

  const plan = subscription.plan;
  const planName = subscription.plan_name || plan;
  const features = PLAN_FEATURES[plan] ?? PLAN_FEATURES.free;

  const transcriptionIsUnlimited = subscription.transcription.limit === "Unlimited";
  const clipsIsUnlimited = subscription.clip_generations.limit === "Unlimited";

  return (
    <div className="space-y-6">
      {/* Current plan badge */}
      <div className="flex items-center justify-between rounded-md border border-border bg-white/5 p-4">
        <div>
          <p className="text-xs uppercase tracking-widest text-blue-400 font-semibold mb-1">Current Plan</p>
          <p className="text-2xl font-bold text-white capitalize">{planName}</p>
        </div>
        <span className="px-3 py-1 rounded-full bg-blue-500/20 text-blue-300 text-xs font-semibold border border-blue-500/30 uppercase">
          Active
        </span>
      </div>

      {/* Usage */}
      <div className="rounded-md border border-border bg-white/5 p-4 space-y-4">
        <p className="text-sm font-semibold text-white">This Month's Usage</p>

        {/* Clip generations */}
        <div className="space-y-1">
          <div className="flex justify-between text-xs text-gray-400">
            <span>Clip Generations</span>
            <span>
              {subscription.clip_generations.used} /{" "}
              {clipsIsUnlimited ? "∞" : subscription.clip_generations.limit}
            </span>
          </div>
          <UsageBar used={subscription.clip_generations.used} limit={subscription.clip_generations.limit} />
          <p className="text-xs text-gray-500">
            {clipsIsUnlimited ? (
              "Unlimited clips available"
            ) : (
              <>
                <span className="text-white font-medium">{subscription.clip_generations.remaining}</span> clips remaining
              </>
            )}
          </p>
        </div>

        {/* Transcription minutes */}
        <div className="space-y-1">
          <div className="flex justify-between text-xs text-gray-400">
            <span>Transcription Minutes</span>
            <span>
              {subscription.transcription.used} min /{" "}
              {transcriptionIsUnlimited ? "∞" : `${subscription.transcription.limit} min`}
            </span>
          </div>
          <UsageBar used={subscription.transcription.used} limit={subscription.transcription.limit} />
          <p className="text-xs text-gray-500">
            {transcriptionIsUnlimited ? (
              "Unlimited transcription available"
            ) : (
              <>
                <span className="text-white font-medium">{subscription.transcription.remaining}</span> minutes remaining
              </>
            )}
          </p>
        </div>
      </div>

      {/* Plan features */}
      <div className="rounded-md border border-border bg-white/5 p-4 space-y-3">
        <p className="text-sm font-semibold text-white">Included Features</p>
        <ul className="space-y-2">
          {features.map((feature) => (
            <li key={feature} className="flex items-center gap-2 text-sm text-gray-300">
              <Check className="w-4 h-4 text-blue-400 shrink-0" />
              {feature}
            </li>
          ))}
        </ul>
      </div>

      {/* Feature flags */}
      <div className="rounded-md border border-border bg-white/5 p-4 space-y-3">
        <p className="text-sm font-semibold text-white">Plan Capabilities</p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {[
            { label: "Watermark", value: subscription.features.watermark, invert: true },
            { label: "Custom Font", value: subscription.features.custom_font },
            { label: "Custom Size", value: subscription.features.custom_size },
          ].map(({ label, value, invert }) => {
            const active = invert ? !value : value;
            return (
              <div
                key={label}
                className={`rounded-md border p-3 text-center ${
                  active ? "border-blue-500/40 bg-blue-500/10" : "border-border bg-white/5 opacity-50"
                }`}
              >
                <p className={`text-xs font-medium ${active ? "text-blue-300" : "text-gray-500"}`}>{label}</p>
                <p className={`text-xs mt-1 ${active ? "text-blue-400" : "text-gray-600"}`}>
                  {active ? "Enabled" : "Not available"}
                </p>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
