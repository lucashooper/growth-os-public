import { withApi } from "@/lib/api-route";
import { prisma } from "@/lib/db";
import { fail, ok } from "@/lib/api-response";
import { AuthError, guardProjectId } from "@/lib/api-auth";
import { isOwnedAccountPost } from "@/lib/owned-posts";

export const runtime = "nodejs";

function utcDayStart(d = new Date()) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function pctChange(today: number, yesterday: number): number | null {
  if (yesterday === 0) return today === 0 ? 0 : null;
  return ((today - yesterday) / Math.abs(yesterday)) * 100;
}

async function computeStreak(projectId: string): Promise<number> {
  const posts = await prisma.post.findMany({
    where: { projectId, status: "published", publishedAt: { not: null } },
    select: { publishedAt: true },
    orderBy: { publishedAt: "desc" },
    take: 400,
  });
  const days = new Set(
    posts
      .filter((p) => p.publishedAt)
      .map((p) => p.publishedAt!.toISOString().slice(0, 10)),
  );
  let streak = 0;
  const cursor = utcDayStart();
  // If nothing published today, start from yesterday
  if (!days.has(cursor.toISOString().slice(0, 10))) {
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }
  while (days.has(cursor.toISOString().slice(0, 10))) {
    streak += 1;
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }
  return streak;
}

