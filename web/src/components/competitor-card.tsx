"use client";

import { useState } from "react";
import { ChevronDown, ExternalLink, Eye } from "lucide-react";
import { formatNumber, cn } from "@/lib/utils";

export type CompetitorCardData = {
  id: string;
  handle: string;
  avatar?: string;
  followers?: number;
  avgViews?: number;
  topHook?: string;
  bio?: string;
  shareUrl?: string;
  whyItWorks?: string;
  posts?: Array<{
    id: string;
    hook: string;
    coverUrl?: string;
    shareUrl?: string;
    views?: number;
  }>;
};

export function CompetitorCard({ data }: { data: CompetitorCardData }) {
  const [open, setOpen] = useState(false);
  const tiktok = data.shareUrl || `https://www.tiktok.com/@${data.handle.replace(/^@/, "")}`;

  return (
    <article className="rounded-xl border border-border bg-surface/40 p-3">
      <div className="flex gap-3">
        <div className="h-12 w-12 shrink-0 overflow-hidden rounded-full bg-surface-2">
          {data.avatar ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={data.avatar} alt="" className="h-full w-full object-cover" referrerPolicy="no-referrer" />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-xs text-muted">
              @
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-ink">@{data.handle.replace(/^@/, "")}</p>
          <div className="mt-1 flex flex-wrap gap-x-3 text-[11px] text-muted">
            {data.followers != null && (
              <span>{formatNumber(data.followers)} followers</span>
            )}
            {data.avgViews != null && (
              <span className="inline-flex items-center gap-1">
                <Eye className="h-3 w-3" />
                {formatNumber(data.avgViews)} avg views
              </span>
            )}
          </div>
          {data.topHook && (
            <p className="mt-1 line-clamp-2 text-[11px] text-muted">Top: “{data.topHook}”</p>
          )}
        </div>
        <a
          href={tiktok}
          target="_blank"
          rel="noreferrer"
          className="shrink-0 self-start text-[11px] font-medium text-primary hover:underline"
        >
          View <ExternalLink className="ml-0.5 inline h-3 w-3" />
        </a>
      </div>

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="mt-2 flex items-center gap-1 text-[11px] text-primary hover:underline"
      >
        Analysis
        <ChevronDown className={cn("h-3 w-3 transition", open && "rotate-180")} />
      </button>
      {open && (
        <div className="mt-2 space-y-2 rounded-lg bg-bg/50 p-2.5 text-[11px] text-muted">
          {data.whyItWorks && <p className="text-ink">{data.whyItWorks}</p>}
          {data.bio && <p>Bio: {data.bio}</p>}
          {(data.posts || []).slice(0, 3).map((p) => (
            <a
              key={p.id}
              href={p.shareUrl || tiktok}
              target="_blank"
              rel="noreferrer"
              className="flex gap-2 rounded-lg border border-border/60 p-1.5 hover:bg-surface"
            >
              {p.coverUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={p.coverUrl}
                  alt=""
                  className="h-12 w-10 rounded object-cover"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <div className="h-12 w-10 rounded bg-surface-2" />
              )}
              <div className="min-w-0">
                <p className="line-clamp-2 text-ink">{p.hook}</p>
                <p>{formatNumber(p.views ?? 0)} views</p>
              </div>
            </a>
          ))}
        </div>
      )}
    </article>
  );
}
