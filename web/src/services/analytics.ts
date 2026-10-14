import "server-only";

import { prisma } from "@/lib/db";
import { isOwnedAccountPost } from "@/lib/owned-posts";

export type PostSnapshot = {
  id: string;
  hook: string;
  caption: string;
  coverUrl: string | null;
  shareUrl: string | null;
  views: number;
  likes: number;
  comments: number;
  saves: number;
  shares: number;
  status: string;
  theme: string;
  publishedAt: string | null;
  hashtags: string[];
  engagementRate: number;
};

export type CohortArm = {
  key: string;
  label: string;
  sampleSize: number;
  avgViews: number;
  avgLikes: number;
  avgEngagement: number;
  liftVsMean: number;
  confidence: number;
  postIds: string[];
};

export type CompetitorSnapshot = {
  id: string;
  handle: string;
  followers: number;
  avgViews: number;
  topHook: string;
  postingFreq: string;
  posts: PostSnapshot[];
};

export type InsightReport = {
  projectId: string;
  projectName: string;
  generatedAt: string;
  totals: {
    posts: number;
    views: number;
    likes: number;
    comments: number;
    downloads: number;
    followers: number;
    avgViews: number;
    engagementRate: number;
  };
  topPosts: PostSnapshot[];
  bottomPosts: PostSnapshot[];
  postingHours: { hour: number; avgViews: number; count: number }[];
  hashtags: { tag: string; avgViews: number; count: number }[];
  themes: { theme: string; avgViews: number; count: number }[];
  cohorts: {
    byHour: CohortArm[];
    byHashtag: CohortArm[];
    byTheme: CohortArm[];
  };
  competitors: CompetitorSnapshot[];
  viewsOverTime: { date: string; views: number }[];
  experiments: {
    id: string;
    name: string;
    kind: string;
    winner: string | null;
    confidence: number;
    lift: number;
    posts: number;
    arms: CohortArm[];
  }[];
  citeablePostIds: string[];
};

