import "server-only";

import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import { providersFor } from "@/services/intel/providers";
import { createAiAnalysisProvider } from "@/services/intel/providers/ai-analysis";
import {
  startOfUtcDay,
  type CompetitorTarget,
  type ProviderResult,
} from "@/services/intel/providers/types";

export type IngestResult = {
  success: boolean;
  providers: Array<{
    provider: string;
    ok: boolean;
    error?: string;
    insights?: string[];
    assets?: number;
    videos?: number;
  }>;
  videosSynced: number;
  followers: number | null;
  error?: string;
  whatToCreateNext?: string;
};

function toTarget(row: {
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
  instagram?: string;
  facebookPage?: string;
  twitter?: string;
  youtube?: string;
  avatar: string;
  bio: string;
  followers: number;
  secUid: string;
}): CompetitorTarget {
  return {
    id: row.id,
    projectId: row.projectId,
    name: row.name,
    slug: row.slug,
    kind: row.kind,
    handle: row.handle,
    niche: row.niche,
    websiteUrl: row.websiteUrl,
    appStoreUrl: row.appStoreUrl,
    playStoreUrl: row.playStoreUrl,
    metaPageId: row.metaPageId,
    instagram: row.instagram || "",
    facebookPage: row.facebookPage || "",
    twitter: row.twitter || "",
    youtube: row.youtube || "",
    avatar: row.avatar,
    bio: row.bio,
    followers: row.followers,
    secUid: row.secUid,
  };
}

