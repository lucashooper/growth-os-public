import "server-only";

export type ProviderId =
  | "tiktok"
  | "website"
  | "landing_page"
  | "app_store"
  | "play_store"
  | "meta_ads"
  | "ai_analysis";

/** Unified Deep Intelligence Engine result — Dashboard never sees the source shape. */
export type ProviderResult = {
  source: ProviderId;
  collectedAt: string;
  ok: boolean;
  error?: string;
  rawData: Record<string, unknown>;
  structuredData: Record<string, unknown>;
  insights: string[];
  assets?: Array<{
    kind: string;
    url: string;
    externalId: string;
    title?: string;
    meta?: Record<string, unknown>;
  }>;
  videos?: Array<{
    externalId: string;
    hook: string;
    caption: string;
    coverUrl: string;
    shareUrl: string;
    views: number;
    likes: number;
    comments: number;
    shares: number;
    saves: number;
    hashtags: string[];
    hourUtc: number | null;
    publishedAt: string | null;
    firstFrameUrl?: string;
  }>;
  fingerprint?: string;
  screenshotUrl?: string;
  htmlPath?: string;
};

export type CompetitorTarget = {
  id: string;
  projectId: string;
  name: string;
  slug: string;
  kind: string;
  handle: string;
  niche: string;
  websiteUrl: string;
  appStoreUrl: string;
  playStoreUrl: string;
  metaPageId: string;
  instagram: string;
  facebookPage: string;
  twitter: string;
  youtube: string;
  avatar: string;
  bio: string;
  followers: number;
  secUid: string;
};

export interface DeepProvider {
  id: ProviderId;
  supports(target: CompetitorTarget): boolean;
  syncCompetitor(target: CompetitorTarget): Promise<ProviderResult>;
}

export function extractHashtags(text: string): string[] {
  const matches = text.match(/#[\w\u0080-\uFFFF]+/g) || [];
  return [...new Set(matches.map((h) => h.toLowerCase()))];
}

export function slugifyCompetitor(input: {
  handle?: string;
  name?: string;
  websiteUrl?: string;
}): string {
  const handle = input.handle?.replace(/^@/, "").trim().toLowerCase();
  if (handle) return handle.slice(0, 64);
  if (input.websiteUrl) {
    try {
      const host = new URL(
        input.websiteUrl.startsWith("http")
          ? input.websiteUrl
          : `https://${input.websiteUrl}`,
      ).hostname.replace(/^www\./, "");
      return `web-${host}`.replace(/[^a-z0-9-]/gi, "-").slice(0, 64).toLowerCase();
    } catch {
      /* fall through */
    }
  }
  const name = (input.name || "competitor")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48);
  return name || `comp-${Date.now().toString(36)}`;
}

export function startOfUtcDay(d = new Date()): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

export function emptyResult(
  source: ProviderId,
  error: string,
): ProviderResult {
  return {
    source,
    collectedAt: new Date().toISOString(),
    ok: false,
    error,
    rawData: {},
    structuredData: {},
    insights: [],
  };
}
