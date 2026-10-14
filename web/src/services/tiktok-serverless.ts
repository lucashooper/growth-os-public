import "server-only";

import {
  imageUrl,
  type TikTokVideo,
} from "@/services/tiktok-parse";
import { fetchTikTokOEmbed } from "@/services/tiktok-oembed";
import { logger } from "@/lib/logger";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

export function parseVideoIdsFromHtml(html: string): string[] {
  const ids = new Set<string>();
  for (const match of html.matchAll(/\/video\/(\d{15,21})/g)) {
    ids.add(match[1]);
  }
  return [...ids];
}

function mergeVideo(map: Map<string, TikTokVideo>, next: TikTokVideo) {
  const prev = map.get(next.id);
  if (!prev) {
    map.set(next.id, next);
    return;
  }
  map.set(next.id, {
    ...prev,
    ...next,
    coverUrl: next.coverUrl || prev.coverUrl,
    videoUrl: next.videoUrl || prev.videoUrl,
    imageUrls:
      (next.imageUrls?.length ? next.imageUrls : prev.imageUrls) || [],
    description: next.description || prev.description,
    views: next.views || prev.views,
    likes: next.likes || prev.likes,
  });
}

export async function hydrateVideosFromOembed(
  username: string,
  ids: string[],
): Promise<TikTokVideo[]> {
  const map = new Map<string, TikTokVideo>();
  const slice = ids.slice(0, 12);
  await Promise.all(
    slice.map(async (id) => {
      const shareUrl = `https://www.tiktok.com/@${username}/video/${id}`;
      const card = await fetchTikTokOEmbed(shareUrl);
      mergeVideo(map, {
        id,
        description: card?.hook || "",
        createTime: null,
        views: 0,
        likes: 0,
        comments: 0,
        shares: 0,
        saves: 0,
        coverUrl: card?.coverUrl || "",
        shareUrl,
      });
    }),
  );
  return [...map.values()];
}

function mapTikwmRow(
  row: Record<string, unknown>,
  username: string,
): TikTokVideo | null {
  const id = String(row.video_id || row.id || "");
  if (!id) return null;
  const images = Array.isArray(row.images)
    ? (row.images as unknown[]).map((u) => imageUrl(u)).filter(Boolean)
    : [];
  return {
    id,
    description: String(row.title || row.desc || ""),
    createTime: Number(row.create_time || 0) || null,
    views: Number(row.play_count || 0) || 0,
    likes: Number(row.digg_count || 0) || 0,
    comments: Number(row.comment_count || 0) || 0,
    shares: Number(row.share_count || 0) || 0,
    saves: Number(row.collect_count || 0) || 0,
    coverUrl:
      imageUrl(row.origin_cover) ||
      imageUrl(row.cover) ||
      imageUrl(row.originCover) ||
      images[0] ||
      "",
    videoUrl: String(row.play || row.wmplay || row.download || "") || undefined,
    imageUrls: images,
    shareUrl: `https://www.tiktok.com/@${username}/video/${id}`,
    authorHandle: username.replace(/^@/, ""),
  };
}

