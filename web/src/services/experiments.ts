import "server-only";

import { prisma } from "@/lib/db";
import { buildInsightReport, type CohortArm } from "@/services/analytics";
import { logger } from "@/lib/logger";

/**
 * Auto-compute cohort experiments from published posts.
 * Confidence is a sample-size heuristic, not a statistical p-value.
 */
export async function computeExperiments(projectId: string) {
  const report = await buildInsightReport(projectId);
  if (!report || report.totals.posts < 3) {
    return { created: 0, updated: 0 };
  }

  let created = 0;
  let updated = 0;

  const defs: { name: string; kind: string; arms: CohortArm[]; hypothesis: string }[] = [
    {
      name: "Posting hour",
      kind: "auto:hour",
      arms: report.cohorts.byHour,
      hypothesis: "Certain UTC hours outperform the project average view count.",
    },
    {
      name: "Primary hashtag",
      kind: "auto:hashtag",
      arms: report.cohorts.byHashtag,
      hypothesis: "Lead hashtags correlate with higher average views.",
    },
    {
      name: "Theme / style",
      kind: "auto:theme",
      arms: report.cohorts.byTheme,
      hypothesis: "Content themes differ in average reach.",
    },
  ];

  for (const def of defs) {
    if (def.arms.length < 2) continue;
    const winner = def.arms[0];
    const baseline = def.arms[def.arms.length - 1];
    const lift =
      baseline.avgViews > 0
        ? (winner.avgViews - baseline.avgViews) / baseline.avgViews
        : winner.liftVsMean;
    const sample = def.arms.reduce((s, a) => s + a.sampleSize, 0);
    // Significant enough to surface: winner confidence ≥ 0.45 and positive lift
    const status =
      winner.confidence >= 0.45 && lift > 0.15 ? "winner" : "running";

    const existing = await prisma.experiment.findUnique({
      where: { projectId_name: { projectId, name: def.name } },
    });

    const data = {
      hypothesis: def.hypothesis,
      kind: def.kind,
      status,
      posts: sample,
      winner: winner.label,
      confidence: winner.confidence,
      lift: Number(lift.toFixed(3)),
      armsJson: JSON.stringify(def.arms),
    };

    if (existing) {
      await prisma.experiment.update({ where: { id: existing.id }, data });
      updated++;
    } else {
      await prisma.experiment.create({
        data: { projectId, name: def.name, ...data },
      });
      created++;
    }
  }

  logger.info("job", "Computed experiments", { projectId, created, updated });
  return { created, updated };
}
