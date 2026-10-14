import { NextResponse } from "next/server";
import { completeLogged } from "@/lib/ai/logged";
import { AuthError, guardProjectId } from "@/lib/api-auth";
import { buildInsightReport, serializeInsightReport } from "@/services/analytics";
import { ensureContentFlows } from "@/services/brand-packs";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/db";
import { withApi } from "@/lib/api-route";


export const runtime = "nodejs";
export const maxDuration = 60;

export type OpportunityWhy = {
  label: string;
  detail: string;
};

export type Opportunity = {
  title: string;
  confidence: number;
  confidenceLabel: string;
  expectedViewsMin: number;
  expectedViewsMax: number;
  similarPostCount: number;
  reason: string;
  intent: string;
  suggestedFlow: string;
  angle: string;
  why: OpportunityWhy[];
};

function confidenceLabel(n: number) {
  if (n >= 90) return "Very High";
  if (n >= 80) return "High";
  if (n >= 70) return "Medium";
  return "Exploratory";
}

function viewRange(confidence: number, baseline: number) {
  const base = Math.max(80, baseline || 200);
  const mult = confidence / 100;
  const mid = Math.round(base * (0.7 + mult * 0.9));
  return {
    min: Math.round(mid * 0.75),
    max: Math.round(mid * 1.35),
  };
}

