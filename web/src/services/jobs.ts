import "server-only";

import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import {
  buildInsightReport,
  formatPostLine,
} from "@/services/analytics";
import { computeExperiments } from "@/services/experiments";
import { completeLogged } from "@/lib/ai/logged";

export async function runJob(type: string) {
  const job = await prisma.jobRun.create({
    data: { type, status: "running" },
  });
  logger.info("job", `Job started: ${type}`, { jobId: job.id });

  try {
    let detail = "";
    if (type === "sync_accounts") {
      detail = await jobSyncAccounts();
    } else if (type === "analyse_performance") {
      detail = await jobAnalysePerformance();
    } else if (type === "generate_recommendations") {
      detail = await jobGenerateRecommendations();
    } else if (type === "sync_competitors") {
      detail = await jobSyncCompetitors();
    } else if (type === "compute_experiments") {
      detail = await jobComputeExperiments();
    } else if (type === "publish_scheduled") {
      detail = await jobPublishScheduledPosts();
    } else {
      throw new Error(`Unknown job type: ${type}`);
    }

    await prisma.jobRun.update({
      where: { id: job.id },
      data: { status: "success", finishedAt: new Date(), detail },
    });
    logger.info("job", `Job succeeded: ${type}`, { jobId: job.id, detail });
    return { jobId: job.id, status: "success" as const, detail };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await prisma.jobRun.update({
      where: { id: job.id },
      data: { status: "failed", finishedAt: new Date(), error: message },
    });
    logger.error("job", `Job failed: ${type}`, { jobId: job.id, error: message });
    return { jobId: job.id, status: "failed" as const, error: message };
  }
}

async function jobSyncAccounts() {
  const { syncTikTokAccount } = await import("@/services/tiktok-sync");
  const accounts = await prisma.connectedAccount.findMany({
    where: { platform: "tiktok", status: { in: ["active", "error"] } },
  });
  let ok = 0;
  let fail = 0;
  for (const acc of accounts) {
    try {
      const result = await syncTikTokAccount(acc.id);
      if (result.success) ok++;
      else fail++;
    } catch {
      fail++;
    }
  }
  return `Synced ${accounts.length} accounts (${ok} ok, ${fail} failed)`;
}

async function jobSyncCompetitors() {
  const { syncCompetitor } = await import("@/services/competitor-sync");
  const competitors = await prisma.competitor.findMany();
  let ok = 0;
  let fail = 0;
  for (const c of competitors) {
    try {
      const result = await syncCompetitor(c.id);
      if (result.success) ok++;
      else fail++;
    } catch {
      fail++;
    }
  }
  return `Synced ${competitors.length} competitors (${ok} ok, ${fail} failed)`;
}

async function jobComputeExperiments() {
  const projects = await prisma.project.findMany({ select: { id: true, name: true } });
  let created = 0;
  let updated = 0;
  for (const p of projects) {
    const r = await computeExperiments(p.id);
    created += r.created;
    updated += r.updated;
  }
  return `Experiments: ${created} created, ${updated} updated across ${projects.length} projects`;
}

async function jobPublishScheduledPosts() {
  const { jobPublishScheduled } = await import("@/services/publish-worker");
  return await jobPublishScheduled();
}

