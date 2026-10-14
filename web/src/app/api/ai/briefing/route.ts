import { NextResponse } from "next/server";
import type { AIProviderId } from "@/lib/ai";
import { completeLogged } from "@/lib/ai/logged";
import { AuthError, guardProjectId } from "@/lib/api-auth";
import { buildInsightReport, serializeInsightReport } from "@/services/analytics";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import { withApi } from "@/lib/api-route";


export const runtime = "nodejs";

type Body = {
  projectId: string;
  provider?: AIProviderId;
  /** Force a new AI call even if today's briefing is cached */
  force?: boolean;
};

function todayKey() {
  return new Date().toISOString().slice(0, 10); // UTC date
}

function cacheKey(projectId: string) {
  return `daily_briefing_v4:${projectId}`;
}

async function handleGET(req: Request) {
  try {
    const url = new URL(req.url);
    const projectId = url.searchParams.get("projectId");
    if (!projectId) {
      return NextResponse.json({ error: "projectId required" }, { status: 400 });
    }
    await guardProjectId(projectId);

    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: { workspaceId: true },
    });
    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    const row = await prisma.setting.findUnique({
      where: {
        workspaceId_key: {
          workspaceId: project.workspaceId,
          key: cacheKey(projectId),
        },
      },
    });
    if (!row?.value) {
      return NextResponse.json({ cached: false });
    }
    try {
      const parsed = JSON.parse(row.value) as {
        date: string;
        briefing: string;
        provider: string;
        model: string;
        citedPosts: unknown[];
      };
      if (parsed.date !== todayKey()) {
        return NextResponse.json({ cached: false });
      }
      return NextResponse.json({
        cached: true,
        briefing: parsed.briefing,
        provider: parsed.provider,
        model: parsed.model,
        citedPosts: parsed.citedPosts || [],
        date: parsed.date,
      });
    } catch {
      return NextResponse.json({ cached: false });
    }
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return NextResponse.json({ error: "Failed to load briefing" }, { status: 500 });
  }
}