async function handlePOST(req: Request) {
  try {
    const body = (await req.json()) as { projectId?: string };
    if (!body.projectId) {
      return NextResponse.json({ error: "projectId required" }, { status: 400 });
    }
    await guardProjectId(body.projectId);

    const [report, flows, recentHooks] = await Promise.all([
      buildInsightReport(body.projectId),
      ensureContentFlows(body.projectId),
      prisma.post.findMany({
        where: { projectId: body.projectId },
        orderBy: { createdAt: "desc" },
        take: 30,
        select: {
          id: true,
          hook: true,
          status: true,
          views: true,
          theme: true,
          publishedAt: true,
        },
      }),
    ]);

    if (!report) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    const bestFlow = flows[0];
    const avgTop =
      report.topPosts.slice(0, 5).reduce((s, p) => s + p.views, 0) /
      Math.max(report.topPosts.slice(0, 5).length, 1);
    const competitorGaps = report.competitors
      .flatMap((c) => c.posts.slice(0, 2).map((p) => ({ handle: c.handle, hook: p.hook })))
      .slice(0, 6);

    const system = `You are an AI social media strategist for a TikTok growth OS.
Propose exactly 5 high-confidence content opportunities for TODAY.
Use ONLY the insight report + recent hooks. Do not invent metrics.
Each idea must be a concrete carousel topic/title.
For each opportunity include a "why" array of 3–5 short evidence bullets grounded in the data (hashtags, similar posts, competitor gaps, recency).
Return JSON only.`;

    const user = `${serializeInsightReport(report)}

Recent hooks (avoid repeating):
${recentHooks.map((h) => `- “${h.hook}” (${h.status}, ${h.views} views)`).join("\n")}

Competitor angles:
${competitorGaps.map((c) => `- @${c.handle}: “${c.hook}”`).join("\n") || "(none synced)"}

Best flow: ${bestFlow?.name ?? "Narrative Arc"} (${bestFlow?.avgEngagement ?? 0}% eng, n=${bestFlow?.sampleSize ?? 0})
Top-post avg views (reference): ${Math.round(avgTop)}

Return JSON:
{
  "opportunities": [
    {
      "title": "compelling topic title",
      "confidence": 92,
      "reason": "1 sentence summary",
      "intent": "Educational Carousel|Viral Story|Founder Story|Motivational|Personal Story|App Promotion",
      "suggestedFlow": "${bestFlow?.slug ?? "narrative-arc"}",
      "angle": "short angle",
      "similarPostCount": 3,
      "why": [
        { "label": "Hashtag lift", "detail": "Stoic hashtags outperform by citing report patterns" },
        { "label": "Similar hook", "detail": "Reference a real top post hook + views" },
        { "label": "Competitor gap", "detail": "What competitors are not covering" },
        { "label": "Audience fit", "detail": "Why it fits this project" },
        { "label": "Recency", "detail": "How long since a similar topic" }
      ]
    }
  ]
}`;

    const result = await completeLogged(
      {
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        temperature: 0.7,
        maxTokens: 2800,
        json: true,
      },
      { action: "suggest_topics", projectId: body.projectId },
    );

    let parsed: { opportunities?: Partial<Opportunity>[] };
    try {
      parsed = JSON.parse(result.content);
    } catch {
      const m = result.content.match(/\{[\s\S]*\}/);
      if (!m) throw new Error("Invalid opportunities JSON");
      parsed = JSON.parse(m[0]);
    }

    const topHook = report.topPosts[0];
    const daysSinceTop = topHook?.publishedAt
      ? Math.max(
          1,
          Math.round(
            (Date.now() - new Date(topHook.publishedAt).getTime()) / 86400000,
          ),
        )
      : 12;

    const opportunities: Opportunity[] = (parsed.opportunities || [])
      .slice(0, 5)
      .map((o) => {
        const confidence = Math.min(98, Math.max(60, Number(o.confidence) || 80));
        const range = viewRange(confidence, avgTop || report.totals.avgViews || 200);
        const why =
          o.why?.length ?
            o.why
          : [
              {
                label: "Similar performance",
                detail: topHook
                  ? `Similar hook “${topHook.hook.slice(0, 48)}” got ${topHook.views} views`
                  : "Based on your historical engagement patterns",
              },
              {
                label: "Audience fit",
                detail: "Fits themes that already work on your page",
              },
              {
                label: "Competitor gap",
                detail:
                  competitorGaps[0] ?
                    `Competitors cover angles like “${competitorGaps[0].hook.slice(0, 40)}” — this is adjacent but fresher`
                  : "Low competitor saturation on this angle",
              },
              {
                label: "Recency",
                detail: `Last similar high-performer was ~${daysSinceTop} days ago`,
              },
            ];
        return {
          title: o.title || "Untitled opportunity",
          confidence,
          confidenceLabel: confidenceLabel(confidence),
          expectedViewsMin: range.min,
          expectedViewsMax: range.max,
          similarPostCount: Number(o.similarPostCount) || Math.min(14, report.topPosts.length || 3),
          reason: o.reason || "",
          intent: o.intent || "Educational Carousel",
          suggestedFlow: o.suggestedFlow || bestFlow?.slug || "narrative-arc",
          angle: o.angle || "",
          why,
        };
      })
      .sort((a, b) => b.confidence - a.confidence);

    if (!opportunities.length && topHook) {
      const range = viewRange(88, avgTop);
      opportunities.push({
        title: `A sharper take on: ${topHook.hook.slice(0, 60)}`,
        confidence: 88,
        confidenceLabel: "High",
        expectedViewsMin: range.min,
        expectedViewsMax: range.max,
        similarPostCount: report.topPosts.length,
        reason: `Your top post earned ${topHook.views} views — adjacent angles usually transfer.`,
        intent: "Educational Carousel",
        suggestedFlow: bestFlow?.slug || "narrative-arc",
        angle: "remix top performer",
        why: [
          {
            label: "Similar hook",
            detail: `“${topHook.hook}” got ${topHook.views} views`,
          },
          {
            label: "Flow",
            detail: `${bestFlow?.name || "Narrative"} averages ${bestFlow?.avgEngagement ?? 0}% eng`,
          },
        ],
      });
    }

    logger.info("ai", "Topic opportunities ready", {
      projectId: body.projectId,
      count: opportunities.length,
      costHint: "1 AI analysis",
    });

    return NextResponse.json({
      opportunities,
      generatedAt: new Date().toISOString(),
      cost: {
        analyses: 1,
        estimateSeconds: 10,
        looksAt: ["your posts", "competitors", "trends"],
      },
      inspiredBy: report.topPosts.slice(0, 3).map((p) => ({
        id: p.id,
        hook: p.hook,
        coverUrl: p.coverUrl,
        shareUrl: p.shareUrl,
        views: p.views,
        likes: p.likes,
        comments: p.comments,
        publishedAt: p.publishedAt,
        status: p.status,
        caption: p.caption,
      })),
      bestFlow: bestFlow
        ? {
            name: bestFlow.name,
            slug: bestFlow.slug,
            avgEngagement: bestFlow.avgEngagement,
            sampleSize: bestFlow.sampleSize,
            reason: `Your ${bestFlow.name} posts average ${bestFlow.avgEngagement}% engagement across ${bestFlow.sampleSize} samples.`,
          }
        : null,
      provider: result.provider,
      model: result.model,
    });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    const message = err instanceof Error ? err.message : "Opportunities failed";
    logger.error("ai", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export const POST = withApi(handlePOST, "POST src/app/api/ai/opportunities/route.ts");
