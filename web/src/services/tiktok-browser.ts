import "server-only";

import type { TikTokProfile, TikTokVideo } from "@/services/tiktok-parse";
import { imageUrl, parseVideosFromBlobs } from "@/services/tiktok-parse";
import {
  canUsePlaywright,
  getSharedBrowser,
  PlaywrightUnavailableError,
} from "@/services/intel/browser-pool";

export type BrowserSyncResult = {
  profile: TikTokProfile | null;
  videos: TikTokVideo[];
  itemListResponses: number;
  error?: string;
  skipped?: boolean;
};

/** @deprecated use getSharedBrowser from intel/browser-pool */
async function getBrowser() {
  return getSharedBrowser();
}

function mapItem(item: Record<string, unknown>, username: string): TikTokVideo | null {
  const id = String(item.id || item.aweme_id || "");
  if (!id || id.length < 5) return null;
  const stats = (item.stats || item.statistics || {}) as Record<string, unknown>;
  const video = (item.video || {}) as Record<string, unknown>;
  const cover =
    imageUrl(video.cover) ||
    imageUrl(video.originCover) ||
    imageUrl(video.dynamicCover) ||
    imageUrl(item.cover);
  const createRaw = Number(item.createTime || item.create_time || 0) || null;
  const createTime =
    createRaw && createRaw > 1e12 ? Math.floor(createRaw / 1000) : createRaw;

  return {
    id,
    description: String(item.desc || item.description || item.title || ""),
    createTime,
    views: Number(stats.playCount ?? stats.play_count ?? 0) || 0,
    likes: Number(stats.diggCount ?? stats.digg_count ?? 0) || 0,
    comments: Number(stats.commentCount ?? stats.comment_count ?? 0) || 0,
    shares: Number(stats.shareCount ?? stats.share_count ?? 0) || 0,
    saves: Number(stats.collectCount ?? stats.collect_count ?? 0) || 0,
    coverUrl: cover,
    shareUrl: `https://www.tiktok.com/@${username}/video/${id}`,
  };
}

function profileFromUniversal(
  data: unknown,
  username: string,
): TikTokProfile | null {
  const j = data as {
    __DEFAULT_SCOPE__?: {
      "webapp.user-detail"?: {
        userInfo?: {
          user?: Record<string, unknown>;
          stats?: Record<string, unknown>;
        };
      };
    };
  };
  const ui = j?.__DEFAULT_SCOPE__?.["webapp.user-detail"]?.userInfo;
  if (!ui?.user) return null;
  const user = ui.user;
  const stats = ui.stats || {};
  return {
    username: String(user.uniqueId || username),
    nickname: String(user.nickname || username),
    avatarUrl: String(
      user.avatarLarger || user.avatarMedium || user.avatarThumb || "",
    ),
    bio: String(user.signature || ""),
    secUid: String(user.secUid || ""),
    followers: Number(stats.followerCount ?? 0) || 0,
    following: Number(stats.followingCount ?? 0) || 0,
    hearts: Number(stats.heart ?? stats.heartCount ?? 0) || 0,
    videoCount: Number(stats.videoCount ?? 0) || 0,
  };
}

/**
 * Load a TikTok profile in Chromium and capture item_list XHR videos.
 * Plain fetch cannot do this — TikTok requires a signed browser session.
 */