async function handlePOST(req: Request) {
  try {
    const body = (await req.json()) as Body;
    if (!body.projectId) {
      return NextResponse.json({ error: "projectId required" }, { status: 400 });
    }
    await guardProjectId(body.projectId);

    const project = await prisma.project.findUnique({
      where: { id: body.projectId },
      select: { workspaceId: true },
    });
    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    // Serve today's cached briefing unless force refresh
    if (!body.force) {
      const row = await prisma.setting.findUnique({
        where: {
          workspaceId_key: {
            workspaceId: project.workspaceId,
            key: cacheKey(body.projectId),
          },
        },
      });
      if (row?.value) {
        try {
          const parsed = JSON.parse(row.value) as {
            date: string;
            briefing: string;
            provider: string;
            model: string;
            citedPosts: unknown[];
          };
          if (parsed.date === todayKey() && parsed.briefing) {
            return NextResponse.json({
              briefing: parsed.briefing,
              provider: parsed.provider,
              model: parsed.model,
              citedPosts: parsed.citedPosts || [],
              cached: true,
              date: parsed.date,
            });
          }
        } catch {
          /* regenerate */
        }
      }
    }

    const report = await buildInsightReport(body.projectId);
    if (!report) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    const competitorCount = await prisma.competitor.count({
      where: { projectId: body.projectId },
    });

    if (report.totals.posts === 0 && competitorCount === 0) {
      return NextResponse.json({
        briefing:
          "Not enough stored data for a live briefing yet. Sync TikTok accounts or add competitors, then refresh.",
        provider: "none",
        model: "none",
        report,
        citedPosts: [],
        cached: false,
      });
    }

    const findings = await prisma.finding.findMany({
      where: { projectId: body.projectId },
      orderBy: { createdAt: "desc" },
      take: 8,
    });

    // Refresh competitor intel for briefing (deterministic + cached summaries)
    const { refreshCompetitorFindings, buildCompetitorBriefingContext } =
      await import("@/services/intel/competitor-insights");
    try {
      await refreshCompetitorFindings(body.projectId);
    } catch (err) {
      logger.warn("ai", "Competitor findings refresh skipped", {
        err: err instanceof Error ? err.message : String(err),
      });
    }
    const competitorContext = await buildCompetitorBriefingContext(
      body.projectId,
    );

    const system = `You are a senior growth strategist inside an AI Growth OS.
Your job is to answer: "What should I do next to grow?"
Write a calm daily briefing grounded in the INSIGHT_REPORT and COMPETITOR_INTELLIGENCE.
Rules:
- Never invent metrics
- Never refer to posts as v= numbers — always use the hook/title
- Cite specific posts as [[post:ID]] using ids from the report
- Totals and [[post:id]] cites MUST come only from TOP/BOTTOM posts of connected accounts
- Never add competitor view counts into workspace totals
- Competitor section is qualitative only
- Use competitor signals to recommend counter-moves (timing, hooks, formats)
- Explain WHY posts worked using engagement rate, relative rank, hashtags, and posting time from the report
- Short paragraphs, no hype, no emojis
- Do not dump long hashtag lists; mention at most 2–3 tags inline when relevant
- Prefer plain sentences over markdown headers (###) and dash-heavy lists
Structure:
1. One-line greeting answering what to do next
2. What was analysed (use totals)
3. Key findings with [[post:id]] citations
4. Competitor moves worth reacting to (1–3 lines)
5. 2–4 recommended actions
6. Recommended post times from the hour data`;

    const user = `${serializeInsightReport(report)}

Stored findings (workspace only — ignore competitor_intel rows for metrics):
${findings.filter((f) => f.source !== "competitor_intel").map((f) => `- ${f.text}`).join("\n") || "(none)"}

${competitorContext}

Write today's briefing.`;

    const result = await completeLogged(
      {
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        temperature: 0.45,
        maxTokens: 1400,
      },
      {
        action: "briefing",
        projectId: body.projectId,
        provider: body.provider,
      },
    );

    const citedIds = [
      ...new Set(
        [...result.content.matchAll(/\[\[post:([a-zA-Z0-9_-]+)\]\]/g)].map(
          (m) => m[1],
        ),
      ),
    ].filter((id) => report.citeablePostIds.includes(id));

    const activeAccounts = await prisma.connectedAccount.findMany({
      where: { projectId: body.projectId, status: "active" },
      select: { id: true },
    });
    const activeIds = activeAccounts.map((a) => a.id);

    const citedPosts = citedIds.length
      ? await prisma.post.findMany({
          where: {
            id: { in: citedIds },
            projectId: body.projectId,
            accountId: activeIds.length ? { in: activeIds } : { in: [] },
            NOT: { theme: { in: ["competitor", "tiktok-foreign"] } },
          },
        })
      : [];
    const citedOwned = citedPosts.filter((p) =>
      report.citeablePostIds.includes(p.id),
    );

    const payload = {
      date: todayKey(),
      briefing: result.content,
      provider: result.provider,
      model: result.model,
      citedPosts: citedOwned,
    };

    await prisma.setting.upsert({
      where: {
        workspaceId_key: {
          workspaceId: project.workspaceId,
          key: cacheKey(body.projectId),
        },
      },
      create: {
        workspaceId: project.workspaceId,
        key: cacheKey(body.projectId),
        value: JSON.stringify(payload),
      },
      update: { value: JSON.stringify(payload) },
    });

    logger.info("ai", "Briefing generated from InsightReport", {
      projectId: body.projectId,
      posts: report.totals.posts,
      cited: citedIds.length,
    });

    return NextResponse.json({
      ...payload,
      report,
      cached: false,
    });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    const message = err instanceof Error ? err.message : "Briefing failed";
    logger.error("ai", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export const GET = withApi(handleGET, "GET src/app/api/ai/briefing/route.ts");

export const POST = withApi(handlePOST, "POST src/app/api/ai/briefing/route.ts");