async function jobAnalysePerformance() {
  const projects = await prisma.project.findMany({ select: { id: true, name: true } });
  let findings = 0;

  for (const project of projects) {
    const report = await buildInsightReport(project.id);
    if (!report || report.totals.posts === 0) {
      await prisma.finding.create({
        data: {
          projectId: project.id,
          severity: "info",
          text: `No published posts yet for ${project.name}. Connect an account and sync to unlock analysis.`,
          source: "job:analyse_performance",
          metaJson: "{}",
        },
      });
      findings++;
      continue;
    }

    await computeExperiments(project.id);

    const best = report.topPosts[0];
    if (best && best.views > 0) {
      await prisma.finding.create({
        data: {
          projectId: project.id,
          severity: "opportunity",
          text: `Top post: “${best.hook}” — ${best.views.toLocaleString()} views, ${best.likes} likes, ${best.engagementRate}% engagement${best.hashtags.length ? ` (${best.hashtags.slice(0, 3).join(" ")})` : ""}. Why: ${best.engagementRate >= report.totals.engagementRate ? "above-average engagement plus reach" : "strong reach relative to peers"}.`,
          source: "job:analyse_performance",
          metaJson: JSON.stringify({
            postIds: [best.id],
            metrics: {
              views: best.views,
              likes: best.likes,
              engagementRate: best.engagementRate,
            },
          }),
        },
      });
      findings++;
    }

    const worst = report.bottomPosts[0];
    if (worst && best && worst.id !== best.id && worst.views < best.views * 0.25) {
      await prisma.finding.create({
        data: {
          projectId: project.id,
          severity: "warning",
          text: `Underperforming: “${worst.hook}” — ${worst.views.toLocaleString()} views vs top ${best.views.toLocaleString()}. Consider retiring this angle or rewriting the hook.`,
          source: "job:analyse_performance",
          metaJson: JSON.stringify({
            postIds: [worst.id, best.id],
            metrics: { views: worst.views, topViews: best.views },
          }),
        },
      });
      findings++;
    }

    const bestHour = report.postingHours[0];
    if (bestHour && bestHour.count >= 2) {
      await prisma.finding.create({
        data: {
          projectId: project.id,
          severity: "info",
          text: `Best posting hour (UTC): ${bestHour.hour}:00 averages ${bestHour.avgViews.toLocaleString()} views across ${bestHour.count} posts.`,
          source: "job:analyse_performance",
          metaJson: JSON.stringify({ hour: bestHour.hour, avgViews: bestHour.avgViews }),
        },
      });
      findings++;
    }

    const bestTag = report.hashtags[0];
    if (bestTag) {
      await prisma.finding.create({
        data: {
          projectId: project.id,
          severity: "opportunity",
          text: `Strongest hashtag: ${bestTag.tag} averages ${bestTag.avgViews.toLocaleString()} views (${bestTag.count} posts).`,
          source: "job:analyse_performance",
          metaJson: JSON.stringify({ tag: bestTag.tag, avgViews: bestTag.avgViews }),
        },
      });
      findings++;
    }
  }

  return `Created ${findings} findings across ${projects.length} projects`;
}

async function jobGenerateRecommendations() {
  const projects = await prisma.project.findMany({ select: { id: true, name: true } });
  let created = 0;

  for (const project of projects) {
    const report = await buildInsightReport(project.id);
    if (!report || report.totals.posts === 0) continue;

    try {
      const result = await completeLogged(
        {
          messages: [
            {
              role: "system",
              content: `You are a senior growth strategist. Using ONLY the INSIGHT_REPORT numbers, write exactly 2 short recommendation lines.
Rules:
- Cite posts as [[post:ID]] using ids from the report
- Never invent metrics
- Never use v= shorthand
- Explain WHY using engagement, relative rank, hashtags, or posting time
- No markdown headings`,
            },
            {
              role: "user",
              content: `${serializeForRecs(report)}\n\nWrite 2 recommendations for Lucas.`,
            },
          ],
          temperature: 0.4,
          maxTokens: 500,
        },
        { action: "generate_recommendations", projectId: project.id },
      );

      for (const line of result.content
        .split("\n")
        .map((l) => l.replace(/^[-*\d.\s]+/, "").trim())
        .filter(Boolean)
        .slice(0, 2)) {
        const ids = [...line.matchAll(/\[\[post:([a-z0-9]+)\]\]/gi)].map((m) => m[1]);
        await prisma.finding.create({
          data: {
            projectId: project.id,
            severity: "opportunity",
            text: line,
            source: "job:generate_recommendations",
            metaJson: JSON.stringify({ postIds: ids }),
          },
        });
        created++;
      }
    } catch (err) {
      logger.warn("job", `Recommendation generation skipped for ${project.name}`, {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return `Generated ${created} grounded AI recommendations`;
}

function serializeForRecs(report: NonNullable<Awaited<ReturnType<typeof buildInsightReport>>>) {
  return [
    `Project ${report.projectName}`,
    `Avg views ${report.totals.avgViews}, engagement ${report.totals.engagementRate}%`,
    "Top:",
    ...report.topPosts.slice(0, 5).map(formatPostLine),
    "Bottom:",
    ...report.bottomPosts.slice(0, 3).map(formatPostLine),
    "Hours:",
    ...report.postingHours.slice(0, 3).map((h) => `${h.hour}:00 → ${h.avgViews}`),
  ].join("\n");
}

let schedulerStarted = false;

export function startBackgroundScheduler() {
  if (schedulerStarted || typeof window !== "undefined") return;
  schedulerStarted = true;
  logger.info("job", "Background scheduler started");

  const minute = 60 * 1000;
  const hour = 60 * minute;
  
  // Publish engine (every 2 min)
  setInterval(() => void runJob("publish_scheduled"), 2 * minute);
  
  // Analytics & sync (every 6–24 hours)
  setInterval(() => void runJob("sync_accounts"), 6 * hour);
  setInterval(() => void runJob("sync_competitors"), 8 * hour);
  setInterval(() => void runJob("analyse_performance"), 12 * hour);
  setInterval(() => void runJob("compute_experiments"), 12 * hour);
  setInterval(() => void runJob("generate_recommendations"), 24 * hour);
}
