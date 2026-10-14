"use client";

import { useState } from "react";
import { CalendarClock, Loader2, Trash2, Wand2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { apiFetch } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import { GlassSelect } from "@/components/ui/glass-select";

const DAYS = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];

export type DraftPost = {
  id: string;
  hook: string;
  caption?: string;
  coverUrl?: string | null;
  status?: string;
  scheduledAt?: string | Date | null;
  slides?: string[];
  meta?: {
    visualSlides?: {
      index: number;
      text: string;
      backgroundUrl?: string;
      backgroundLabel?: string;
      textPosition?: string;
    }[];
    narrative?: string;
  };
};

export function DraftDrawer({
  post,
  onClose,
  onScheduled,
  onDeleted,
  onOpenInGenerator,
}: {
  post: DraftPost | null;
  onClose: () => void;
  onScheduled?: () => void;
  onDeleted?: (id: string) => void;
  onOpenInGenerator?: (post: DraftPost) => void;
}) {
  const [day, setDay] = useState("Monday");
  const [time, setTime] = useState("18:00");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  if (!post) return null;

  const visuals = post.meta?.visualSlides || [];
  const slides = visuals.length
    ? visuals.map((v) => v.text || `(${v.backgroundLabel || "image"})`)
    : post.slides || [];

  async function schedule() {
    setBusy(true);
    setError(null);
    const res = await apiFetch<{ post: DraftPost }>(`/api/posts/${post!.id}`, {
      method: "PATCH",
      body: JSON.stringify({ queue: { day, time }, status: "scheduled" }),
    });
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setDone(true);
    onScheduled?.();
  }

  async function remove() {
    if (!post) return;
    setBusy(true);
    const res = await apiFetch(`/api/posts/${post.id}`, { method: "DELETE" });
    setBusy(false);
    if (!res.ok) {
      setError(typeof res.error === "string" ? res.error : "Delete failed");
      return;
    }
    onDeleted?.(post.id);
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/65 backdrop-blur-[2px]" onClick={onClose}>
      <aside
        className={cn("flex h-full w-full max-w-md flex-col border-l border-white/[0.08] bg-[#141416]/95 shadow-2xl backdrop-blur-xl")}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div>
            <p className="text-sm font-semibold text-ink">Draft carousel</p>
            <p className="text-[11px] text-muted">Open, schedule, or reopen in Generator</p>
          </div>
          <button type="button" onClick={onClose} className="text-muted hover:text-ink">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto p-4">
          <div className="overflow-hidden rounded-xl border border-border bg-surface-2">
            {post.coverUrl || visuals[0]?.backgroundUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={post.coverUrl || visuals[0]?.backgroundUrl}
                alt=""
                className="aspect-[9/16] max-h-72 w-full object-cover"
              />
            ) : (
              <img
                src={`data:image/svg+xml,%3Csvg width='200' height='300' xmlns='http://www.w3.org/2000/svg'%3E%3Cdefs%3E%3ClinearGradient id='g' x1='0' y1='0' x2='1' y2='1'%3E%3Cstop offset='0' stop-color='%23f093fb'/%3E%3Cstop offset='1' stop-color='%23f5576c'/%3E%3C/linearGradient%3E%3C/defs%3E%3Crect width='200' height='300' fill='url(%23g)'/%3E%3Ccircle cx='100' cy='150' r='30' fill='white' opacity='0.2'/%3E%3C/svg%3E`}
                alt=""
                className="aspect-[9/16] max-h-72 w-full object-cover"
              />
            )}
          </div>

          <div>
            <div className="mb-1 flex items-center gap-2">
              <Badge>{post.status || "draft"}</Badge>
              {post.scheduledAt ? (
                <span className="text-[11px] text-muted">
                  Scheduled {new Date(post.scheduledAt).toLocaleString()}
                </span>
              ) : null}
            </div>
            <p className="text-sm font-medium text-ink">{post.hook}</p>
            {post.caption ? (
              <p className="mt-2 whitespace-pre-wrap text-xs text-muted line-clamp-6">
                {post.caption}
              </p>
            ) : null}
          </div>

          <div>
            <p className="mb-2 text-[10px] font-medium uppercase tracking-wide text-muted">
              Slides ({slides.length})
            </p>
            <div className="space-y-2">
              {slides.map((t, i) => (
                <div
                  key={i}
                  className="rounded-xl border border-border bg-surface/30 px-3 py-2 text-xs text-ink"
                >
                  <span className="text-muted">Slide {i + 1}</span>
                  <p className="mt-0.5">{t || "Product / image only"}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-xl border border-border p-3">
            <p className="mb-2 flex items-center gap-1.5 text-xs font-medium text-ink">
              <CalendarClock className="h-3.5 w-3.5" />
              Schedule to Queue
            </p>
            <div className="grid grid-cols-2 gap-2">
              <label className="text-[11px] text-muted">
                Day
                <GlassSelect
                  aria-label="Day"
                  value={day}
                  onChange={setDay}
                  className="mt-1"
                  options={DAYS.map((d) => ({ value: d, label: d }))}
                />
              </label>
              <label className="text-[11px] text-muted">
                Time
                <input
                  type="time"
                  value={time}
                  onChange={(e) => setTime(e.target.value)}
                  className="mt-1 h-9 w-full rounded-lg border border-border bg-bg px-2 text-xs text-ink"
                />
              </label>
            </div>
            {error && <p className="mt-2 text-xs text-warning">{error}</p>}
            {done && (
              <p className="mt-2 text-xs text-primary">
                Added to Queue — check the Queue page.
              </p>
            )}
            <Button
              className="mt-3 w-full gap-1.5"
              size="sm"
              disabled={busy}
              onClick={() => void schedule()}
            >
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
              Schedule post
            </Button>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 border-t border-border p-4">
          <Button
            variant="ghost"
            className="gap-1.5 text-warning"
            disabled={busy}
            onClick={() => void remove()}
          >
            <Trash2 className="h-3.5 w-3.5" />
            Delete
          </Button>
          <div className="flex flex-1 justify-end gap-2">
            <Button variant="secondary" onClick={onClose}>
              Close
            </Button>
            {onOpenInGenerator && (
              <Button className="gap-1.5" onClick={() => onOpenInGenerator(post)}>
                <Wand2 className="h-3.5 w-3.5" />
                Open in Generator
              </Button>
            )}
          </div>
        </div>
      </aside>
    </div>
  );
}
