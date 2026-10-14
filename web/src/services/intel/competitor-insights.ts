import "server-only";

import type { AIProviderId } from "@/lib/ai";
import { completeLogged } from "@/lib/ai/logged";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import { startOfUtcDay } from "@/services/intel/providers/types";

export type CompetitorSignal = {
  competitorId: string;
  name: string;
  handle: string;
  text: string;
  kind: string;
};

function parseJson<T>(raw: string, fallback: T): T {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

/** Deterministic week-over-week / cross-source signals (no LLM). */
export async function deriveCompetitorSignals(
  projectId: string,
): Promise<CompetitorSignal[]> {
  const competitors = await prisma.competitor.findMany({
    where: { projectId },
    include: {
      posts: { orderBy: { views: "desc" }, take: 5 },
      snapshots: { orderBy: { date: "desc" }, take: 14 },
      assets: { where: { kind: "meta_ad" }, take: 20 },
    },
  });

  const signals: CompetitorSignal[] = [];
  const today = startOfUtcDay().getTime();
  const weekAgo = today - 7 * 24 * 60 * 60 * 1000;

  const quiet: string[] = [];
  const freqUp: string[] = [];
  const emotionalHooks: string[] = [];
  let metaCreativesTotal = 0;

  for (const c of competitors) {
    const label = c.name || (c.handle ? `@${c.handle}` : c.slug);
    const snaps = c.snapshots;
    const latest = snaps[0];
    const weekPrior = snaps.find((s) => s.date.getTime() <= weekAgo);

    if (latest && weekPrior && weekPrior.posts7d > 0) {
      const delta =
        ((latest.posts7d - weekPrior.posts7d) / weekPrior.posts7d) * 100;
      if (delta >= 25) {
        const text = `${label} increased posting frequency by ${Math.round(delta)}% this week.`;
        signals.push({
          competitorId: c.id,
          name: label,
          handle: c.handle,
          text,
          kind: "posting_freq_up",
        });
        freqUp.push(label);
      } else if (delta <= -25) {
        signals.push({
          competitorId: c.id,
          name: label,
          handle: c.handle,
          text: `${label} slowed posting by ${Math.round(Math.abs(delta))}% this week.`,
          kind: "posting_freq_down",
        });
      }
    }

    if ((latest?.posts7d ?? 0) === 0 && (latest?.posts30d ?? 0) > 0) {
      quiet.push(label);
    }

    const hooks = c.posts.map((p) => p.hook).filter(Boolean);
    const emotional = hooks.filter((h) =>
      /i |you |nobody|hardest|afraid|lonely|wasted|finally|stop |never /i.test(h),
    );
    if (emotional.length >= 2) {
      emotionalHooks.push(label);
    }

    const ads = c.assets.length;
    metaCreativesTotal += ads;
    if (ads >= 3) {
      signals.push({
        competitorId: c.id,
        name: label,
        handle: c.handle,
        text: `${label} has ${ads} Meta creatives tracked.`,
        kind: "meta_ads",
      });
    }

    const signalsData = parseJson<{
      topHashtags?: { tag: string; count: number }[];
      appStore?: { rating?: number; version?: string } | null;
    }>(c.signalsJson, {});

    if (signalsData.topHashtags?.[0]) {
      signals.push({
        competitorId: c.id,
        name: label,
        handle: c.handle,
        text: `${label}'s top hashtag recently: ${signalsData.topHashtags[0].tag}.`,
        kind: "hashtag",
      });
    }

    if (signalsData.appStore?.version) {
      signals.push({
        competitorId: c.id,
        name: label,
        handle: c.handle,
        text: `${label}'s iOS app is on v${signalsData.appStore.version}${
          signalsData.appStore.rating != null
            ? ` (${signalsData.appStore.rating.toFixed(1)}★)`
            : ""
        }.`,
        kind: "app_store",
      });
    }
  }

  if (quiet.length) {
    signals.push({
      competitorId: "",
      name: "market",
      handle: "",
      text: `Competitors are unusually quiet: ${quiet.slice(0, 4).join(", ")}.`,
      kind: "quiet_market",
    });
  }

  if (emotionalHooks.length >= 2) {
    signals.push({
      competitorId: "",
      name: "market",
      handle: "",
      text: `Most competitors (${emotionalHooks.slice(0, 3).join(", ")}) are using emotional first-slide hooks.`,
      kind: "hook_style",
    });
  }

  if (metaCreativesTotal >= 6) {
    signals.push({
      competitorId: "",
      name: "market",
      handle: "",
      text: `Competitors have launched ${metaCreativesTotal} Meta creatives in tracked inventory.`,
      kind: "meta_market",
    });
  }

  return signals.slice(0, 40);
}

export async function generateCompetitorSummary(
  competitorId: string,
  opts?: { provider?: AIProviderId; force?: boolean },
): Promise<{ summary: string; signals: CompetitorSignal[] }> {
  const competitor = await prisma.competitor.findUniqueOrThrow({
    where: { id: competitorId },
    include: {
      posts: { orderBy: { views: "desc" }, take: 8 },
      assets: { orderBy: { observedAt: "desc" }, take: 12 },
    },
  });

  if (
    !opts?.force &&
    competitor.aiSummary &&
    competitor.aiSummaryAt &&
    Date.now() - competitor.aiSummaryAt.getTime() < 6 * 60 * 60 * 1000
  ) {
    const signals = (await deriveCompetitorSignals(competitor.projectId)).filter(
      (s) => s.competitorId === competitorId || s.competitorId === "",
    );
    return { summary: competitor.aiSummary, signals };
  }

  const projectSignals = await deriveCompetitorSignals(competitor.projectId);
  const own = projectSignals.filter(
    (s) => s.competitorId === competitorId || s.kind === "quiet_market",
  );

  const label =
    competitor.name ||
    (competitor.handle ? `@${competitor.handle}` : competitor.slug);
  const hooks = competitor.posts.map((p) => `- ${p.hook} (${p.views} views)`);
  const signalsJson = parseJson<Record<string, unknown>>(
    competitor.signalsJson,
    {},
  );

  const prompt = `You are a competitive intelligence analyst for a TikTok creator brand.
Write 3-5 short bullet insights about competitor "${label}".
Be specific and actionable. No fluff. Each bullet one sentence.

Deterministic signals:
${own.map((s) => `- ${s.text}`).join("\n") || "- (none yet)"}

Profile: followers=${competitor.followers}, postingFreq=${competitor.postingFreq}, avgViews=${competitor.avgViews}
Signals JSON: ${JSON.stringify(signalsJson).slice(0, 1500)}
Top posts:
${hooks.join("\n") || "- none"}
Assets: ${competitor.assets.map((a) => `${a.kind}:${a.title || a.url}`).slice(0, 8).join("; ") || "none"}

Return ONLY the bullets, each starting with "• ".`;

  let summary = own
    .filter((s) => s.competitorId === competitorId)
    .slice(0, 4)
    .map((s) => `• ${s.text}`)
    .join("\n");

  try {
    const result = await completeLogged(
      {
        messages: [
          {
            role: "system",
            content: "You write crisp competitive marketing intelligence.",
          },
          { role: "user", content: prompt },
        ],
        temperature: 0.4,
        maxTokens: 500,
      },
      {
        action: "competitor_insights",
        projectId: competitor.projectId,
        provider: opts?.provider,
      },
    );
    if (result.content?.trim()) summary = result.content.trim();
  } catch (err) {
    logger.warn("ai", "Competitor AI summary failed; using deterministic", {
      err: err instanceof Error ? err.message : String(err),
    });
    if (!summary) {
      summary = `• ${label} has ${competitor.followers.toLocaleString()} followers and posts ${competitor.postingFreq || "irregularly"}.`;
    }
  }

  await prisma.competitor.update({
    where: { id: competitorId },
    data: { aiSummary: summary, aiSummaryAt: new Date() },
  });

  return { summary, signals: own };
}

/** Refresh project-level Finding rows from competitor intel. */
export async function refreshCompetitorFindings(projectId: string) {
  const signals = await deriveCompetitorSignals(projectId);
  const dayStart = startOfUtcDay();

  await prisma.finding.deleteMany({
    where: {
      projectId,
      source: "competitor_intel",
      createdAt: { gte: dayStart },
    },
  });

  for (const s of signals.slice(0, 12)) {
    await prisma.finding.create({
      data: {
        projectId,
        severity: s.kind.includes("up") || s.kind === "quiet_market" ? "warn" : "info",
        text: s.text,
        source: "competitor_intel",
        metaJson: JSON.stringify({
          kind: s.kind,
          competitorId: s.competitorId,
          handle: s.handle,
        }),
      },
    });
  }

  return signals;
}

export async function buildCompetitorBriefingContext(projectId: string): Promise<string> {
  const findings = await prisma.finding.findMany({
    where: { projectId, source: "competitor_intel" },
    orderBy: { createdAt: "desc" },
    take: 15,
  });
  const competitors = await prisma.competitor.findMany({
    where: { projectId },
    select: {
      name: true,
      handle: true,
      aiSummary: true,
      postingFreq: true,
      followers: true,
      avgViews: true,
    },
    take: 12,
  });

  const lines: string[] = ["## Competitor intelligence"];
  if (findings.length) {
    lines.push("Recent signals:");
    for (const f of findings) lines.push(`- ${f.text}`);
  }
  for (const c of competitors) {
    const label = c.name || (c.handle ? `@${c.handle}` : "competitor");
    lines.push(
      `\n### ${label} (${c.followers} followers, ${c.postingFreq}, avg ${c.avgViews} views)`,
    );
    if (c.aiSummary) lines.push(c.aiSummary);
  }
  return lines.join("\n");
}
