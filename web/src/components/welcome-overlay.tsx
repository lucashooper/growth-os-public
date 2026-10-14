"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  Calendar,
  MessageSquare,
  Mic,
  Sparkles,
  TrendingUp,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";

const STORAGE_KEY = "growth-os-welcome-v1";

const FEATURES = [
  {
    icon: Mic,
    title: "Voice Studio",
    description: "Talk to the agent — generate slideshows and campaigns hands-free.",
  },
  {
    icon: Sparkles,
    title: "Generator",
    description: "Create TikTok carousels with AI copy and your image packs.",
  },
  {
    icon: Calendar,
    title: "Calendar & Queue",
    description: "Schedule posts and publish to TikTok from one queue.",
  },
  {
    icon: TrendingUp,
    title: "Insights",
    description: "Track hooks, competitors, and what's working.",
  },
  {
    icon: MessageSquare,
    title: "AI Chat",
    description: "Ask growth questions with your project context loaded.",
  },
];

export function WelcomeOverlay() {
  const searchParams = useSearchParams();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    function maybeOpen() {
      const welcomeParam = searchParams.get("welcome") === "1";
      const upgraded = searchParams.get("upgraded") === "true";
      const success = searchParams.get("success") === "true";
      const seen = window.localStorage.getItem(STORAGE_KEY) === "1";

      if ((welcomeParam || upgraded || success) && !seen) {
        console.log("[WelcomeOverlay] showing first-run welcome");
        setOpen(true);
      }
    }

    maybeOpen();
    window.addEventListener("growth-os:billing-activated", maybeOpen);
    return () => window.removeEventListener("growth-os:billing-activated", maybeOpen);
  }, [searchParams]);

  function dismiss() {
    window.localStorage.setItem(STORAGE_KEY, "1");
    setOpen(false);
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
      <div className="relative w-full max-w-lg rounded-2xl border border-border bg-surface p-8 shadow-2xl">
        <button
          type="button"
          aria-label="Close"
          className="absolute right-4 top-4 rounded-lg p-1.5 text-muted hover:bg-surface-2 hover:text-ink"
          onClick={dismiss}
        >
          <X className="h-4 w-4" />
        </button>

        <div className="flex items-center gap-3">
          <img
            src="/GrowthOS-Logo.png"
            alt=""
            className="h-10 w-10 rounded-xl object-cover"
          />
          <div>
            <h2 className="text-xl font-semibold tracking-tight text-ink">
              Welcome to Growth OS
            </h2>
            <p className="text-sm text-muted">Your workspace is ready. Here&apos;s what you can do:</p>
          </div>
        </div>

        <ul className="mt-6 space-y-3">
          {FEATURES.map(({ icon: Icon, title, description }) => (
            <li
              key={title}
              className="flex gap-3 rounded-xl border border-border/60 bg-bg/40 px-3 py-2.5"
            >
              <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Icon className="h-4 w-4" />
              </div>
              <div>
                <p className="text-sm font-medium text-ink">{title}</p>
                <p className="text-xs leading-relaxed text-muted">{description}</p>
              </div>
            </li>
          ))}
        </ul>

        <Button className="mt-6 h-11 w-full" onClick={dismiss}>
          Get started
        </Button>
      </div>
    </div>
  );
}