export async function fetchTikTokViaBrowser(
  username: string,
  options?: { scrollRounds?: number; timeoutMs?: number },
): Promise<BrowserSyncResult> {
  const clean = username.replace(/^@/, "").trim();
  const scrollRounds = options?.scrollRounds ?? 5;
  const timeoutMs = options?.timeoutMs ?? 45000;
  const videos = new Map<string, TikTokVideo>();
  let itemListResponses = 0;
  let profile: TikTokProfile | null = null;

  if (!canUsePlaywright()) {
    return {
      profile: null,
      videos: [],
      itemListResponses: 0,
      skipped: true,
      error:
        "Browser sync skipped on serverless (Playwright/Chromium unavailable).",
    };
  }

  let context: Awaited<
    ReturnType<Awaited<ReturnType<typeof getSharedBrowser>>["newContext"]>
  > | null = null;

  try {
    const browser = await getBrowser();
    context = await browser.newContext({
      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
      locale: "en-US",
      viewport: { width: 1280, height: 900 },
    });
    const page = await context.newPage();

    page.on("response", async (response) => {
      const url = response.url();
      const isVideoList =
        url.includes("/api/post/item_list/") ||
        url.includes("/api/creator/item_list/") ||
        url.includes("/api/repost/item_list/") ||
        url.includes("aweme/v1/web/aweme/post");
      if (!isVideoList) return;
      try {
        const json = (await response.json()) as {
          itemList?: Record<string, unknown>[];
          aweme_list?: Record<string, unknown>[];
          item_list?: Record<string, unknown>[];
        };
        itemListResponses += 1;
        const items =
          json.itemList || json.aweme_list || json.item_list || [];
        for (const item of items) {
          const mapped = mapItem(item, clean);
          if (mapped) videos.set(mapped.id, mapped);
        }
      } catch {
        /* ignore parse errors */
      }
    });

    const firstItemList = page
      .waitForResponse(
        (r) =>
          (r.url().includes("/item_list/") ||
            r.url().includes("aweme/post")) &&
          r.status() === 200,
        { timeout: 18000 },
      )
      .catch(() => null);

    await page.goto(`https://www.tiktok.com/@${clean}`, {
      waitUntil: "domcontentloaded",
      timeout: timeoutMs,
    });
    await firstItemList;
    await page.waitForTimeout(1500);

    profile = await page.evaluate((uname) => {
      const el = document.querySelector("#__UNIVERSAL_DATA_FOR_REHYDRATION__");
      if (!el?.textContent) return null;
      try {
        const j = JSON.parse(el.textContent) as {
          __DEFAULT_SCOPE__?: {
            "webapp.user-detail"?: {
              userInfo?: {
                user?: Record<string, unknown>;
                stats?: Record<string, unknown>;
              };
            };
          };
        };
        const ui = j?.__DEFAULT_SCOPE__?.["webapp.user-detail"]?.userInfo;
        if (!ui?.user) return null;
        const user = ui.user;
        const stats = ui.stats || {};
        return {
          username: String(user.uniqueId || uname),
          nickname: String(user.nickname || uname),
          avatarUrl: String(
            user.avatarLarger || user.avatarMedium || user.avatarThumb || "",
          ),
          bio: String(user.signature || ""),
          secUid: String(user.secUid || ""),
          followers: Number(stats.followerCount ?? 0) || 0,
          following: Number(stats.followingCount ?? 0) || 0,
          hearts: Number(stats.heart ?? stats.heartCount ?? 0) || 0,
          videoCount: Number(stats.videoCount ?? 0) || 0,
        };
      } catch {
        return null;
      }
    }, clean);

    // Fallback if evaluate shape differs
    if (!profile) {
      const raw = await page
        .locator("#__UNIVERSAL_DATA_FOR_REHYDRATION__")
        .textContent({ timeout: 2000 })
        .catch(() => null);
      if (raw) {
        try {
          profile = profileFromUniversal(JSON.parse(raw), clean);
        } catch {
          /* ignore */
        }
      }
    }

    for (let i = 0; i < scrollRounds; i++) {
      await page.mouse.wheel(0, 2600);
      await page.waitForTimeout(1400);
      if (videos.size >= 60) break;
    }

    // Pull videos embedded in the hydration blob (works when XHR is blocked)
    if (videos.size === 0) {
      const raw = await page
        .locator("#__UNIVERSAL_DATA_FOR_REHYDRATION__")
        .textContent({ timeout: 2000 })
        .catch(() => null);
      if (raw) {
        try {
          for (const v of parseVideosFromBlobs([JSON.parse(raw)], clean)) {
            videos.set(v.id, v);
          }
        } catch {
          /* ignore */
        }
      }
    }

    // Last resort: scrape the visible video grid
    if (videos.size === 0) {
      const fromDom = await page.evaluate((uname) => {
        const out: Array<{ id: string; coverUrl: string; shareUrl: string }> = [];
        const seen = new Set<string>();
        for (const a of Array.from(document.querySelectorAll("a[href*='/video/']"))) {
          const href = (a as HTMLAnchorElement).href || "";
          const match = href.match(/\/video\/(\d+)/);
          if (!match || seen.has(match[1])) continue;
          seen.add(match[1]);
          const img = a.querySelector("img");
          const src =
            img?.getAttribute("src") ||
            img?.getAttribute("data-src") ||
            "";
          out.push({
            id: match[1],
            coverUrl: src,
            shareUrl: `https://www.tiktok.com/@${uname}/video/${match[1]}`,
          });
        }
        return out;
      }, clean);
      for (const row of fromDom) {
        if (!videos.has(row.id)) {
          videos.set(row.id, {
            id: row.id,
            description: "",
            createTime: null,
            views: 0,
            likes: 0,
            comments: 0,
            shares: 0,
            saves: 0,
            coverUrl: row.coverUrl,
            shareUrl: row.shareUrl,
          });
        }
      }
    }

    await page.waitForTimeout(400);

    return {
      profile,
      videos: [...videos.values()].sort(
        (a, b) => (b.createTime ?? 0) - (a.createTime ?? 0),
      ),
      itemListResponses,
    };
  } catch (err) {
    const message =
      err instanceof PlaywrightUnavailableError
        ? err.message
        : err instanceof Error
          ? err.message
          : String(err);
    return {
      profile,
      videos: [...videos.values()],
      itemListResponses,
      error: message,
      skipped: err instanceof PlaywrightUnavailableError,
    };
  } finally {
    await context?.close().catch(() => undefined);
  }
}