function extractHashtags(...texts: string[]): string[] {
  const set = new Set<string>();
  for (const t of texts) {
    const matches = t.match(/#[\w\u00C0-\u024F]+/g) || [];
    for (const m of matches) set.add(m.toLowerCase());
  }
  return [...set];
}

function engagement(views: number, likes: number, comments: number) {
  if (views <= 0) return 0;
  return Number((((likes + comments) / views) * 100).toFixed(2));
}

function toSnapshot(p: {
  id: string;
  hook: string;
  caption: string;
  coverUrl: string | null;
  shareUrl: string | null;
  views: number;
  likes: number;
  comments: number;
  saves: number;
  shares: number;
  status: string;
  theme: string;
  publishedAt: Date | null;
}): PostSnapshot {
  return {
    id: p.id,
    hook: p.hook,
    caption: p.caption,
    coverUrl: p.coverUrl,
    shareUrl: p.shareUrl,
    views: p.views,
    likes: p.likes,
    comments: p.comments,
    saves: p.saves,
    shares: p.shares,
    status: p.status,
    theme: p.theme,
    publishedAt: p.publishedAt?.toISOString() ?? null,
    hashtags: extractHashtags(p.hook, p.caption),
    engagementRate: engagement(p.views, p.likes, p.comments),
  };
}

function cohortConfidence(n: number): number {
  if (n >= 12) return 0.85;
  if (n >= 8) return 0.72;
  if (n >= 5) return 0.58;
  if (n >= 3) return 0.45;
  return 0.2;
}

function buildCohorts(
  posts: PostSnapshot[],
  meanViews: number,
  keyFn: (p: PostSnapshot) => string | null,
  labelFn: (key: string) => string,
  minN = 3,
): CohortArm[] {
  const buckets = new Map<string, PostSnapshot[]>();
  for (const p of posts) {
    const key = keyFn(p);
    if (!key) continue;
    const list = buckets.get(key) || [];
    list.push(p);
    buckets.set(key, list);
  }

  const arms: CohortArm[] = [];
  for (const [key, list] of buckets) {
    if (list.length < minN) continue;
    const avgViews = list.reduce((s, p) => s + p.views, 0) / list.length;
    const avgLikes = list.reduce((s, p) => s + p.likes, 0) / list.length;
    const avgEngagement =
      list.reduce((s, p) => s + p.engagementRate, 0) / list.length;
    const liftVsMean = meanViews > 0 ? (avgViews - meanViews) / meanViews : 0;
    arms.push({
      key,
      label: labelFn(key),
      sampleSize: list.length,
      avgViews: Math.round(avgViews),
      avgLikes: Math.round(avgLikes),
      avgEngagement: Number(avgEngagement.toFixed(2)),
      liftVsMean: Number(liftVsMean.toFixed(3)),
      confidence: cohortConfidence(list.length),
      postIds: list
        .slice()
        .sort((a, b) => b.views - a.views)
        .slice(0, 5)
        .map((p) => p.id),
    });
  }

  return arms.sort((a, b) => b.avgViews - a.avgViews);
}

/** Format a post for LLM context — never use v= shorthand. */
export function formatPostLine(p: PostSnapshot): string {
  const date = p.publishedAt
    ? new Date(p.publishedAt).toLocaleDateString()
    : "undated";
  const tags = p.hashtags.length ? ` · ${p.hashtags.slice(0, 4).join(" ")}` : "";
  return `[[post:${p.id}]] “${p.hook}” · ${p.views.toLocaleString()} views · ${p.likes.toLocaleString()} likes · ${p.comments} comments · ${p.engagementRate}% eng · ${date}${tags}`;
}

export function serializeInsightReport(report: InsightReport): string {
  const lines = [
    `INSIGHT_REPORT for ${report.projectName}`,
    `Generated: ${report.generatedAt}`,
    `Totals: ${report.totals.posts} posts · ${report.totals.views.toLocaleString()} views · ${report.totals.likes.toLocaleString()} likes · ${report.totals.comments} comments · ${report.totals.followers} followers · avg ${report.totals.avgViews} views/post · ${report.totals.engagementRate}% engagement`,
    "",
    "TOP POSTS (your connected accounts only — cite with [[post:id]]):",
    ...report.topPosts.map((p, i) => `${i + 1}. ${formatPostLine(p)}`),
    "",
    "BOTTOM POSTS:",
    ...report.bottomPosts.map((p, i) => `${i + 1}. ${formatPostLine(p)}`),
    "",
    "POSTING HOURS (avg views):",
    ...report.postingHours
      .slice(0, 6)
      .map((h) => `  ${h.hour}:00 → ${h.avgViews} avg (${h.count} posts)`),
    "",
    "HASHTAGS:",
    ...report.hashtags
      .slice(0, 8)
      .map((h) => `  ${h.tag} → ${h.avgViews} avg (${h.count} posts)`),
    "",
    "THEMES:",
    ...report.themes
      .slice(0, 6)
      .map((t) => `  ${t.theme || "(none)"} → ${t.avgViews} avg (${t.count})`),
  ];

  if (report.competitors.length) {
    lines.push("", "COMPETITORS (do not include in totals or [[post:]] cites):");
    for (const c of report.competitors) {
      lines.push(
        `  @${c.handle} · ${c.followers} followers · avg ${c.avgViews} views · top: “${c.topHook}” · ${c.postingFreq}`,
      );
      for (const p of c.posts.slice(0, 3)) {
        lines.push(`    [[cpost:${p.id}]] “${p.hook}” · ${p.views} views`);
      }
    }
  }

  if (report.experiments.length) {
    lines.push("", "EXPERIMENT WINNERS (sample-size heuristic, not p-values):");
    for (const e of report.experiments) {
      lines.push(
        `  ${e.name}: winner=${e.winner ?? "n/a"} · lift=${(e.lift * 100).toFixed(0)}% · confidence=${(e.confidence * 100).toFixed(0)}% · n=${e.posts}`,
      );
    }
  }

  return lines.join("\n");
}

export async function buildInsightReport(
  projectId: string,
): Promise<InsightReport | null> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: {
      accounts: { where: { status: "active" } },
      competitors: {
        include: {
          posts: { orderBy: { views: "desc" }, take: 8 },
        },
      },
      experiments: { orderBy: { updatedAt: "desc" }, take: 12 },
    },
  });
  if (!project) return null;

  const activeAccountIds = project.accounts.map((a) => a.id);
  const usernames = project.accounts.map((a) => a.username);

  const rawOwned =
    activeAccountIds.length === 0
      ? []
      : await prisma.post.findMany({
          where: {
            projectId,
            status: "published",
            accountId: { in: activeAccountIds },
            NOT: { theme: { in: ["competitor", "tiktok-foreign"] } },
          },
          orderBy: { views: "desc" },
        });

  const followersByAccount = Object.fromEntries(
    project.accounts.map((a) => [a.id, a.followers]),
  );
  const ownedPosts = rawOwned.filter((p) =>
    isOwnedAccountPost(p, {
      accountIds: activeAccountIds,
      usernames,
      followersByAccount,
    }),
  );

  const snapshots = ownedPosts.map(toSnapshot);
  const views = snapshots.reduce((s, p) => s + p.views, 0);
  const likes = snapshots.reduce((s, p) => s + p.likes, 0);
  const comments = snapshots.reduce((s, p) => s + p.comments, 0);
  const downloads = ownedPosts.reduce((s, p) => s + p.downloads, 0);
  const followers = project.accounts.reduce((s, a) => s + a.followers, 0);
  const avgViews = snapshots.length ? Math.round(views / snapshots.length) : 0;
  const engagementRate = engagement(views, likes, comments);

  const byViews = [...snapshots].sort((a, b) => b.views - a.views);
  const topPosts = byViews.slice(0, 8);
  const bottomPosts = [...byViews].reverse().slice(0, 5);

  const viewsOverTimeMap = new Map<string, number>();
  for (const p of ownedPosts) {
    const day = (p.publishedAt ?? p.createdAt).toISOString().slice(0, 10);
    viewsOverTimeMap.set(day, (viewsOverTimeMap.get(day) || 0) + p.views);
  }
  const viewsOverTime = [...viewsOverTimeMap.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, dayViews]) => ({ date, views: dayViews }));

  // Hour buckets
  const hourMap = new Map<number, number[]>();
  for (const p of snapshots) {
    if (!p.publishedAt) continue;
    const hour = new Date(p.publishedAt).getUTCHours();
    const list = hourMap.get(hour) || [];
    list.push(p.views);
    hourMap.set(hour, list);
  }
  const postingHours = [...hourMap.entries()]
    .map(([hour, vals]) => ({
      hour,
      count: vals.length,
      avgViews: Math.round(vals.reduce((a, b) => a + b, 0) / vals.length),
    }))
    .sort((a, b) => b.avgViews - a.avgViews);

  // Hashtags
  const tagMap = new Map<string, number[]>();
  for (const p of snapshots) {
    for (const tag of p.hashtags) {
      const list = tagMap.get(tag) || [];
      list.push(p.views);
      tagMap.set(tag, list);
    }
  }
  const hashtags = [...tagMap.entries()]
    .map(([tag, vals]) => ({
      tag,
      count: vals.length,
      avgViews: Math.round(vals.reduce((a, b) => a + b, 0) / vals.length),
    }))
    .filter((h) => h.count >= 2)
    .sort((a, b) => b.avgViews - a.avgViews);

  // Themes
  const themeMap = new Map<string, number[]>();
  for (const p of snapshots) {
    const theme = p.theme || "(untagged)";
    const list = themeMap.get(theme) || [];
    list.push(p.views);
    themeMap.set(theme, list);
  }
  const themes = [...themeMap.entries()]
    .map(([theme, vals]) => ({
      theme,
      count: vals.length,
      avgViews: Math.round(vals.reduce((a, b) => a + b, 0) / vals.length),
    }))
    .sort((a, b) => b.avgViews - a.avgViews);

  const byHour = buildCohorts(
    snapshots,
    avgViews,
    (p) =>
      p.publishedAt
        ? `hour-${new Date(p.publishedAt).getUTCHours()}`
        : null,
    (key) => {
      const h = key.replace("hour-", "");
      return `Posted around ${h}:00 UTC`;
    },
  );

  const byHashtag = buildCohorts(
    snapshots,
    avgViews,
    (p) => p.hashtags[0] ?? null,
    (key) => `Hashtag ${key}`,
    2,
  );

  const byTheme = buildCohorts(
    snapshots,
    avgViews,
    (p) => (p.theme ? p.theme : null),
    (key) => `Theme: ${key}`,
    2,
  );

  const competitors: CompetitorSnapshot[] = project.competitors.map((c) => ({
    id: c.id,
    handle: c.handle,
    followers: c.followers,
    avgViews: c.avgViews,
    topHook: c.topHook,
    postingFreq: c.postingFreq,
    posts: c.posts.map((p) =>
      toSnapshot({
        id: p.id,
        hook: p.hook,
        caption: p.caption,
        coverUrl: p.coverUrl,
        shareUrl: p.shareUrl,
        views: p.views,
        likes: p.likes,
        comments: p.comments,
        saves: p.saves,
        shares: p.shares,
        status: "published",
        theme: "competitor",
        publishedAt: p.publishedAt,
      }),
    ),
  }));

  const experiments = project.experiments.map((e) => {
    let arms: CohortArm[] = [];
    try {
      arms = JSON.parse(e.armsJson || "[]") as CohortArm[];
    } catch {
      arms = [];
    }
    return {
      id: e.id,
      name: e.name,
      kind: e.kind,
      winner: e.winner,
      confidence: e.confidence,
      lift: e.lift,
      posts: e.posts,
      arms,
    };
  });

  return {
    projectId: project.id,
    projectName: project.name,
    generatedAt: new Date().toISOString(),
    totals: {
      posts: snapshots.length,
      views,
      likes,
      comments,
      downloads,
      followers,
      avgViews,
      engagementRate,
    },
    topPosts,
    bottomPosts,
    postingHours,
    hashtags,
    themes,
    cohorts: { byHour, byHashtag, byTheme },
    competitors,
    viewsOverTime,
    experiments,
    citeablePostIds: byViews.map((p) => p.id),
  };
}
