import "server-only";

import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import {
  extractEmbeddedJsonBlobs,
  filterVideosForAccount,
  parseProfileFromBlobs,
  parseProfileFromHtmlRegex,
  parseVideosFromBlobs,
  type TikTokProfile,
  type TikTokVideo,
} from "@/services/tiktok-parse";
import { canUsePlaywright } from "@/services/intel/playwright-env";
import { normalizeTikTokUsername } from "@/lib/tiktok-username";
import { persistDurableCover } from "@/services/persist-durable-cover";
import { isOwnedAccountPost } from "@/lib/owned-posts";
import {
  fetchVideosExternal,
  hydrateVideosFromOembed,
  isServerlessRuntime,
  mergeVideoLists,
  parseVideoIdsFromHtml,
} from "@/services/tiktok-serverless";

export type SyncStep = {
  ts: string;
  step: string;
  status: "ok" | "warn" | "error";
  message: string;
  raw?: unknown;
};

type SyncResult = {
  success: boolean;
  logId: string;
  followers: number | null;
  videosSynced: number;
  steps: SyncStep[];
  error?: string;
  rawValues?: Record<string, unknown>;
};

const BROWSER_HEADERS: Record<string, string> = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
  Accept:
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
  "Cache-Control": "no-cache",
  Pragma: "no-cache",
  "Sec-Fetch-Dest": "document",
  "Sec-Fetch-Mode": "navigate",
  "Sec-Fetch-Site": "none",
  "Upgrade-Insecure-Requests": "1",
};

function step(
  steps: SyncStep[],
  name: string,
  status: SyncStep["status"],
  message: string,
  raw?: unknown,
) {
  const entry: SyncStep = {
    ts: new Date().toISOString(),
    step: name,
    status,
    message,
    raw,
  };
  steps.push(entry);
  const level = status === "error" ? "error" : status === "warn" ? "warn" : "info";
  logger[level]("sync", `[${name}] ${message}`, raw);
  return entry;
}

async function persistSteps(logId: string, steps: SyncStep[]) {
  await prisma.syncLog.update({
    where: { id: logId },
    data: { stepsJson: JSON.stringify(steps) },
  });
}

async function finish(
  logId: string,
  accountId: string,
  steps: SyncStep[],
  success: boolean,
  error?: string,
  rawValues?: Record<string, unknown>,
) {
  step(
    steps,
    "finish",
    success ? "ok" : "error",
    success ? "Sync finished" : `Sync finished with errors: ${error}`,
  );
  await prisma.syncLog.update({
    where: { id: logId },
    data: {
      status: success ? "success" : "failed",
      finishedAt: new Date(),
      stepsJson: JSON.stringify(steps),
      error: error ?? null,
      rawResponse: rawValues ? JSON.stringify(rawValues).slice(0, 500_000) : null,
    },
  });
  logger.info("sync", `Sync ${success ? "succeeded" : "failed"} for account ${accountId}`, {
    logId,
    error,
  });
}

async function fetchItemList(
  secUid: string,
  username: string,
  steps: SyncStep[],
  logId: string,
): Promise<TikTokVideo[]> {
  if (!secUid) {
    step(steps, "fetch_item_list", "warn", "No secUid — cannot call item_list API");
    await persistSteps(logId, steps);
    return [];
  }

  const url = new URL("https://www.tiktok.com/api/post/item_list/");
  url.searchParams.set("aid", "1988");
  url.searchParams.set("count", "30");
  url.searchParams.set("cursor", "0");
  url.searchParams.set("secUid", secUid);

  step(steps, "fetch_item_list", "ok", `Requesting item_list for secUid…`, {
    secUidPreview: secUid.slice(0, 16) + "…",
  });
  await persistSteps(logId, steps);

  try {
    const res = await fetch(url.toString(), {
      headers: {
        ...BROWSER_HEADERS,
        Accept: "application/json",
        Referer: `https://www.tiktok.com/@${username}`,
      },
      signal: AbortSignal.timeout(20000),
    });
    const text = await res.text();
    step(
      steps,
      "fetch_item_list_response",
      res.ok ? "ok" : "warn",
      `HTTP ${res.status}`,
      { status: res.status, bytes: text.length, preview: text.slice(0, 240) },
    );
    await persistSteps(logId, steps);

    if (!res.ok) {
      step(
        steps,
        "fetch_item_list",
        "warn",
        "item_list blocked or failed — will rely on videos embedded in profile HTML",
      );
      return [];
    }

    const json = JSON.parse(text) as unknown;
    const videos = parseVideosFromBlobs([json], username);
    step(steps, "parse_item_list", "ok", `Parsed ${videos.length} videos from item_list`, {
      ids: videos.slice(0, 5).map((v) => v.id),
    });
    await persistSteps(logId, steps);
    return videos;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    step(steps, "fetch_item_list", "warn", `item_list error: ${msg}`);
    await persistSteps(logId, steps);
    return [];
  }
}

