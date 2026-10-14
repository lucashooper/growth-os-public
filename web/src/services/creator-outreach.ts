import "server-only";

import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";

const EMAIL_RE =
  /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,7}\b/g;

const BIO_LINK_RE =
  /https?:\/\/(?:www\.)?(?:linktr\.ee|beacons\.ai|bio\.site|stan\.store|carrd\.co|lnk\.bio|allmylinks\.com)\/[^\s"'<>\\]+/gi;

const HANDLE_IN_TEXT_RE =
  /\(@([a-zA-Z0-9._]{2,30})\)|@([a-zA-Z0-9._]{2,30})\b/g;

const SEARCH_TIMEOUT_MS = 15_000;
const PROFILE_FETCH_MS = 8_000;
const DEFAULT_FOLLOWER_ESTIMATE = 5_000;
const MAX_CREATORS = 20;

const EMAIL_FALSE_POSITIVE =
  /tiktok\.com|instagram\.com|example\.com|email\.com|domain\.com|sentry\.io|wixpress|cloudflare|googleapis|schema\.org/i;

export type DiscoveredCreator = {
  platform: "tiktok" | "instagram";
  username: string;
  displayName: string;
  avatarUrl: string;
  followerCount: number;
  bio: string;
  email: string;
  bioLink: string;
  niche: string;
  followerEstimated?: boolean;
};

export type FollowerRange =
  | "3k-15k"
  | "15k-50k"
  | "50k-200k"
  | "all-3k"
  | string;

type SearchHit = {
  title?: string;
  url?: string;
  link?: string;
  snippet?: string;
  content?: string;
};

export function extractEmails(text: string): string[] {
  const matches = text.match(EMAIL_RE) || [];
  const found = matches
    .map((e) => e.toLowerCase())
    .filter((e) => !EMAIL_FALSE_POSITIVE.test(e));
  return [...new Set(found)];
}

export function extractValidEmail(text: string): string | null {
  return extractEmails(text)[0] || null;
}

export function extractBioLinks(text: string): string[] {
  return [
    ...new Set(
      [...(text.match(BIO_LINK_RE) || [])].map((u) =>
        u.replace(/[),.]+$/, "").replace(/\\u002F/g, "/"),
      ),
    ),
  ];
}

function normalizeHandle(raw: string) {
  return raw.replace(/^@/, "").trim().toLowerCase();
}

function followerInRange(count: number, range?: FollowerRange): boolean {
  if (!range || range === "all-3k" || range === "any") return count >= 3_000;
  if (range === "3k-15k") return count >= 3_000 && count <= 15_000;
  if (range === "15k-50k") return count > 15_000 && count <= 50_000;
  if (range === "50k-200k") return count > 50_000 && count <= 200_000;
  if (range === "5k-25k") return count >= 5_000 && count <= 25_000;
  if (range === "25k-100k") return count > 25_000 && count <= 100_000;
  if (range === "100k+") return count > 100_000;
  return count >= 3_000;
}