/** TikWM — free HTTP fallback (no Chromium). Tries several endpoints. */
export async function fetchVideosViaTikwm(
  username: string,
): Promise<TikTokVideo[]> {
  const handle = username.replace(/^@/, "");
  const endpoints = [
    `https://www.tikwm.com/api/user/posts?unique_id=${encodeURIComponent(handle)}&count=30`,
    `https://tikwm.com/api/user/posts?unique_id=${encodeURIComponent(handle)}&count=30`,
    `https://www.tikwm.com/api/user/posts?unique_id=${encodeURIComponent(handle)}&count=20&cursor=0`,
    // Some regions prefer user/info then posts via secUid — user/posts still best first try
    `https://www.tikwm.com/api/?unique_id=${encodeURIComponent(handle)}&count=20`,
  ];

  for (const url of endpoints) {
    try {
      const res = await fetch(url, {
        headers: {
          "User-Agent": UA,
          Accept: "application/json",
          Referer: "https://www.tikwm.com/",
        },
        signal: AbortSignal.timeout(18_000),
      });
      if (!res.ok) {
        logger.warn("sync", "TikWM HTTP error", {
          username: handle,
          status: res.status,
          url,
        });
        continue;
      }
      const json = (await res.json()) as {
        code?: number;
        data?: {
          videos?: Array<Record<string, unknown>>;
          aweme_list?: Array<Record<string, unknown>>;
        };
        msg?: string;
      };
      if (json.code !== 0 && json.code !== undefined) {
        logger.warn("sync", "TikWM non-zero code", {
          username: handle,
          code: json.code,
          msg: json.msg,
        });
        continue;
      }
      const rows =
        json.data?.videos ||
        json.data?.aweme_list ||
        (Array.isArray((json as { data?: unknown }).data)
          ? ((json as { data: Array<Record<string, unknown>> }).data)
          : []);
      const videos = rows
        .map((row) => mapTikwmRow(row, handle))
        .filter((v): v is TikTokVideo => Boolean(v));
      if (videos.length) {
        console.log(`[Sync] TikWM returned ${videos.length} videos for @${handle}`);
        return videos;
      }
    } catch (err) {
      logger.warn("sync", "TikWM fetch failed", {
        username: handle,
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }
  return [];
}

function collectImageUrls(item: Record<string, unknown>): string[] {
  const out: string[] = [];
  const push = (v: unknown) => {
    const u = imageUrl(v);
    if (u && !out.includes(u)) out.push(u);
  };

  for (const key of [
    "slideshowImageLinks",
    "imagePostImages",
    "images",
    "covers",
    "mediaUrls",
  ]) {
    const arr = item[key];
    if (Array.isArray(arr)) {
      for (const entry of arr) {
        if (typeof entry === "string") push(entry);
        else if (entry && typeof entry === "object") {
          const o = entry as Record<string, unknown>;
          push(o.downloadLink || o.url || o.link || o.cover);
        }
      }
    }
  }

  const imagePost = item.imagePost as Record<string, unknown> | undefined;
  if (imagePost && Array.isArray(imagePost.images)) {
    for (const img of imagePost.images) push(img);
  }

  return out;
}

/**
 * Apify TikTok profile scraper — tight sync timeout for Netlify (≤8s).
 * Actor default: clockworks/tiktok-profile-scraper
 */
export async function fetchVideosViaApify(
  username: string,
): Promise<TikTokVideo[]> {
  const token = process.env.APIFY_TOKEN?.trim();
  if (!token) return [];

  const actor =
    process.env.APIFY_TIKTOK_ACTOR?.trim() ||
    "clockworks~tiktok-profile-scraper";

  const handle = username.replace(/^@/, "");
  const started = Date.now();
  console.log(`[Sync] Calling Scraper Provider (Apify) for @${handle}…`);

  try {
    // timeout=25 + limit=15 — enough for Netlify background after() without 504 on the ACK
    const runRes = await fetch(
      `https://api.apify.com/v2/acts/${encodeURIComponent(actor)}/run-sync-get-dataset-items?token=${encodeURIComponent(token)}&timeout=25&limit=15`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          profiles: [`https://www.tiktok.com/@${handle}`],
          resultsPerPage: 15,
          maxProfilesPerQuery: 1,
          shouldDownloadVideos: false,
          shouldDownloadCovers: false,
          shouldDownloadSlideshowImages: false,
          profileSorting: "latest",
        }),
        signal: AbortSignal.timeout(10_000),
      },
    );
    if (!runRes.ok) {
      const body = (await runRes.text()).slice(0, 300);
      console.log(`[Sync] Apify HTTP ${runRes.status}: ${body}`);
      logger.warn("sync", "Apify run failed", {
        status: runRes.status,
        body,
      });
      return [];
    }
    const items = (await runRes.json()) as Array<Record<string, unknown>>;
    const out: TikTokVideo[] = [];
    for (const item of items.slice(0, 10)) {
      const id = String(
        item.id || item.videoId || item.awemeId || item.aweme_id || "",
      );
      if (!id || id === "undefined") continue;
      const stats = (item.stats || item.statistics || {}) as Record<
        string,
        unknown
      >;
      const video = (item.video || item.videoMeta || {}) as Record<
        string,
        unknown
      >;
      const imageUrls = collectImageUrls(item);
      const cover =
        imageUrl(video.cover) ||
        imageUrl(item.coverUrl) ||
        imageUrl(item.covers) ||
        imageUrl(item.originCover) ||
        imageUrls[0] ||
        "";
      const mediaUrls = Array.isArray(item.mediaUrls)
        ? (item.mediaUrls as unknown[])
        : [];
      const videoUrl =
        String(
          item.videoUrl ||
            item.downloadAddr ||
            video.downloadAddr ||
            video.playAddr ||
            mediaUrls[0] ||
            "",
        ) || undefined;

      const authorMeta = (item.authorMeta || item.author || {}) as Record<
        string,
        unknown
      >;
      const authorHandle = String(
        authorMeta.name || authorMeta.nickName || authorMeta.uniqueId || handle,
      ).replace(/^@/, "");
      out.push({
        id,
        description: String(item.text || item.desc || item.title || ""),
        createTime:
          Number(item.createTime || item.createTimeISO || 0) || null,
        views: Number(stats.playCount ?? item.playCount ?? 0) || 0,
        likes: Number(stats.diggCount ?? item.diggCount ?? 0) || 0,
        comments: Number(stats.commentCount ?? item.commentCount ?? 0) || 0,
        shares: Number(stats.shareCount ?? item.shareCount ?? 0) || 0,
        saves: Number(stats.collectCount ?? 0) || 0,
        coverUrl: cover,
        videoUrl,
        imageUrls: imageUrls.slice(0, 8),
        authorHandle,
        shareUrl:
          String(item.webVideoUrl || item.url || "") ||
          `https://www.tiktok.com/@${authorHandle || handle}/video/${id}`,
      });
    }
    console.log(
      `[Sync] Scraper responded with ${out.length} posts in ${Date.now() - started}ms (apify)`,
    );
    logger.info("sync", "Apify returned videos", {
      username: handle,
      count: out.length,
      ms: Date.now() - started,
    });
    return out;
  } catch (err) {
    console.log(
      `[Sync] Apify failed in ${Date.now() - started}ms: ${err instanceof Error ? err.message : String(err)}`,
    );
    logger.warn("sync", "Apify fetch failed", {
      message: err instanceof Error ? err.message : String(err),
    });
    return [];
  }
}