async function upsertVideos(
  accountId: string,
  projectId: string,
  username: string,
  videos: TikTokVideo[],
  steps: SyncStep[],
  logId: string,
): Promise<number> {
  const owned = filterVideosForAccount(videos, username);
  if (owned.length < videos.length) {
    step(
      steps,
      "filter_owned_videos",
      "ok",
      `Kept ${owned.length}/${videos.length} videos authored by @${username}`,
    );
    await persistSteps(logId, steps);
  }

  if (owned.length === 0) {
    step(steps, "persist_videos", "warn", "No videos to persist");
    await persistSteps(logId, steps);
    return 0;
  }

  let upserted = 0;
  let durableCovers = 0;
  // Keep Netlify under gateway timeout — fewer posts + covers per sync
  const batchLimit = isServerlessRuntime() ? 10 : 24;
  const batch = owned.slice(0, batchLimit);
  console.log(`[Sync] Caching covers to Supabase… (${batch.length} posts)`);

  for (const v of batch) {
    const hook =
      v.description.trim().split("\n")[0]?.slice(0, 120) ||
      `TikTok video ${v.id}`;
    const shareHandle = v.authorHandle || username;
    const shareUrl =
      v.shareUrl && !v.shareUrl.includes("@/")
        ? v.shareUrl
        : `https://www.tiktok.com/@${shareHandle}/video/${v.id}`;

    const existing = await prisma.post.findFirst({
      where: { accountId, externalId: v.id },
    });

    const durableCover = await persistDurableCover(
      accountId,
      v.id,
      v.coverUrl || v.imageUrls?.[0],
      existing?.coverUrl,
    );
    if (durableCover) durableCovers++;

    // Persist photo-carousel slides (cap on serverless)
    const durableSlides: string[] = [];
    const rawImages = (v.imageUrls || []).slice(
      0,
      isServerlessRuntime() ? 3 : 10,
    );
    for (let i = 0; i < rawImages.length; i++) {
      const durable = await persistDurableCover(
        accountId,
        `${v.id}-slide-${i}`,
        rawImages[i],
        undefined,
      );
      if (durable) durableSlides.push(durable);
    }
    if (durableCover && !durableSlides.includes(durableCover)) {
      durableSlides.unshift(durableCover);
    }

    const coverUrl = durableCover || durableSlides[0] || "";
    let meta: Record<string, unknown> = {};
    try {
      meta = JSON.parse(existing?.metaJson || "{}") as Record<string, unknown>;
    } catch {
      meta = {};
    }
    if (v.videoUrl) meta.sourceVideoUrl = v.videoUrl;
    if (durableSlides.length) meta.imagePack = durableSlides;
    if (v.authorHandle) meta.authorHandle = v.authorHandle;

    const data = {
      projectId,
      accountId,
      externalId: v.id,
      hook,
      caption: v.description,
      slidesJson: JSON.stringify(
        durableSlides.length
          ? durableSlides
          : coverUrl
            ? [coverUrl]
            : [hook],
      ),
      metaJson: JSON.stringify(meta),
      status: "published" as const,
      theme: "tiktok-sync",
      coverUrl,
      shareUrl,
      views: v.views,
      likes: v.likes,
      comments: v.comments,
      saves: v.saves,
      shares: v.shares,
      downloads: 0,
      ctr: v.views > 0 ? Number(((v.likes / v.views) * 100).toFixed(2)) : 0,
      publishedAt: v.createTime
        ? new Date(
            v.createTime > 1e12 ? v.createTime : v.createTime * 1000,
          )
        : new Date(),
    };

    if (existing) {
      await prisma.post.update({ where: { id: existing.id }, data });
    } else {
      await prisma.post.create({ data });
    }
    upserted++;
  }

  console.log(`[Sync] Saved ${upserted} posts to Prisma DB (${durableCovers} covers)`);
  step(
    steps,
    "persist_videos",
    "ok",
    `Upserted ${upserted} posts · ${durableCovers} durable covers cached`,
    {
      sample: batch.slice(0, 3).map((v) => ({
        id: v.id,
        views: v.views,
        likes: v.likes,
        desc: v.description.slice(0, 60),
      })),
    },
  );
  await persistSteps(logId, steps);

  const accountFollowers =
    (
      await prisma.connectedAccount.findUnique({
        where: { id: accountId },
        select: { followers: true },
      })
    )?.followers ?? 0;
  const published = await prisma.post.findMany({
    where: { accountId, theme: "tiktok-sync", status: "published" },
    select: {
      id: true,
      accountId: true,
      theme: true,
      shareUrl: true,
      views: true,
      metaJson: true,
    },
  });
  const foreignIds = published
    .filter(
      (p) =>
        !isOwnedAccountPost(p, {
          accountIds: [accountId],
          usernames: [username],
          followersByAccount: { [accountId]: accountFollowers },
        }),
    )
    .map((p) => p.id);
  if (foreignIds.length) {
    await prisma.post.updateMany({
      where: { id: { in: foreignIds } },
      data: { theme: "tiktok-foreign" },
    });
    step(
      steps,
      "quarantine_foreign",
      "ok",
      `Excluded ${foreignIds.length} videos that are not from @${username}`,
    );
    await persistSteps(logId, steps);
  }

  return upserted;
}

