import "server-only";

export function handleFromShareUrl(shareUrl: string): string | null {
  const m = shareUrl.match(/tiktok\.com\/@([^/?]+)/i);
  if (!m?.[1] || m[1] === "" || m[1] === ".") return null;
  return m[1].replace(/^@/, "").toLowerCase();
}

export function normalizeHandle(raw: string) {
  return raw.replace(/^@/, "").trim().toLowerCase();
}

export type FilterablePost = {
  accountId: string | null;
  theme: string;
  shareUrl: string | null;
  hook?: string;
  views?: number;
  metaJson?: string | null;
};

function authorFromMeta(metaJson?: string | null): string | null {
  if (!metaJson) return null;
  try {
    const meta = JSON.parse(metaJson) as { authorHandle?: unknown };
    if (typeof meta.authorHandle === "string" && meta.authorHandle.trim()) {
      return normalizeHandle(meta.authorHandle);
    }
  } catch {
    /* ignore */
  }
  return null;
}

/**
 * Tiny connected accounts should not absorb 1M+ view videos from the scrape
 * graph. A 2-follower profile with 28M views is never that account's post.
 */
export function isImplausibleForAccount(views: number, followers: number) {
  const cap = Math.max(Math.max(followers, 1) * 8_000, 80_000);
  return views > cap && views > 80_000;
}

/** Keep analytics/briefing on videos that belong to this workspace's connected handles. */
export function isOwnedAccountPost(
  post: FilterablePost,
  opts: {
    accountIds: string[];
    usernames: string[];
    followersByAccount?: Record<string, number>;
  },
) {
  if (!post.accountId || !opts.accountIds.includes(post.accountId)) return false;
  if (post.theme === "competitor" || post.theme === "tiktok-foreign") return false;

  const allowed = new Set(opts.usernames.map(normalizeHandle).filter(Boolean));
  if (!allowed.size) return false;

  const fromUrl = post.shareUrl ? handleFromShareUrl(post.shareUrl) : null;
  if (fromUrl && !allowed.has(fromUrl)) return false;

  const fromMeta = authorFromMeta(post.metaJson);
  if (fromMeta && !allowed.has(fromMeta)) return false;

  const followers = opts.followersByAccount?.[post.accountId] ?? 0;
  if (isImplausibleForAccount(post.views ?? 0, followers)) return false;

  return true;
}