/**
 * Fast path first (TikWM), then tight Apify if configured.
 * Avoids Netlify 504 from long Apify sync runs.
 */
export async function fetchVideosExternal(
  username: string,
): Promise<{ videos: TikTokVideo[]; source: string }> {
  const handle = username.replace(/^@/, "");
  console.log(`[Sync] Calling Scraper Provider (TikWM) for @${handle}…`);
  const tikwmStarted = Date.now();
  const tikwm = await fetchVideosViaTikwm(username);
  if (tikwm.length) {
    console.log(
      `[Sync] Scraper responded with ${tikwm.length} posts in ${Date.now() - tikwmStarted}ms (tikwm)`,
    );
    return { videos: tikwm.slice(0, 10), source: "tikwm" };
  }
  console.log(
    `[Sync] TikWM empty after ${Date.now() - tikwmStarted}ms — trying Apify fallback`,
  );

  if (process.env.APIFY_TOKEN?.trim()) {
    const apify = await fetchVideosViaApify(username);
    if (apify.length) return { videos: apify, source: "apify" };
    return { videos: [], source: "apify-empty" };
  }

  return { videos: [], source: "none" };
}

export function mergeVideoLists(...lists: TikTokVideo[][]): TikTokVideo[] {
  const map = new Map<string, TikTokVideo>();
  for (const list of lists) {
    for (const video of list) mergeVideo(map, video);
  }
  return [...map.values()].sort(
    (a, b) => (b.createTime ?? 0) - (a.createTime ?? 0),
  );
}

export function isServerlessRuntime() {
  return (
    process.env.NETLIFY === "true" ||
    Boolean(process.env.AWS_LAMBDA_FUNCTION_NAME) ||
    Boolean(process.env.VERCEL) ||
    process.cwd().startsWith("/var/task")
  );
}