async function upsertDailyMetrics(
  projectId: string,
  totals: { views: number; likes: number; comments: number; followers: number },
  steps: SyncStep[],
  logId: string,
) {
  const day = new Date();
  day.setUTCHours(0, 0, 0, 0);

  await prisma.dailyMetric.upsert({
    where: {
      projectId_date: { projectId, date: day },
    },
    create: {
      projectId,
      date: day,
      views: totals.views,
      likes: totals.likes,
      comments: totals.comments,
      followers: totals.followers,
      downloads: 0,
    },
    update: {
      views: totals.views,
      likes: totals.likes,
      comments: totals.comments,
      followers: totals.followers,
    },
  });

  step(steps, "persist_daily_metrics", "ok", "Updated today's DailyMetric snapshot", totals);
  await persistSteps(logId, steps);
}

/**
 * Full username-only TikTok sync:
 * profile (avatar, bio, stats) + videos (views/likes/comments) → DB.
 */
export async function syncTikTokAccount(
  accountId: string,
  attempt = 1,
): Promise<SyncResult> {
  const account = await prisma.connectedAccount.findUnique({
    where: { id: accountId },
  });
  if (!account) throw new Error(`Account ${accountId} not found`);
  if (account.platform !== "tiktok") {
    throw new Error(`Sync not implemented for platform: ${account.platform}`);
  }

  const steps: SyncStep[] = [];
  const log = await prisma.syncLog.create({
    data: { accountId, status: "running", attempt, stepsJson: "[]" },
  });

  logger.info("sync", `Starting full TikTok sync for @${account.username}`, {
    accountId,
    attempt,
    logId: log.id,
  });
  console.log(`[Sync] Starting sync for account: @${account.username}`);

  step(steps, "start", "ok", `Full sync started for @${account.username}`, { attempt });
  await persistSteps(log.id, steps);

  const username = normalizeTikTokUsername(account.username);
  if (!username) {
    step(steps, "validate_username", "error", "Username is empty");
    await finish(log.id, accountId, steps, false, "Username is empty");
    return {
      success: false,
      logId: log.id,
      followers: null,
      videosSynced: 0,
      steps,
      error: "Username is empty",
    };
  }
  if (username !== account.username) {
    await prisma.connectedAccount.update({
      where: { id: accountId },
      data: { username },
    });
  }
  step(steps, "validate_username", "ok", `Username normalised to "${username}"`);
  await persistSteps(log.id, steps);

  const rawValues: Record<string, unknown> = {};
  let profile: TikTokProfile | null = null;
  let videos: TikTokVideo[] = [];
  let parseError: string | null = null;

  // Serverless fast-path: scrape videos before slow HTML/oEmbed so we beat Netlify 504
  if (isServerlessRuntime()) {
    try {
      console.log(`[Sync] Calling Scraper Provider (TikWM / Apify)…`);
      const external = await fetchVideosExternal(username);
      if (external.videos.length) {
        videos = external.videos;
        step(
          steps,
          "external_video_list",
          "ok",
          `Loaded ${external.videos.length} videos via ${external.source}`,
        );
      } else {
        step(
          steps,
          "external_video_list",
          "warn",
          "TikWM/Apify returned no videos",
        );
      }
    } catch (err) {
      step(
        steps,
        "external_video_list",
        "warn",
        `External video list failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
    await persistSteps(log.id, steps);
  }

  // 1) oEmbed — lightweight existence check + author name
  try {
    step(steps, "fetch_oembed", "ok", "Requesting TikTok oEmbed…");
    await persistSteps(log.id, steps);
    const oembedUrl = `https://www.tiktok.com/oembed?url=${encodeURIComponent(`https://www.tiktok.com/@${username}`)}`;
    const oembedRes = await fetch(oembedUrl, {
      headers: { "User-Agent": BROWSER_HEADERS["User-Agent"] },
      signal: AbortSignal.timeout(isServerlessRuntime() ? 5000 : 15000),
    });
    const oembedText = await oembedRes.text();
    step(steps, "fetch_oembed_response", oembedRes.ok ? "ok" : "warn", `HTTP ${oembedRes.status}`, {
      bodyPreview: oembedText.slice(0, 400),
    });
    if (oembedRes.ok) {
      const oembed = JSON.parse(oembedText) as Record<string, unknown>;
      rawValues.oembed = oembed;
      step(steps, "parse_oembed", "ok", "oEmbed OK — profile exists", {
        author_name: oembed.author_name,
        thumbnail_url: oembed.thumbnail_url,
      });
      if (typeof oembed.thumbnail_url === "string" && oembed.thumbnail_url) {
        // thumbnail is often a video cover, not avatar — keep as fallback only
        rawValues.oembedThumbnail = oembed.thumbnail_url;
      }
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    step(steps, "fetch_oembed", "warn", `oEmbed failed: ${msg}`);
  }
  await persistSteps(log.id, steps);

  // 2) Profile HTML — skip heavy HTML when serverless already has videos
  const skipHeavyHtml = isServerlessRuntime() && videos.length > 0;
  if (skipHeavyHtml) {
    step(
      steps,
      "fetch_profile_html",
      "ok",
      "Skipped heavy HTML scrape (serverless already has external videos)",
    );
    await persistSteps(log.id, steps);
  } else {
    try {
    step(steps, "fetch_profile_html", "ok", `Fetching https://www.tiktok.com/@${username}`);
    await persistSteps(log.id, steps);

    const htmlRes = await fetch(`https://www.tiktok.com/@${username}`, {
      headers: BROWSER_HEADERS,
      signal: AbortSignal.timeout(isServerlessRuntime() ? 12000 : 25000),
      redirect: "follow",
    });
    const html = await htmlRes.text();
    step(steps, "fetch_profile_html_response", htmlRes.ok ? "ok" : "warn", `HTTP ${htmlRes.status}`, {
      bytes: html.length,
      hasUniversal: html.includes("__UNIVERSAL_DATA_FOR_REHYDRATION__"),
      hasSigi: html.includes("SIGI_STATE"),
    });
    await persistSteps(log.id, steps);

    if (!htmlRes.ok) {
      parseError = `Profile HTML HTTP ${htmlRes.status}`;
    } else {
      const blobs = extractEmbeddedJsonBlobs(html);
      step(steps, "extract_embedded_json", blobs.length ? "ok" : "warn", `Found ${blobs.length} JSON blob(s)`, {
        blobTypes: blobs.map((b) =>
          b && typeof b === "object" ? Object.keys(b as object).slice(0, 8) : typeof b,
        ),
      });
      await persistSteps(log.id, steps);

      profile = parseProfileFromBlobs(blobs, username);
      if (!profile) {
        const regexProfile = parseProfileFromHtmlRegex(html, username);
        if (regexProfile.followers !== undefined || regexProfile.avatarUrl) {
          profile = {
            username,
            nickname: regexProfile.nickname || account.nickname || username,
            avatarUrl: regexProfile.avatarUrl || "",
            bio: "",
            secUid: regexProfile.secUid || "",
            followers: regexProfile.followers ?? 0,
            following: regexProfile.following ?? 0,
            hearts: regexProfile.hearts ?? 0,
            videoCount: regexProfile.videoCount ?? 0,
          };
          step(steps, "parse_profile_regex", "ok", "Profile parsed via regex fallback", profile);
        } else {
          step(
            steps,
            "parse_profile",
            "warn",
            "Could not parse structured profile. TikTok may have served a bot-challenge page.",
            { htmlPreview: html.slice(0, 300) },
          );
        }
      } else {
        step(steps, "parse_profile", "ok", "Profile parsed from embedded JSON", {
          nickname: profile.nickname,
          followers: profile.followers,
          following: profile.following,
          hearts: profile.hearts,
          videoCount: profile.videoCount,
          hasAvatar: Boolean(profile.avatarUrl),
          hasSecUid: Boolean(profile.secUid),
        });
      }

      videos = parseVideosFromBlobs(blobs, username);
      const htmlIds = parseVideoIdsFromHtml(html);
      rawValues.htmlVideoIds = htmlIds;
      if (videos.length === 0 && htmlIds.length) {
        const fromOembed = await hydrateVideosFromOembed(username, htmlIds);
        videos = mergeVideoLists(videos, fromOembed);
        step(
          steps,
          "hydrate_oembed_videos",
          fromOembed.length ? "ok" : "warn",
          `Hydrated ${fromOembed.length} videos from oEmbed (${htmlIds.length} ids in HTML)`,
        );
      }
      step(steps, "parse_videos_html", videos.length ? "ok" : "warn", `Found ${videos.length} videos in profile HTML`, {
        top: videos.slice(0, 3).map((v) => ({
          id: v.id,
          views: v.views,
          likes: v.likes,
        })),
      });
      rawValues.profile = profile;
      rawValues.htmlVideoCount = videos.length;
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    step(steps, "fetch_profile_html", "error", `HTML fetch failed: ${msg}`);
    parseError = msg;
  }
  }
  await persistSteps(log.id, steps);

  // Ensure profile (followers + avatar) — never skip public scrape when missing.
  // Official OAuth user.info lacks follower_count; fall back to public HTML.
  if (!profile || !profile.followers || !profile.avatarUrl) {
    try {
      step(
        steps,
        "public_profile_fallback",
        "ok",
        "Fetching public profile for followers/avatar…",
      );
      await persistSteps(log.id, steps);
      const htmlRes = await fetch(`https://www.tiktok.com/@${username}`, {
        headers: BROWSER_HEADERS,
        signal: AbortSignal.timeout(isServerlessRuntime() ? 10000 : 20000),
        redirect: "follow",
      });
      const html = await htmlRes.text();
      console.log(`[TikTok Sync] Raw response: HTTP ${htmlRes.status} bytes=${html.length}`);
      const blobs = extractEmbeddedJsonBlobs(html);
      let scraped = parseProfileFromBlobs(blobs, username);
      if (!scraped) {
        const regexProfile = parseProfileFromHtmlRegex(html, username);
        if (
          regexProfile.followers !== undefined ||
          regexProfile.avatarUrl ||
          regexProfile.nickname
        ) {
          scraped = {
            username,
            nickname: regexProfile.nickname || account.nickname || username,
            avatarUrl: regexProfile.avatarUrl || "",
            bio: "",
            secUid: regexProfile.secUid || "",
            followers: regexProfile.followers ?? 0,
            following: regexProfile.following ?? 0,
            hearts: regexProfile.hearts ?? 0,
            videoCount: regexProfile.videoCount ?? 0,
          };
        }
      }
      if (scraped) {
        console.log(
          `[TikTok Sync] follower_count=${scraped.followers} avatar_url=${scraped.avatarUrl ? "yes" : "no"}`,
        );
        logger.info("sync", "[TikTok Sync] Public profile scrape", {
          follower_count: scraped.followers,
          avatar_url: scraped.avatarUrl,
          nickname: scraped.nickname,
        });
        profile = {
          ...(profile || scraped),
          ...scraped,
          avatarUrl: scraped.avatarUrl || profile?.avatarUrl || "",
          followers: scraped.followers || profile?.followers || 0,
          nickname:
            scraped.nickname || profile?.nickname || account.nickname || username,
          bio: scraped.bio || profile?.bio || "",
          secUid: scraped.secUid || profile?.secUid || "",
        };
        rawValues.publicProfile = {
          follower_count: profile.followers,
          avatar_url: profile.avatarUrl,
        };
        step(steps, "public_profile_fallback", "ok", "Public profile applied", {
          follower_count: profile.followers,
          avatar_url: profile.avatarUrl,
        });
      } else {
        step(
          steps,
          "public_profile_fallback",
          "warn",
          "Could not parse public profile (bot challenge?)",
        );
      }
    } catch (err) {
      step(
        steps,
        "public_profile_fallback",
        "warn",
        `Public profile scrape failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
    await persistSteps(log.id, steps);
  } else {
    console.log(
      `[TikTok Sync] Raw response: follower_count=${profile.followers} avatar_url=${profile.avatarUrl ? "yes" : "no"}`,
    );
    logger.info("sync", "[TikTok Sync] Profile already present", {
      follower_count: profile.followers,
      avatar_url: profile.avatarUrl,
    });
  }

  // OAuth user.info for avatar/display name when public scrape missed avatar
  if (account.accessToken && (!profile?.avatarUrl || !profile?.nickname)) {
    try {
      const { fetchTikTokUser } = await import("@/services/tiktok-oauth");
      const { getValidAccessToken } = await import("@/services/tiktok-oauth");
      const token = await getValidAccessToken(accountId);
      const user = await fetchTikTokUser(token);
      console.log(`[TikTok Sync] Raw response (OAuth user.info):`, user);
      if (user) {
        profile = {
          username,
          nickname:
            user.display_name ||
            user.username ||
            profile?.nickname ||
            account.nickname ||
            username,
          avatarUrl: user.avatar_url || profile?.avatarUrl || "",
          bio: profile?.bio || "",
          secUid: profile?.secUid || "",
          followers: profile?.followers ?? 0,
          following: profile?.following ?? 0,
          hearts: profile?.hearts ?? 0,
          videoCount: profile?.videoCount ?? 0,
        };
        step(steps, "oauth_user_info", "ok", "Applied OAuth user.info avatar/name", {
          avatar_url: profile.avatarUrl,
          display_name: user.display_name,
        });
      }
    } catch (err) {
      step(
        steps,
        "oauth_user_info",
        "warn",
        `OAuth user.info unavailable (falling back to public scrape): ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
    await persistSteps(log.id, steps);
  }

  // 3) Unsigned item_list — skip when serverless already hydrated videos
  if (!(isServerlessRuntime() && videos.length > 0)) {
    const secUid = profile?.secUid || account.secUid;
    const apiVideos = await fetchItemList(secUid, username, steps, log.id);
    if (apiVideos.length) {
      const map = new Map(videos.map((v) => [v.id, v]));
      for (const v of apiVideos) map.set(v.id, v);
      videos = [...map.values()].sort(
        (a, b) => (b.createTime ?? 0) - (a.createTime ?? 0),
      );
      step(steps, "merge_videos", "ok", `Merged video set size: ${videos.length}`);
    }
    await persistSteps(log.id, steps);
  }

  // 3b) External scrapers if still empty (local / HTML-failed paths)
  if (videos.length === 0) {
    try {
      console.log(`[Sync] Calling Scraper Provider (TikWM / Apify)…`);
      const external = await fetchVideosExternal(username);
      if (external.videos.length) {
        videos = mergeVideoLists(videos, external.videos);
        step(
          steps,
          "external_video_list",
          "ok",
          `Loaded ${external.videos.length} videos via ${external.source}`,
        );
      } else {
        step(
          steps,
          "external_video_list",
          "warn",
          "TikWM/Apify returned no videos",
        );
      }
    } catch (err) {
      step(
        steps,
        "external_video_list",
        "warn",
        `External video list failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
    await persistSteps(log.id, steps);
  }

  // 4) Playwright browser session — skip on Netlify/Lambda (no Chromium)
  if (!canUsePlaywright()) {
    step(
      steps,
      "browser_sync",
      "warn",
      "Chromium skipped on this host. Videos are loaded from HTML, oEmbed, and a serverless fallback instead.",
    );
    await persistSteps(log.id, steps);
  } else {
    step(
      steps,
      "browser_sync",
      "ok",
      "Opening TikTok in Chromium to capture profile + item_list videos…",
    );
    await persistSteps(log.id, steps);
    try {
      const { fetchTikTokViaBrowser } = await import(
        "@/services/tiktok-browser"
      );
      const browserResult = await fetchTikTokViaBrowser(username, {
        scrollRounds: 6,
      });
      rawValues.browser = {
        itemListResponses: browserResult.itemListResponses,
        videos: browserResult.videos.length,
        hasProfile: Boolean(browserResult.profile),
        error: browserResult.error,
        skipped: browserResult.skipped,
      };

      if (browserResult.error) {
        step(
          steps,
          "browser_sync",
          "warn",
          `Browser sync issue: ${browserResult.error}`,
        );
      }

      if (browserResult.profile) {
        profile = {
          ...(profile || {
            username,
            nickname: account.nickname || username,
            avatarUrl: "",
            bio: "",
            secUid: "",
            followers: 0,
            following: 0,
            hearts: 0,
            videoCount: 0,
          }),
          ...browserResult.profile,
          avatarUrl: browserResult.profile.avatarUrl || profile?.avatarUrl || "",
          bio: browserResult.profile.bio || profile?.bio || "",
          secUid: browserResult.profile.secUid || profile?.secUid || "",
        };
        step(steps, "browser_profile", "ok", "Profile captured via browser", {
          followers: profile.followers,
          videoCount: profile.videoCount,
          hearts: profile.hearts,
          hasAvatar: Boolean(profile.avatarUrl),
        });
      }

      if (browserResult.videos.length) {
        const map = new Map(videos.map((v) => [v.id, v]));
        for (const v of browserResult.videos) map.set(v.id, v);
        videos = [...map.values()].sort(
          (a, b) => (b.createTime ?? 0) - (a.createTime ?? 0),
        );
        step(
          steps,
          "browser_videos",
          "ok",
          `Captured ${browserResult.videos.length} videos via browser (${browserResult.itemListResponses} item_list responses)`,
          {
            sample: browserResult.videos.slice(0, 3).map((v) => ({
              id: v.id,
              views: v.views,
              likes: v.likes,
            })),
          },
        );
      } else if (!browserResult.skipped) {
        step(
          steps,
          "browser_videos",
          "warn",
          "Browser loaded but no videos were captured from item_list XHR",
        );
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      step(steps, "browser_sync", "warn", `Browser sync failed: ${msg}`);
      rawValues.browser = { error: msg };
    }
    await persistSteps(log.id, steps);
  }

  if (videos.length) {
    const missingCover = videos.filter((v) => !v.coverUrl).map((v) => v.id);
    if (missingCover.length) {
      const fresh = await hydrateVideosFromOembed(
        username,
        missingCover.slice(0, 8),
      );
      videos = mergeVideoLists(videos, fresh);
      step(
        steps,
        "refresh_covers",
        fresh.length ? "ok" : "warn",
        `Refreshed ${fresh.filter((v) => v.coverUrl).length} covers via oEmbed`,
      );
    }
  }

  // 5) Persist profile
  if (profile) {
    const existingPostCount = await prisma.post.count({
      where: { accountId, status: "published" },
    });
    const { persistRemoteAvatar } = await import("@/services/persist-avatar");
    const durableAvatar = isServerlessRuntime()
      ? profile.avatarUrl || account.avatar || ""
      : await persistRemoteAvatar(
          accountId,
          profile.avatarUrl || account.avatar || "",
        );
    await prisma.connectedAccount.update({
      where: { id: accountId },
      data: {
        nickname: profile.nickname || account.nickname || username,
        avatar:
          durableAvatar ||
          account.avatar ||
          username.slice(0, 1).toUpperCase(),
        bio: profile.bio,
        followers: profile.followers,
        following: profile.following,
        hearts: profile.hearts,
        videoCount: profile.videoCount,
        secUid: profile.secUid || account.secUid,
        lastSyncAt: new Date(),
        status: "active",
        lastError:
          videos.length === 0 && existingPostCount === 0
            ? "Profile synced, but no public videos were returned. The account may have no posts, or TikTok hid the grid. Try Sync again."
            : null,
        rawProfile: JSON.stringify({
          profile,
          videoSample: videos.slice(0, 5),
          oembed: rawValues.oembed,
        }),
      },
    });
    step(steps, "persist_profile", "ok", "Saved avatar, bio, followers, following, hearts, videoCount");
  } else {
    // Don't mark as error if we have basic OAuth data
    const account = await prisma.connectedAccount.findUnique({
      where: { id: accountId },
      select: { avatar: true, nickname: true, accessToken: true },
    });
    const hasBasicData = account?.nickname || account?.avatar || account?.accessToken;
    
    await prisma.connectedAccount.update({
      where: { id: accountId },
      data: {
        lastSyncAt: new Date(),
        lastError: parseError || (hasBasicData ? null : "Profile parse failed"),
        status: hasBasicData ? "active" : (parseError ? "error" : "active"),
      },
    });
    step(steps, "persist_profile", hasBasicData ? "ok" : "warn", 
      hasBasicData 
        ? "Profile parse incomplete but OAuth data available" 
        : "Profile incomplete — account row only lightly updated"
    );
  }
  await persistSteps(log.id, steps);

  // 6) Persist videos → posts
  const videosSynced = await upsertVideos(
    accountId,
    account.projectId,
    username,
    videos,
    steps,
    log.id,
  );

  // 7) Daily metrics from synced totals (project-wide)
  if (videosSynced > 0 || profile) {
    const [publishedAgg, allAccounts] = await Promise.all([
      prisma.post.findMany({
        where: {
          projectId: account.projectId,
          status: "published",
          accountId: { not: null },
          NOT: { theme: { in: ["competitor", "tiktok-foreign"] } },
        },
        select: {
          accountId: true,
          theme: true,
          shareUrl: true,
          views: true,
          likes: true,
          comments: true,
          metaJson: true,
        },
      }),
      prisma.connectedAccount.findMany({
        where: { projectId: account.projectId, status: "active" },
        select: { id: true, username: true, followers: true },
      }),
    ]);
    const ownedScope = {
      accountIds: allAccounts.map((a) => a.id),
      usernames: allAccounts.map((a) => a.username),
      followersByAccount: Object.fromEntries(
        allAccounts.map((a) => [a.id, a.followers]),
      ),
    };
    const ownedPublished = publishedAgg.filter((p) =>
      isOwnedAccountPost(p, ownedScope),
    );
    await upsertDailyMetrics(
      account.projectId,
      {
        views: ownedPublished.reduce((s, p) => s + p.views, 0),
        likes: ownedPublished.reduce((s, p) => s + p.likes, 0),
        comments: ownedPublished.reduce((s, p) => s + p.comments, 0),
        followers: allAccounts.reduce((s, a) => s + a.followers, 0),
      },
      steps,
      log.id,
    );
  }

  rawValues.videosSynced = videosSynced;
  rawValues.videoCountReported = profile?.videoCount ?? null;

  const existingPublished = await prisma.post.count({
    where: { accountId, status: "published" },
  });
  const success =
    Boolean(profile) || videosSynced > 0 || existingPublished > 0;
  if (!success && attempt < 2 && !isServerlessRuntime()) {
    step(steps, "retry", "warn", "Retrying full sync (attempt 2)…");
    await finish(log.id, accountId, steps, false, parseError ?? "Sync incomplete", rawValues);
    return syncTikTokAccount(accountId, attempt + 1);
  }

  if (!success) {
    await finish(log.id, accountId, steps, false, parseError ?? "Could not parse profile or videos", rawValues);
    return {
      success: false,
      logId: log.id,
      followers: profile?.followers ?? null,
      videosSynced,
      steps,
      error: parseError ?? "Could not parse profile or videos",
      rawValues,
    };
  }

  await finish(log.id, accountId, steps, true, undefined, rawValues);
  return {
    success: true,
    logId: log.id,
    followers: profile?.followers ?? null,
    videosSynced,
    steps,
    rawValues,
  };
}