async function persistProviderResult(
  competitorId: string,
  projectId: string,
  result: ProviderResult,
) {
  await prisma.competitorObservation.create({
    data: {
      competitorId,
      provider: result.source,
      ok: result.ok,
      error: result.error || null,
      payloadJson: JSON.stringify({
        structuredData: result.structuredData,
        insights: result.insights,
        rawData: result.rawData,
        collectedAt: result.collectedAt,
      }),
    },
  });

  // Version history — never overwrite; detect changes via fingerprint
  if (result.fingerprint || result.screenshotUrl || result.htmlPath) {
    const prev = await prisma.competitorVersion.findFirst({
      where: { competitorId, provider: result.source },
      orderBy: { observedAt: "desc" },
    });
    const changes: string[] = [];
    if (prev && result.fingerprint && prev.fingerprint !== result.fingerprint) {
      changes.push("content_changed");
      if (result.source === "website" || result.source === "landing_page") {
        changes.push("landing_or_homepage_updated");
      }
      if (result.source === "app_store") changes.push("app_store_listing_changed");
      if (result.source === "meta_ads") changes.push("meta_creatives_changed");
    }
    if (!prev || (result.fingerprint && prev.fingerprint !== result.fingerprint)) {
      await prisma.competitorVersion.create({
        data: {
          competitorId,
          provider: result.source,
          fingerprint: result.fingerprint || "",
          summary: result.insights[0] || "",
          payloadJson: JSON.stringify(result.structuredData),
          screenshotUrl: result.screenshotUrl || "",
          htmlPath: result.htmlPath || "",
          changesJson: JSON.stringify(changes),
        },
      });
      if (changes.length) {
        result.insights.push(
          ...changes.map((c) =>
            c === "landing_or_homepage_updated"
              ? "Homepage / landing page changed since last sync."
              : c === "meta_creatives_changed"
                ? "Meta creatives inventory changed."
                : c === "app_store_listing_changed"
                  ? "App Store listing changed."
                  : "Competitor source content changed.",
          ),
        );
      }
    }
  }

  if (result.videos?.length) {
    for (const v of result.videos) {
      await prisma.competitorPost.upsert({
        where: {
          competitorId_externalId: {
            competitorId,
            externalId: v.externalId,
          },
        },
        create: {
          competitorId,
          externalId: v.externalId,
          hook: v.hook,
          caption: v.caption,
          coverUrl: v.coverUrl,
          shareUrl: v.shareUrl,
          views: v.views,
          likes: v.likes,
          comments: v.comments,
          shares: v.shares,
          saves: v.saves,
          hashtagsJson: JSON.stringify(v.hashtags),
          hourUtc: v.hourUtc,
          publishedAt: v.publishedAt ? new Date(v.publishedAt) : null,
        },
        update: {
          hook: v.hook,
          caption: v.caption,
          coverUrl: v.coverUrl,
          shareUrl: v.shareUrl,
          views: v.views,
          likes: v.likes,
          comments: v.comments,
          shares: v.shares,
          saves: v.saves,
          hashtagsJson: JSON.stringify(v.hashtags),
          hourUtc: v.hourUtc,
          publishedAt: v.publishedAt ? new Date(v.publishedAt) : null,
        },
      });

      // Hook library
      const engagement =
        v.views > 0 ? ((v.likes + v.comments) / v.views) * 100 : 0;
      await prisma.hookRecord.upsert({
        where: {
          projectId_source_externalId_hook: {
            projectId,
            source: "tiktok",
            externalId: v.externalId,
            hook: v.hook.slice(0, 200),
          },
        },
        create: {
          projectId,
          competitorId,
          source: "tiktok",
          externalId: v.externalId,
          hook: v.hook.slice(0, 200),
          topic: inferTopic(v.caption),
          emotion: inferEmotion(v.hook),
          cta: inferCta(v.caption),
          structure: "short_form",
          openingSentence: v.hook,
          visualStyle: "",
          colourPalette: "",
          estimatedEngagement: engagement,
          views: v.views,
          coverUrl: v.coverUrl,
          metaJson: JSON.stringify({ hashtags: v.hashtags }),
        },
        update: {
          views: v.views,
          estimatedEngagement: engagement,
          coverUrl: v.coverUrl,
          topic: inferTopic(v.caption),
          emotion: inferEmotion(v.hook),
        },
      });

      if (v.coverUrl) {
        await prisma.creativeRecord.upsert({
          where: {
            projectId_source_externalId: {
              projectId,
              source: "tiktok",
              externalId: v.externalId,
            },
          },
          create: {
            projectId,
            competitorId,
            source: "tiktok",
            kind: "image",
            externalId: v.externalId,
            title: v.hook.slice(0, 120),
            hook: v.hook,
            copy: v.caption.slice(0, 2000),
            mediaUrl: v.coverUrl,
            firstSeenAt: new Date(),
            lastSeenAt: new Date(),
          },
          update: {
            hook: v.hook,
            copy: v.caption.slice(0, 2000),
            mediaUrl: v.coverUrl,
            lastSeenAt: new Date(),
          },
        });
      }
    }
  }

  if (result.assets?.length) {
    for (const a of result.assets) {
      const externalId = a.externalId || a.url.slice(0, 120);
      await prisma.competitorAsset.upsert({
        where: {
          competitorId_kind_externalId: {
            competitorId,
            kind: a.kind,
            externalId,
          },
        },
        create: {
          competitorId,
          kind: a.kind,
          url: a.url,
          externalId,
          title: a.title || "",
          metaJson: JSON.stringify(a.meta || {}),
          observedAt: new Date(),
        },
        update: {
          url: a.url,
          title: a.title || "",
          metaJson: JSON.stringify(a.meta || {}),
          observedAt: new Date(),
        },
      });

      if (a.kind === "meta_ad" || a.kind === "screenshot") {
        await prisma.creativeRecord.upsert({
          where: {
            projectId_source_externalId: {
              projectId,
              source: result.source === "meta_ads" ? "meta_ads" : result.source,
              externalId,
            },
          },
          create: {
            projectId,
            competitorId,
            source: result.source === "meta_ads" ? "meta_ads" : result.source,
            kind: a.kind === "meta_ad" ? "ad" : "image",
            externalId,
            title: a.title || "",
            hook: (a.title || "").slice(0, 120),
            copy: String((a.meta as { body?: string } | undefined)?.body || ""),
            cta: "",
            mediaUrl: a.url,
            landingUrl: String(
              (a.meta as { landing?: string } | undefined)?.landing || "",
            ),
            platformsJson: JSON.stringify(
              (a.meta as { platforms?: string[] } | undefined)?.platforms || [],
            ),
            firstSeenAt: new Date(),
            lastSeenAt: new Date(),
            metaJson: JSON.stringify(a.meta || {}),
          },
          update: {
            mediaUrl: a.url,
            title: a.title || "",
            lastSeenAt: new Date(),
            metaJson: JSON.stringify(a.meta || {}),
          },
        });
      }
    }
  }
}

function inferTopic(text: string): string {
  const t = text.toLowerCase();
  if (/anxiety|stress|calm|panic/.test(t)) return "anxiety";
  if (/habit|routine|discipline/.test(t)) return "habits";
  if (/journal|reflect|diary/.test(t)) return "journaling";
  if (/sleep|insomnia/.test(t)) return "sleep";
  if (/productiv|focus|dopamine/.test(t)) return "productivity";
  if (/money|wealth|rich/.test(t)) return "wealth";
  return "general";
}

function inferEmotion(hook: string): string {
  if (/afraid|scared|anxiety|lonely|hurt|pain/i.test(hook)) return "vulnerable";
  if (/nobody|stop|never|worst/i.test(hook)) return "provocative";
  if (/finally|secret|hack|easy/i.test(hook)) return "curiosity";
  if (/\?/.test(hook)) return "question";
  return "neutral";
}

