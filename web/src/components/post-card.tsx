"use client";

import { ExternalLink, Heart, MessageCircle, Eye } from "lucide-react";
import { formatNumber } from "@/lib/utils";
import { cn } from "@/lib/utils";
import { MediaImg } from "@/components/media-img";

export type PostCardData = {
  id: string;
  hook: string;
  coverUrl?: string | null;
  shareUrl?: string | null;
  views?: number;
  likes?: number;
  comments?: number;
  publishedAt?: string | Date | null;
  status?: string;
  authorName?: string;
};

function formatDate(value?: string | Date | null) {
  if (!value) return null;
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function PostCard({
  post,
  compact = false,
  className,
}: {
  post: PostCardData;
  compact?: boolean;
  className?: string;
}) {
  const date = formatDate(post.publishedAt);
  const href = post.shareUrl || undefined;

  const body = (
    <>
          <div
            className={cn(
              "relative shrink-0 overflow-hidden rounded-lg bg-surface-2",
              compact ? "h-14 w-14" : "h-20 w-16",
            )}
          >
            <MediaImg
              src={post.coverUrl}
              shareUrl={post.shareUrl}
              fallbackSeed={post.hook + post.id}
              className="h-full w-full object-cover"
            />
          </div>

      <div className="min-w-0 flex-1">
        <p
          className={cn(
            "font-medium leading-snug text-ink",
            compact ? "line-clamp-2 text-xs" : "line-clamp-2 text-sm",
          )}
        >
          {post.hook || "Untitled post"}
        </p>
        {post.authorName ? (
          <p className="mt-0.5 text-[11px] text-muted">
            @{post.authorName.replace(/^@/, "")}
          </p>
        ) : null}

        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted">
          {post.status === "external" ? (
            <span>External TikTok</span>
          ) : (
            <>
              <span className="inline-flex items-center gap-1">
                <Eye className="h-3 w-3" />
                {formatNumber(post.views ?? 0)}
              </span>
              <span className="inline-flex items-center gap-1">
                <Heart className="h-3 w-3" />
                {formatNumber(post.likes ?? 0)}
              </span>
              <span className="inline-flex items-center gap-1">
                <MessageCircle className="h-3 w-3" />
                {formatNumber(post.comments ?? 0)}
              </span>
            </>
          )}
          {date && <span>{date}</span>}
        </div>

        {href ? (
          <span className="mt-2 inline-flex items-center gap-1 text-[11px] font-medium text-primary">
            Open on TikTok
            <ExternalLink className="h-3 w-3" />
          </span>
        ) : null}
      </div>
    </>
  );

  if (href) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noreferrer"
        className={cn(
          "flex gap-3 rounded-xl border border-white/[0.06] bg-white/[0.025] p-3 transition-colors hover:border-white/[0.1] hover:bg-white/[0.04]",
          compact && "p-2.5",
          className,
        )}
      >
        {body}
      </a>
    );
  }

  return (
    <article
      className={cn(
        "flex gap-3 rounded-xl border border-white/[0.06] bg-white/[0.025] p-3",
        compact && "p-2.5",
        className,
      )}
    >
      {body}
    </article>
  );
}

/** Soften noisy markdown / hashtag dumps from the model. */
export function cleanAssistantProse(text: string) {
  return text
    // Strip model "thinking" / reasoning dumps (Qwen, Claude-style)
    .replace(/<think>[\s\S]*?(?:<\/think>|$)/gi, "")
    .replace(/<\/?think>/gi, "")
    .replace(
      /(?:^|\n)\s*Thinking Process:?\s*[\s\S]*?(?=\n\s*(?:Daily briefing|##|#{1,3}\s|\*\*[A-Z]|Key takeaway|Recommendation|Action)|$)/gi,
      "\n",
    )
    .replace(/(?:^|\n)\s*Reasoning:?\s*[\s\S]*?(?=\n\n|\n#|$)/gi, "\n")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^\s*[-*]\s+/gm, "• ")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(
      /(?:^|\n)((?:\s*#\w+\b[^\n]*){2,})/g,
      (block) => {
        const tags = [...block.matchAll(/#\w+/g)].map((m) => m[0]);
        if (tags.length <= 3) return block;
        return `\n${tags.slice(0, 3).join(" ")}`;
      },
    )
    .replace(/TikTok video\s+\d+/gi, "")
    .replace(/\[\[competitor:[a-zA-Z0-9_-]+\]\]/g, "")
    .replace(
      /\[(?:https?:\/\/)?(?:www\.)?tiktok\.com[^\]]*\]\((?:https?:\/\/)?(?:www\.)?tiktok\.com[^)]+\)/gi,
      "",
    )
    .replace(/https?:\/\/(?:www\.|vm\.)?tiktok\.com\/[^\s)\]>"']+/gi, "")
    .replace(/(?:www\.)?tiktok\.com\/@[^\s)\]>"']+/gi, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function stripTikTokNoise(text: string) {
  return cleanAssistantProse(text);
}

/** Split text and render [[post:id]] / [[cpost:id]] as PostCards. */
export function RichMessage({
  content,
  postsById,
  leadingPosts,
  leadingLabel = "Videos & posts",
}: {
  content: string;
  postsById: Record<string, PostCardData>;
  /** Cards shown with the message (own posts, competitors, external oEmbed) */
  leadingPosts?: PostCardData[];
  leadingLabel?: string;
}) {
  const preferLeading = Boolean(leadingPosts?.length);
  const parts = content.split(/(\[\[(?:c)?post:[a-zA-Z0-9_-]+\]\])/g);
  const cleaned = parts.map((part) => {
    const match = part.match(/^\[\[(c)?post:([a-zA-Z0-9_-]+)\]\]$/);
    if (match) {
      if (preferLeading) return { type: "text" as const, text: "" };
      const id = match[2];
      const post = postsById[id];
      if (post) return { type: "card" as const, post, id };
      return { type: "text" as const, text: "" };
    }
    return { type: "text" as const, text: part };
  });

  return (
    <div className="space-y-2 text-sm leading-relaxed text-ink">
      {cleaned.map((part, i) => {
        if (part.type === "card") {
          return <PostCard key={`${part.id}-${i}`} post={part.post} compact />;
        }
        if (!part.text.trim()) return null;
        const text = stripTikTokNoise(part.text);
        if (!text) return null;
        return (
          <div key={i} className="whitespace-pre-wrap">
            {text}
          </div>
        );
      })}
      {preferLeading && (
        <div className="space-y-1.5 pt-1">
          <p className="text-[11px] font-medium uppercase tracking-[0.06em] text-muted">
            {leadingLabel}
          </p>
          {leadingPosts!.map((p) => (
            <PostCard key={`lead-${p.id}`} post={p} compact />
          ))}
        </div>
      )}
    </div>
  );
}