function parseFollowerCount(text: string): number | null {
  const km = text.match(/([\d.]+)\s*([KkMm])\s*followers?/i);
  if (km) {
    const n = Number(km[1]);
    if (!Number.isFinite(n)) return null;
    const mult = /[Mm]/.test(km[2]!) ? 1_000_000 : 1_000;
    return Math.round(n * mult);
  }
  const plain = text.match(/([\d,]+)\s*followers?/i);
  if (plain) {
    const n = Number(plain[1]!.replace(/,/g, ""));
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function isGenericHandle(username: string): boolean {
  if (!username || username.length < 2) return true;
  return /^(tiktok|instagram|explore|foryou|fyp|login|signup|reel|reels|p|stories|share|video|tag|discover|search|music|live|place)$/i.test(
    username,
  );
}

export class MissingSearchKeyError extends Error {
  constructor() {
    super("Missing TAVILY_API_KEY or SERPER_API_KEY");
    this.name = "MissingSearchKeyError";
  }
}

/** @deprecated use MissingSearchKeyError */
export class MissingSerperKeyError extends MissingSearchKeyError {}

export class SearchRequestError extends Error {
  status: number;
  body: string;
  constructor(status: number, body: string, engine = "Search") {
    super(`${engine} failed (${status}): ${body}`);
    this.name = "SearchRequestError";
    this.status = status;
    this.body = body;
  }
}

/** @deprecated use SearchRequestError */
export class SerperRequestError extends SearchRequestError {
  constructor(status: number, body: string) {
    super(status, body, "Serper");
    this.name = "SerperRequestError";
  }
}

export function sanitizeSearchKeyword(query?: string): string {
  const raw = (query || "wellness")
    .replace(/[#"'`:]/g, "")
    .replace(/[^\w\s.+-]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
  return raw || "wellness";
}

/** @deprecated */
export const sanitizeSerperKeyword = sanitizeSearchKeyword;

/** Bio-oriented query targeting profile contact lines, not video transcripts. */
export function buildCreatorBioSearchQuery(query: string): string {
  const cleanKeyword = sanitizeSearchKeyword(query);
  return `tiktok.com/@ "${cleanKeyword}" ("*@gmail.com" OR "*@yahoo.com" OR "*@hotmail.com" OR "contact @" OR "collab @")`;
}

/** Free-tier Serper-safe fallback (no boolean operators). */
export function buildCreatorBioSearchQueryPlain(query: string): string {
  const cleanKeyword = sanitizeSearchKeyword(query);
  return `tiktok.com/@ ${cleanKeyword} gmail.com collab email`;
}

function parseDirectHandles(query: string): string[] {
  const handles = query.match(/@[a-zA-Z0-9._]{2,30}/g) || [];
  const looksLikeHandles =
    handles.length > 0 && !query.includes("#") && !/[a-z]{4,}\s+[a-z]{4,}/i.test(
      query.replace(/@[a-zA-Z0-9._]+/g, "").trim(),
    );
  // Also accept space-separated @handles only
  const onlyHandles =
    handles.length > 0 &&
    query
      .replace(/@[a-zA-Z0-9._]+/g, "")
      .replace(/[,;\s]+/g, "")
      .length === 0;
  if (!looksLikeHandles && !onlyHandles) return [];
  return [...new Set(handles.map(normalizeHandle))].filter(
    (h) => !isGenericHandle(h),
  );
}

async function scrapeTikTokProfile(
  username: string,
): Promise<DiscoveredCreator | null> {
  const handle = normalizeHandle(username);
  if (!handle || handle.length < 2) return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROFILE_FETCH_MS);
  try {
    const res = await fetch(`https://www.tiktok.com/@${handle}`, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml",
      },
      signal: controller.signal,
      redirect: "follow",
    });
    const html = await res.text();
    if (html.length < 400) return null;

    let bio = "";
    let followers = 0;
    let avatar = "";
    let displayName = handle;

    const uni = html.match(
      /<script[^>]+id="__UNIVERSAL_DATA_FOR_REHYDRATION__"[^>]*>([\s\S]*?)<\/script>/i,
    );
    if (uni?.[1]) {
      try {
        const raw = uni[1];
        const sig =
          raw.match(/"signature"\s*:\s*"((?:\\.|[^"\\])*)"/)?.[1] ||
          raw.match(/"bio"\s*:\s*"((?:\\.|[^"\\])*)"/)?.[1];
        if (sig) {
          try {
            bio = JSON.parse(`"${sig}"`);
          } catch {
            bio = sig;
          }
        }
        const fans = raw.match(/"followerCount"\s*:\s*(\d+)/);
        if (fans) followers = Number(fans[1]) || 0;
        const av =
          raw.match(/"avatarLarger"\s*:\s*"([^"]+)"/) ||
          raw.match(/"avatarMedium"\s*:\s*"([^"]+)"/);
        if (av?.[1])
          avatar = av[1].replace(/\\u002F/g, "/").replace(/\\\//g, "/");
        const nick = raw.match(/"nickname"\s*:\s*"((?:\\.|[^"\\])*)"/)?.[1];
        if (nick) {
          try {
            displayName = JSON.parse(`"${nick}"`);
          } catch {
            displayName = nick;
          }
        }
      } catch {
        /* fall through */
      }
    }

    if (!bio) {
      bio =
        html.match(
          /<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i,
        )?.[1] ||
        html.match(
          /<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i,
        )?.[1] ||
        "";
      bio = bio.replace(/&#x27;/g, "'").replace(/&amp;/g, "&").trim();
    }
    if (!avatar) {
      avatar =
        html.match(
          /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i,
        )?.[1] || "";
    }
    if (!followers) {
      const followerMatch =
        html.match(/"followerCount"\s*:\s*(\d+)/) ||
        html.match(/(\d[\d,]*)\s*Followers/i);
      if (followerMatch) {
        followers = Number(String(followerMatch[1]).replace(/,/g, "")) || 0;
      }
    }

    const blob = `${bio} ${html.slice(0, 60_000)}`;
    const email = extractValidEmail(blob) || "";
    const links = extractBioLinks(blob);

    console.log(
      `[Extracted Lead]: @${handle} | Email: ${email || "none"} | source=profile`,
    );

    return {
      platform: "tiktok",
      username: handle,
      displayName:
        String(displayName).replace(/on TikTok.*/i, "").trim() || handle,
      avatarUrl: avatar,
      followerCount: followers || DEFAULT_FOLLOWER_ESTIMATE,
      followerEstimated: followers <= 0,
      bio: bio.slice(0, 500),
      email,
      bioLink: links[0] || "",
      niche: "",
    };
  } catch (err) {
    logger.warn("api", "TikTok profile scrape failed", {
      username: handle,
      message: err instanceof Error ? err.message : String(err),
    });
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function discoverFromDirectHandles(
  handles: string[],
  limit: number,
): Promise<DiscoveredCreator[]> {
  console.log(
    `[Discovery] Direct handle lookup for: ${handles.map((h) => `@${h}`).join(", ")}`,
  );
  const settled = await Promise.allSettled(
    handles.slice(0, limit).map((h) => scrapeTikTokProfile(h)),
  );
  const out: DiscoveredCreator[] = [];
  for (const r of settled) {
    if (r.status === "fulfilled" && r.value) out.push(r.value);
  }
  return out;
}

function platformFromUrl(url: string): "tiktok" | "instagram" | null {
  if (/tiktok\.com/i.test(url)) return "tiktok";
  if (/instagram\.com/i.test(url)) return "instagram";
  return null;
}

function extractUsernameFromHit(hit: SearchHit): {
  username: string;
  platform: "tiktok" | "instagram";
} | null {
  const url = String(hit.url || hit.link || "");
  const urlMatch = url.match(
    /(?:tiktok\.com\/@|instagram\.com\/)([a-zA-Z0-9._]+)/i,
  );
  if (urlMatch?.[1]) {
    const username = normalizeHandle(urlMatch[1]);
    const platform = platformFromUrl(url) || "tiktok";
    if (!isGenericHandle(username)) return { username, platform };
  }

  const blob = `${hit.title || ""} ${hit.snippet || ""} ${hit.content || ""}`;
  // e.g. Sarah | Wellness (@sarahwellness)
  const paren = blob.match(/\(@([a-zA-Z0-9._]{2,30})\)/);
  if (paren?.[1] && !isGenericHandle(paren[1])) {
    const platform =
      /instagram/i.test(blob) && !/tiktok/i.test(blob) ? "instagram" : "tiktok";
    return { username: normalizeHandle(paren[1]), platform };
  }

  HANDLE_IN_TEXT_RE.lastIndex = 0;
  for (const m of blob.matchAll(HANDLE_IN_TEXT_RE)) {
    const candidate = normalizeHandle(m[1] || m[2] || "");
    if (!isGenericHandle(candidate) && candidate.length >= 2) {
      const platform =
        /instagram/i.test(blob) && !/tiktok/i.test(url + blob)
          ? "instagram"
          : "tiktok";
      return { username: candidate, platform };
    }
  }

  return null;
}

function hitToCreator(
  hit: SearchHit,
  niche: string,
): DiscoveredCreator | null {
  const extracted = extractUsernameFromHit(hit);
  if (!extracted) return null;

  const { username, platform } = extracted;
  const combinedText = `${hit.title || ""} ${hit.snippet || ""} ${hit.content || ""}`;
  const email = extractValidEmail(combinedText) || "";
  const links = extractBioLinks(combinedText);
  const parsedFollowers = parseFollowerCount(combinedText);
  const followerEstimated = parsedFollowers == null;
  const followerCount = parsedFollowers ?? DEFAULT_FOLLOWER_ESTIMATE;

  const displayName =
    String(hit.title || "")
      .replace(/\s*[|·•\-–].*$/, "")
      .replace(/on TikTok.*/i, "")
      .replace(/on Instagram.*/i, "")
      .replace(/\(@[a-zA-Z0-9._]+\)/g, "")
      .replace(/^@/, "")
      .trim()
      .slice(0, 80) || username;

  console.log(
    `[Extracted Lead]: @${username} | Email: ${email || "none"} | platform=${platform}`,
  );

  return {
    platform,
    username,
    displayName,
    avatarUrl: "",
    followerCount,
    followerEstimated,
    bio: String(hit.snippet || hit.content || "").slice(0, 500),
    email,
    bioLink: links[0] || "",
    niche: niche.slice(0, 60),
  };
}

function creatorsFromHits(
  hits: SearchHit[],
  niche: string,
  limit: number,
): DiscoveredCreator[] {
  const byKey = new Map<string, DiscoveredCreator>();
  for (const hit of hits) {
    const c = hitToCreator(hit, niche);
    if (!c) continue;
    const key = `${c.platform}:${c.username}`;
    if (byKey.has(key)) {
      const prev = byKey.get(key)!;
      if (!prev.email && c.email) byKey.set(key, { ...prev, email: c.email });
      continue;
    }
    byKey.set(key, c);
    if (byKey.size >= Math.min(limit, MAX_CREATORS)) break;
  }
  return [...byKey.values()];
}

async function searchWithTavily(
  query: string,
  limit: number,
): Promise<DiscoveredCreator[]> {
  const apiKey = process.env.TAVILY_API_KEY?.trim();
  if (!apiKey) return [];

  const rawKeyword = sanitizeSearchKeyword(query);
  const tavilyQuery = buildCreatorBioSearchQuery(query);
  console.log(`[Discovery] Tavily query: "${tavilyQuery}"`);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SEARCH_TIMEOUT_MS);
  try {
    const tavilyRes = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: apiKey,
        query: tavilyQuery,
        include_domains: ["tiktok.com"],
        max_results: Math.min(Math.max(limit, 10), 15),
      }),
      signal: controller.signal,
    });

    if (!tavilyRes.ok) {
      const errText = (await tavilyRes.text()).slice(0, 500);
      console.error(`[Tavily Error ${tavilyRes.status}]:`, errText);
      throw new SearchRequestError(tavilyRes.status, errText, "Tavily");
    }

    const data = (await tavilyRes.json()) as {
      results?: Array<{
        title?: string;
        url?: string;
        content?: string;
        snippet?: string;
      }>;
    };

    const results = data.results || [];
    console.log(`[Tavily Response Count]:`, results.length);

    return creatorsFromHits(
      results.map((r) => ({
        title: r.title,
        url: r.url,
        snippet: r.content || r.snippet,
        content: r.content,
      })),
      rawKeyword,
      limit,
    );
  } finally {
    clearTimeout(timer);
  }
}