function inferCta(caption: string): string {
  if (/download|get the app|link in bio/i.test(caption)) return "download_app";
  if (/comment|follow|share/i.test(caption)) return "engagement";
  if (/learn more|read/i.test(caption)) return "learn_more";
  return "";
}

function computePostingFreq(posts7d: number, posts30d: number): string {
  if (posts7d >= 5) return "~daily";
  if (posts7d >= 3) return "~3x/week";
  if (posts30d >= 8) return "~2x/week";
  if (posts30d >= 3) return "~weekly";
  if (posts30d > 0) return "sparse";
  return "unknown";
}

async function writeSnapshotAndSignals(
  competitorId: string,
  results: ProviderResult[],
) {
  const posts = await prisma.competitorPost.findMany({
    where: { competitorId },
    orderBy: { views: "desc" },
  });
  const now = Date.now();
  const weekAgo = now - 7 * 24 * 60 * 60 * 1000;
  const monthAgo = now - 30 * 24 * 60 * 60 * 1000;
  const posts7d = posts.filter(
    (p) => p.publishedAt && p.publishedAt.getTime() >= weekAgo,
  ).length;
  const posts30d = posts.filter(
    (p) => p.publishedAt && p.publishedAt.getTime() >= monthAgo,
  ).length;
  const avgViews = posts.length
    ? Math.round(posts.reduce((s, p) => s + p.views, 0) / posts.length)
    : 0;

  const hashtagCounts = new Map<string, number>();
  const hourCounts: Record<string, number> = {};
  for (const p of posts) {
    try {
      const tags = JSON.parse(p.hashtagsJson || "[]") as string[];
      for (const t of tags) hashtagCounts.set(t, (hashtagCounts.get(t) || 0) + 1);
    } catch {
      /* ignore */
    }
    if (p.hourUtc != null) {
      hourCounts[String(p.hourUtc)] = (hourCounts[String(p.hourUtc)] || 0) + 1;
    }
  }
  const topHashtags = [...hashtagCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15)
    .map(([tag, count]) => ({ tag, count }));

  const bySource = Object.fromEntries(
    results.map((r) => [r.source, r.structuredData]),
  );
  const allInsights = results.flatMap((r) =>
    r.insights.map((text) => ({ source: r.source, text })),
  );
  const adCreativeCount = await prisma.creativeRecord.count({
    where: { competitorId, source: "meta_ads" },
  });
  const appStore = bySource.app_store as { rating?: number } | undefined;
  const playStore = bySource.play_store as { rating?: number } | undefined;
  const appRating =
    typeof appStore?.rating === "number"
      ? appStore.rating
      : typeof playStore?.rating === "number"
        ? playStore.rating
        : null;

  const competitor = await prisma.competitor.findUniqueOrThrow({
    where: { id: competitorId },
  });

  const profileUpdates: Record<string, unknown> = {};
  const tiktok = results.find((r) => r.source === "tiktok");
  if (tiktok?.ok) {
    const s = tiktok.structuredData as {
      avatar?: string;
      bio?: string;
      followers?: number;
      hearts?: number;
      videoCount?: number;
    };
    if (s.avatar) profileUpdates.avatar = s.avatar;
    if (s.bio) profileUpdates.bio = s.bio;
    if (s.followers != null) profileUpdates.followers = s.followers;
    if (s.hearts != null) profileUpdates.hearts = s.hearts;
    if (s.videoCount != null) profileUpdates.videoCount = s.videoCount;
  }

  const ai = results.find((r) => r.source === "ai_analysis");
  const postingFreq = computePostingFreq(posts7d, posts30d);
  const signals = {
    posts7d,
    posts30d,
    topHashtags,
    postingHours: hourCounts,
    bySource,
    insights: allInsights,
    adCreativeCount,
    appRating,
    whatToCreateNext:
      (ai?.structuredData as { recommendation?: string } | undefined)
        ?.recommendation || allInsights[0]?.text,
  };

  const day = startOfUtcDay();
  await prisma.competitorSnapshot.upsert({
    where: { competitorId_date: { competitorId, date: day } },
    create: {
      competitorId,
      date: day,
      followers: (profileUpdates.followers as number) ?? competitor.followers,
      posts7d,
      posts30d,
      avgViews,
      topHashtagsJson: JSON.stringify(topHashtags),
      postingHoursJson: JSON.stringify(hourCounts),
      appRating: appRating ?? undefined,
      adCreativeCount,
      metaJson: JSON.stringify({ bySource: Object.keys(bySource) }),
    },
    update: {
      followers: (profileUpdates.followers as number) ?? competitor.followers,
      posts7d,
      posts30d,
      avgViews,
      topHashtagsJson: JSON.stringify(topHashtags),
      postingHoursJson: JSON.stringify(hourCounts),
      appRating: appRating ?? undefined,
      adCreativeCount,
      metaJson: JSON.stringify({ bySource: Object.keys(bySource) }),
    },
  });

  const providerErrors = results
    .filter((p) => !p.ok && p.error)
    .map((p) => `${p.source}: ${p.error}`);

  await prisma.competitor.update({
    where: { id: competitorId },
    data: {
      ...profileUpdates,
      avgViews,
      topHook: posts[0]?.hook || competitor.topHook,
      postingFreq,
      signalsJson: JSON.stringify(signals),
      aiSummary: ai?.insights.map((i) => `• ${i}`).join("\n") || competitor.aiSummary,
      aiSummaryAt: ai ? new Date() : competitor.aiSummaryAt,
      lastSyncAt: new Date(),
      lastError: providerErrors.length
        ? providerErrors.join("; ").slice(0, 500)
        : null,
    },
  });

  return signals.whatToCreateNext as string | undefined;
}

