"use client";

import { ExternalLink, X } from "lucide-react";
import { PostCard, type PostCardData } from "@/components/post-card";
import { Button } from "@/components/ui/button";
import { formatNumber } from "@/lib/utils";

export function PostDrawer({
  post,
  onClose,
  onUseInspiration,
}: {
  post: PostCardData | null;
  onClose: () => void;
  onUseInspiration?: (post: PostCardData) => void;
}) {
  if (!post) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/65 backdrop-blur-[2px]" onClick={onClose}>
      <aside
        className="flex h-full w-full max-w-md flex-col border-l border-white/[0.08] bg-[#141416]/95 shadow-2xl backdrop-blur-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <p className="text-sm font-semibold text-ink">Post details</p>
          <button type="button" onClick={onClose} className="text-muted hover:text-ink">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="flex-1 space-y-4 overflow-y-auto p-4">
          <div className="overflow-hidden rounded-xl bg-surface-2">
            {post.coverUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={post.coverUrl}
                alt=""
                className="aspect-[9/16] w-full object-cover"
                referrerPolicy="no-referrer"
              />
            ) : (
              <img
                src={`data:image/svg+xml,%3Csvg width='200' height='300' xmlns='http://www.w3.org/2000/svg'%3E%3Cdefs%3E%3ClinearGradient id='g' x1='0' y1='0' x2='1' y2='1'%3E%3Cstop offset='0' stop-color='%2343e97b'/%3E%3Cstop offset='1' stop-color='%2338f9d7'/%3E%3C/linearGradient%3E%3C/defs%3E%3Crect width='200' height='300' fill='url(%23g)'/%3E%3Ccircle cx='100' cy='150' r='30' fill='white' opacity='0.2'/%3E%3C/svg%3E`}
                alt=""
                className="aspect-[9/16] w-full object-cover"
              />
            )}
          </div>
          <div>
            <p className="text-[10px] font-medium uppercase tracking-wide text-muted">Hook</p>
            <p className="mt-1 text-sm font-medium text-ink">{post.hook}</p>
          </div>
          <div className="grid grid-cols-3 gap-2 text-center text-xs">
            <div className="rounded-lg border border-border p-2">
              <p className="text-muted">Views</p>
              <p className="font-semibold text-ink">{formatNumber(post.views ?? 0)}</p>
            </div>
            <div className="rounded-lg border border-border p-2">
              <p className="text-muted">Likes</p>
              <p className="font-semibold text-ink">{formatNumber(post.likes ?? 0)}</p>
            </div>
            <div className="rounded-lg border border-border p-2">
              <p className="text-muted">Comments</p>
              <p className="font-semibold text-ink">{formatNumber(post.comments ?? 0)}</p>
            </div>
          </div>
          <PostCard post={post} />
        </div>
        <div className="flex gap-2 border-t border-border p-4">
          {post.shareUrl && (
            <a
              href={post.shareUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-10 flex-1 items-center justify-center gap-1.5 rounded-xl border border-border bg-surface-2 text-sm font-medium text-ink hover:bg-border/60"
            >
              Open TikTok <ExternalLink className="h-3.5 w-3.5" />
            </a>
          )}
          {onUseInspiration && (
            <Button className="flex-1" onClick={() => onUseInspiration(post)}>
              Use as inspiration
            </Button>
          )}
        </div>
      </aside>
    </div>
  );
}