async function searchWithSerper(
  query: string,
  limit: number,
): Promise<DiscoveredCreator[]> {
  const key =
    process.env.SERPER_API_KEY?.trim() || process.env.SERPER_KEY?.trim() || "";
  if (!key) return [];

  const preferred = buildCreatorBioSearchQuery(query);
  const fallback = buildCreatorBioSearchQueryPlain(query);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SEARCH_TIMEOUT_MS);

  async function run(q: string) {
    console.log(`[Discovery] Serper query: "${q}"`);
    const serperRes = await fetch("https://google.serper.dev/search", {
      method: "POST",
      headers: {
        "X-API-KEY": key,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ q, num: 20 }),
      signal: controller.signal,
    });
    const errText = serperRes.ok ? "" : (await serperRes.text()).slice(0, 500);
    if (!serperRes.ok) {
      return { ok: false as const, status: serperRes.status, errText, data: null };
    }
    const data = (await serperRes.json()) as {
      organic?: SearchHit[];
    };
    return { ok: true as const, status: 200, errText: "", data };
  }

  try {
    let result = await run(preferred);
    if (
      !result.ok &&
      /pattern not allowed|free account/i.test(result.errText)
    ) {
      console.warn(
        `[Discovery] Serper rejected preferred query; retrying plain text`,
      );
      result = await run(fallback);
    }

    if (!result.ok || !result.data) {
      console.error(`[Serper Error ${result.status}]:`, result.errText);
      throw new SerperRequestError(result.status, result.errText);
    }

    const organic = result.data.organic || [];
    console.log("[Serper Response Count]:", organic.length);

    return creatorsFromHits(organic, sanitizeSearchKeyword(query), limit);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Dual-engine discovery: direct @handles → Tavily → Serper.
 */
export async function discoverCreatorsFromSearch(
  query: string,
  limit = 20,
): Promise<{ creators: DiscoveredCreator[]; source: string }> {
  console.log(`[Discovery] Initiating search for: "${query}"`);
  const sanitized = sanitizeSearchKeyword(query);
  console.log(`[Discovery] Sanitized query: "${sanitized}"`);

  const directHandles = parseDirectHandles(query);
  if (directHandles.length > 0) {
    const creators = await discoverFromDirectHandles(directHandles, limit);
    console.log(
      `[Discovery] Direct handles extracted ${creators.length} profiles`,
    );
    return { creators, source: "handles" };
  }

  const hasTavily = Boolean(process.env.TAVILY_API_KEY?.trim());
  const hasSerper = Boolean(
    process.env.SERPER_API_KEY?.trim() || process.env.SERPER_KEY?.trim(),
  );

  if (!hasTavily && !hasSerper) throw new MissingSearchKeyError();

  if (hasTavily) {
    try {
      const creators = await searchWithTavily(query, limit);
      console.log(
        `[Discovery] Tavily extracted ${creators.length} creator profiles`,
      );
      if (creators.length > 0) return { creators, source: "tavily" };
      console.log(`[Discovery] Tavily returned 0 profiles — trying Serper`);
    } catch (err) {
      if (!hasSerper) throw err;
      console.warn(
        `[Discovery] Tavily failed, falling back to Serper:`,
        err instanceof Error ? err.message : err,
      );
    }
  }

  if (hasSerper) {
    const creators = await searchWithSerper(query, limit);
    console.log(
      `[Discovery] Serper extracted ${creators.length} creator profiles`,
    );
    return { creators, source: "serper" };
  }

  return { creators: [], source: "none" };
}

/** @deprecated */
export async function discoverCreatorsFromSerper(
  query: string,
  limit = 20,
): Promise<DiscoveredCreator[]> {
  const { creators } = await discoverCreatorsFromSearch(query, limit);
  return creators;
}

export async function discoverCreators(opts: {
  query: string;
  platform: "tiktok" | "instagram";
  limit?: number;
  followerRange?: FollowerRange;
  niche?: string;
  requireEmail?: boolean;
  excludeUsernames?: Set<string> | string[];
}): Promise<{
  creators: DiscoveredCreator[];
  /** All matched profiles before email filter — for UI when emails are scarce */
  profilesFound: DiscoveredCreator[];
  withEmail: number;
  partial: boolean;
  timedOut: boolean;
  source?: string;
}> {
  const limit = Math.min(Math.max(opts.limit ?? 12, 1), MAX_CREATORS);
  const query = opts.query.trim();
  if (!query) {
    return {
      creators: [],
      profilesFound: [],
      withEmail: 0,
      partial: false,
      timedOut: false,
    };
  }

  const exclude = new Set(
    [...(opts.excludeUsernames || [])].map((u) => normalizeHandle(String(u))),
  );

  const { creators: found, source } = await discoverCreatorsFromSearch(
    query,
    limit,
  );

  const niche =
    opts.niche || query.replace(/#/g, " ").trim().slice(0, 60) || "lifestyle";

  let profilesFound = found
    .filter((c) => !exclude.has(c.username))
    .filter((c) => {
      if (opts.platform === "tiktok" && c.platform !== "tiktok") return false;
      if (opts.platform === "instagram" && c.platform !== "instagram")
        return false;
      return true;
    })
    .filter((c) => {
      if (c.followerEstimated) return true;
      return followerInRange(c.followerCount, opts.followerRange || "all-3k");
    })
    .map((c) => ({ ...c, niche }));

  profilesFound.sort((a, b) => {
    const emailScore = (x: DiscoveredCreator) => (x.email ? 1 : 0);
    return emailScore(b) - emailScore(a) || b.followerCount - a.followerCount;
  });

  const withEmail = profilesFound.filter((c) =>
    Boolean(c.email?.includes("@")),
  ).length;

  let creators = profilesFound;
  // Prefer emailed leads when filter is on, but never drop the rest of the batch
  if (opts.requireEmail) {
    const onlyEmail = profilesFound.filter((c) =>
      Boolean(c.email?.includes("@")),
    );
    if (onlyEmail.length > 0) {
      // Email matches first, then fill remaining slots with profiles lacking email
      const without = profilesFound.filter((c) => !c.email?.includes("@"));
      creators = [...onlyEmail, ...without];
    }
  }

  creators = creators.slice(0, limit);
  profilesFound = profilesFound.slice(0, limit);

  console.log(
    `[Discovery] Done — profiles=${profilesFound.length} withEmail=${withEmail} returning=${creators.length} source=${source}`,
  );

  return {
    creators,
    profilesFound,
    withEmail,
    partial: creators.length < limit,
    timedOut: false,
    source,
  };
}

export async function upsertCreatorLeads(opts: {
  workspaceId: string;
  projectId: string;
  creators: DiscoveredCreator[];
  skipExisting?: boolean;
}) {
  const existing = opts.skipExisting
    ? await prisma.creatorLead.findMany({
        where: { workspaceId: opts.workspaceId },
        select: { username: true, platform: true },
      })
    : [];
  const existingSet = new Set(
    existing.map((e) => `${e.platform}:${normalizeHandle(e.username)}`),
  );

  const settled = await Promise.allSettled(
    opts.creators.map(async (c) => {
      const key = `${c.platform}:${normalizeHandle(c.username)}`;
      if (opts.skipExisting && existingSet.has(key)) return null;

      return prisma.creatorLead.upsert({
        where: {
          workspaceId_platform_username: {
            workspaceId: opts.workspaceId,
            platform: c.platform,
            username: c.username,
          },
        },
        create: {
          workspaceId: opts.workspaceId,
          projectId: opts.projectId,
          platform: c.platform,
          username: c.username,
          displayName: c.displayName,
          avatarUrl: c.avatarUrl,
          followerCount: c.followerCount,
          bio: c.bio,
          email: c.email,
          bioLink: c.bioLink,
          niche: c.niche,
          status: "discovered",
        },
        update: {
          projectId: opts.projectId,
          displayName: c.displayName || undefined,
          avatarUrl: c.avatarUrl || undefined,
          followerCount: c.followerCount || undefined,
          bio: c.bio || undefined,
          email: c.email || undefined,
          bioLink: c.bioLink || undefined,
          niche: c.niche || undefined,
        },
      });
    }),
  );

  const leads = [];
  for (const r of settled) {
    if (r.status === "fulfilled" && r.value) leads.push(r.value);
    else if (r.status === "rejected") {
      logger.warn("api", "CreatorLead upsert failed", {
        message:
          r.reason instanceof Error ? r.reason.message : String(r.reason),
      });
    }
  }
  return leads;
}

export async function resolveWorkspaceIdForProject(projectId: string) {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { workspaceId: true, name: true, description: true },
  });
  if (!project) throw new Error("Project not found");
  return project;
}