/**
 * Deep Intelligence Engine — runs all matching providers, persists
 * observations/versions/hooks/creatives, then AI analysis.
 * Dashboard only consumes normalized signals — never raw provider shapes.
 */
export async function ingestCompetitor(competitorId: string): Promise<IngestResult> {
  const row = await prisma.competitor.findUnique({ where: { id: competitorId } });
  if (!row) throw new Error(`Competitor ${competitorId} not found`);

  const job = await prisma.intelSyncJob.create({
    data: {
      projectId: row.projectId,
      competitorId,
      cadence: "manual",
      status: "running",
      startedAt: new Date(),
      providersJson: "[]",
    },
  });

  const target = toTarget(row);
  const providers = providersFor(target);
  logger.info("sync", "Deep Intelligence sync start", {
    competitorId,
    providers: providers.map((p) => p.id),
  });

  if (!providers.length) {
    await prisma.competitor.update({
      where: { id: competitorId },
      data: {
        lastSyncAt: new Date(),
        lastError: "No data sources configured",
      },
    });
    await prisma.intelSyncJob.update({
      where: { id: job.id },
      data: {
        status: "failed",
        error: "No data sources",
        finishedAt: new Date(),
      },
    });
    return {
      success: false,
      providers: [],
      videosSynced: 0,
      followers: null,
      error: "No data sources configured",
    };
  }

  const results: ProviderResult[] = [];
  for (const provider of providers) {
    // Skip landing_page if website already ran (same crawl)
    if (
      provider.id === "landing_page" &&
      results.some((r) => r.source === "website" && r.ok)
    ) {
      continue;
    }
    try {
      const result = await provider.syncCompetitor(target);
      results.push(result);
      await persistProviderResult(competitorId, row.projectId, result);
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      const fail: ProviderResult = {
        source: provider.id,
        collectedAt: new Date().toISOString(),
        ok: false,
        error,
        rawData: {},
        structuredData: {},
        insights: [],
      };
      results.push(fail);
      await persistProviderResult(competitorId, row.projectId, fail);
    }
  }

  // AI analysis provider (cross-source)
  try {
    const ai = createAiAnalysisProvider(results);
    if (ai.supports(target)) {
      const aiResult = await ai.syncCompetitor(target);
      results.push(aiResult);
      await persistProviderResult(competitorId, row.projectId, aiResult);
    }
  } catch (err) {
    logger.warn("ai", "AI analysis provider failed", {
      err: err instanceof Error ? err.message : String(err),
    });
  }

  const whatToCreateNext = await writeSnapshotAndSignals(competitorId, results);
  const tiktok = results.find((r) => r.source === "tiktok");
  const videosSynced = tiktok?.videos?.length || 0;
  const anyOk = results.some((r) => r.ok);

  await prisma.intelSyncJob.update({
    where: { id: job.id },
    data: {
      status: anyOk ? "completed" : "failed",
      providersJson: JSON.stringify(results.map((r) => r.source)),
      resultJson: JSON.stringify({
        insights: results.flatMap((r) => r.insights).slice(0, 20),
        whatToCreateNext,
      }),
      error: anyOk
        ? null
        : results
            .map((r) => r.error)
            .filter(Boolean)
            .join("; "),
      finishedAt: new Date(),
    },
  });

  return {
    success: anyOk,
    providers: results.map((r) => ({
      provider: r.source,
      ok: r.ok,
      error: r.error,
      insights: r.insights,
      assets: r.assets?.length,
      videos: r.videos?.length,
    })),
    videosSynced,
    followers:
      (tiktok?.structuredData as { followers?: number } | undefined)?.followers ??
      null,
    error: anyOk
      ? undefined
      : results
          .map((r) => r.error)
          .filter(Boolean)
          .join("; "),
    whatToCreateNext,
  };
}