async function handleGET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const project = await prisma.project.findUnique({ where: { id } });
    if (!project) return fail("Project not found", 404);
    await guardProjectId(id);

    const todayStart = utcDayStart();
    const yesterdayStart = new Date(todayStart);
    yesterdayStart.setUTCDate(yesterdayStart.getUTCDate() - 1);
    const tomorrowStart = new Date(todayStart);
    tomorrowStart.setUTCDate(tomorrowStart.getUTCDate() + 1);

    const accounts = await prisma.connectedAccount.findMany({
      where: { projectId: id, status: "active" },
      orderBy: { createdAt: "asc" },
    });
    const activeAccountIds = accounts.map((a) => a.id);
    const ownedPostWhere = {
      projectId: id,
      accountId: activeAccountIds.length ? { in: activeAccountIds } : { in: [] as string[] },
      NOT: { theme: { in: ["competitor", "tiktok-foreign"] } },
    };

    const [
      allPublished,
      queue,
      findings,
      metrics,
      allAccounts,
      experiments,
      postsToday,
      draftsWaiting,
      metricToday,
      metricYesterday,
      streak,
      lastAccountSync,
    ] = await Promise.all([
      prisma.post.findMany({
        where: { ...ownedPostWhere, status: "published" },
        orderBy: [{ publishedAt: "desc" }, { createdAt: "desc" }],
      }),
      prisma.queueItem.findMany({
        where: { projectId: id },
        orderBy: { createdAt: "asc" },
      }),
      prisma.finding.findMany({
        where: { projectId: id },
        orderBy: { createdAt: "desc" },
        take: 10,
      }),
      prisma.dailyMetric.findMany({
        where: { projectId: id },
        orderBy: { date: "asc" },
        take: 30,
      }),
      prisma.connectedAccount.findMany({
        where: { projectId: id },
        orderBy: { createdAt: "asc" },
      }),
      prisma.experiment.findMany({
        where: { projectId: id },
        orderBy: { createdAt: "desc" },
      }),
      prisma.post.findMany({
        where: {
          projectId: id,
          status: "published",
          publishedAt: { gte: todayStart, lt: tomorrowStart },
        },
      }),
      prisma.post.count({
        where: { projectId: id, status: "draft" },
      }),
      prisma.dailyMetric.findFirst({
        where: { projectId: id, date: todayStart },
      }),
      prisma.dailyMetric.findFirst({
        where: { projectId: id, date: yesterdayStart },
      }),
      computeStreak(id),
      prisma.connectedAccount.findFirst({
        where: { projectId: id, lastSyncAt: { not: null } },
        orderBy: { lastSyncAt: "desc" },
        select: { lastSyncAt: true },
      }),
    ]);

    const usernames = accounts.map((a) => a.username);
    const followersByAccount = Object.fromEntries(
      accounts.map((a) => [a.id, a.followers]),
    );
    const scope = { accountIds: activeAccountIds, usernames, followersByAccount };
    const ownedPosts = allPublished.filter((p) => isOwnedAccountPost(p, scope));
    const recentOwned = ownedPosts
      .slice()
      .sort((a, b) => {
        const at = (b.publishedAt ?? b.createdAt).getTime();
        const bt = (a.publishedAt ?? a.createdAt).getTime();
        return at - bt;
      })
      .slice(0, 20);
    const ownedToday = postsToday.filter((p) => isOwnedAccountPost(p, scope));

    const queueDrafts = queue.filter((q) => q.status === "draft").length;
    const draftsTotal = draftsWaiting + queueDrafts;

    // Snapshot-based "today" deltas (DailyMetric stores cumulative totals)
    const viewsTodaySnap = metricToday?.views ?? 0;
    const viewsYdaySnap = metricYesterday?.views ?? 0;
    const likesTodaySnap = metricToday?.likes ?? 0;
    const likesYdaySnap = metricYesterday?.likes ?? 0;
    const followersTodaySnap = metricToday?.followers ?? 0;
    const followersYdaySnap = metricYesterday?.followers ?? 0;

    const viewsDelta = Math.max(0, viewsTodaySnap - viewsYdaySnap);
    const likesDelta = Math.max(0, likesTodaySnap - likesYdaySnap);
    const followersDelta = followersTodaySnap - followersYdaySnap;

    // Previous day delta for % comparison needs day-before-yesterday
    const dayBefore = new Date(yesterdayStart);
    dayBefore.setUTCDate(dayBefore.getUTCDate() - 1);
    const metricDayBefore = await prisma.dailyMetric.findFirst({
      where: { projectId: id, date: dayBefore },
    });
    const viewsPrevDelta = Math.max(
      0,
      (metricYesterday?.views ?? 0) - (metricDayBefore?.views ?? 0),
    );
    const likesPrevDelta = Math.max(
      0,
      (metricYesterday?.likes ?? 0) - (metricDayBefore?.likes ?? 0),
    );
    const followersPrevDelta =
      (metricYesterday?.followers ?? 0) - (metricDayBefore?.followers ?? 0);

    const postsTodayCount = ownedToday.length;
    const avgViewsToday = postsTodayCount
      ? Math.round(
          ownedToday.reduce((s, p) => s + p.views, 0) / postsTodayCount,
        )
      : 0;

    // Yesterday's published count for % 
    const postsYesterday = await prisma.post.count({
      where: {
        projectId: id,
        status: "published",
        publishedAt: { gte: yesterdayStart, lt: todayStart },
      },
    });

    const todayOverview = {
      viewsToday: viewsDelta,
      likesToday: likesDelta,
      followersToday: followersDelta,
      postsPublishedToday: postsTodayCount,
      draftsWaiting: draftsTotal,
      avgViewsPerPostToday: avgViewsToday,
      streak,
      changes: {
        views: pctChange(viewsDelta, viewsPrevDelta),
        likes: pctChange(likesDelta, likesPrevDelta),
        followers: pctChange(followersDelta, followersPrevDelta),
        posts: pctChange(postsTodayCount, postsYesterday),
      },
    };

    const topOwned = [...ownedPosts].sort((a, b) => b.views - a.views)[0];
    const worstOwned = [...ownedPosts].sort((a, b) => a.views - b.views)[0];

    const bestPost =
      topOwned &&
      ({
        ...topOwned,
        engagement:
          topOwned.views > 0
            ? ((topOwned.likes + topOwned.comments) / topOwned.views) * 100
            : 0,
        explanation:
          findings.find((f) => f.text.toLowerCase().includes("top"))?.text ||
          (topOwned.hook
            ? `“${topOwned.hook.slice(0, 80)}” leads your catalogue on views — lean into this hook style next.`
            : "Top post by views in your library."),
      });

    // Intelligence scores (0–100) — transparent heuristics, not fake precision
    const competitorIntel = await prisma.competitor.findMany({
      where: { projectId: id },
      select: {
        id: true,
        name: true,
        handle: true,
        aiSummary: true,
        postingFreq: true,
        lastSyncAt: true,
        signalsJson: true,
      },
      take: 20,
    });
    const recentVersions = await prisma.competitorVersion.findMany({
      where: {
        competitor: { projectId: id },
        observedAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
      },
      orderBy: { observedAt: "desc" },
      take: 12,
      include: {
        competitor: { select: { name: true, handle: true } },
      },
    });
    const syncJobs = await prisma.intelSyncJob.findMany({
      where: { projectId: id },
      orderBy: { createdAt: "desc" },
      take: 8,
    });

    const growthScore = Math.min(
      100,
      Math.round(
        Math.min(40, streak * 8) +
          Math.min(25, postsTodayCount * 12) +
          Math.min(20, viewsDelta > 0 ? 20 : 0) +
          Math.min(15, draftsTotal > 0 ? 10 : 0),
      ),
    );
    const hoursSincePost = (() => {
      const last = ownedPosts.find((p) => p.status === "published" && p.publishedAt);
      if (!last?.publishedAt) return 72;
      return (Date.now() - last.publishedAt.getTime()) / (60 * 60 * 1000);
    })();
    const opportunityScore = Math.min(
      100,
      Math.round(
        Math.min(30, hoursSincePost >= 6 ? 30 : hoursSincePost * 4) +
          Math.min(25, competitorIntel.length * 5) +
          Math.min(20, recentVersions.length * 4) +
          Math.min(15, draftsTotal >= 1 ? 15 : 0) +
          Math.min(10, findings.filter((f) => f.source === "competitor_intel").length * 3),
      ),
    );

    const competitorActivity = competitorIntel.map((c) => {
      let whatNext = "";
      try {
        const s = JSON.parse(c.signalsJson || "{}") as {
          whatToCreateNext?: string;
        };
        whatNext = s.whatToCreateNext || "";
      } catch {
        /* ignore */
      }
      return {
        id: c.id,
        name: c.name || (c.handle ? `@${c.handle}` : "Competitor"),
        postingFreq: c.postingFreq,
        lastSyncAt: c.lastSyncAt,
        oneLiner:
          whatNext ||
          c.aiSummary
            ?.split("\n")
            .map((l) => l.replace(/^[•\-*]\s*/, "").trim())
            .find(Boolean) ||
          "",
      };
    });

    const latestCompetitorChanges = recentVersions.map((v) => ({
      id: v.id,
      competitor: v.competitor.name || v.competitor.handle,
      provider: v.provider,
      summary: v.summary,
      changes: JSON.parse(v.changesJson || "[]") as string[],
      at: v.observedAt,
    }));

    const bestPostingHour = (() => {
      const hours: Record<number, number> = {};
      for (const p of ownedPosts) {
        if (!p.publishedAt || p.status !== "published") continue;
        const h = new Date(p.publishedAt).getUTCHours();
        hours[h] = (hours[h] || 0) + (p.views || 0);
      }
      const best = Object.entries(hours).sort((a, b) => b[1] - a[1])[0];
      return best ? Number(best[0]) : null;
    })();

    const whatShouldICreate =
      findings.find((f) => f.source === "competitor_intel")?.text ||
      competitorActivity.find((c) => c.oneLiner)?.oneLiner ||
      (bestPost
        ? `Create a variation of your best hook: “${bestPost.hook.slice(0, 70)}”`
        : "Sync accounts and competitors to unlock a concrete recommendation.");

    const totals = {
      views: ownedPosts.reduce((s, p) => s + p.views, 0),
      likes: ownedPosts.reduce((s, p) => s + p.likes, 0),
      comments: ownedPosts.reduce((s, p) => s + p.comments, 0),
      downloads: ownedPosts.reduce((s, p) => s + p.downloads, 0),
      followers: accounts.reduce((s, a) => s + a.followers, 0),
      posts: ownedPosts.length,
    };

    const topHook = topOwned;
    const worstHook =
      worstOwned && topOwned && worstOwned.id !== topOwned.id
        ? worstOwned
        : null;

    return ok({
      project,
      totals,
      todayOverview,
      bestPost,
      growthScore,
      opportunityScore,
      competitorActivity,
      latestCompetitorChanges,
      bestPostingHour,
      whatShouldICreate,
      syncJobs,
      lastSyncedAt: lastAccountSync?.lastSyncAt?.toISOString() ?? null,
      serverTime: new Date().toISOString(),
      posts: recentOwned,
      queue,
      findings,
      metrics,
      accounts: allAccounts,
      experiments,
      topHook,
      worstHook,
      empty: {
        posts: ownedPosts.length === 0,
        metrics: metrics.length === 0,
        accounts: allAccounts.length === 0,
        findings: findings.length === 0,
      },
    });
  } catch (err) {
    if (err instanceof AuthError) return fail(err.message, err.status);
    return fail(err);
  }
}

export const GET = withApi(handleGET, "GET src/app/api/projects/[id]/dashboard/route.ts");
