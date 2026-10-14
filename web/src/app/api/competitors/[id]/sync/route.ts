import { fail, ok } from "@/lib/api-response";
import { guardProjectId, isAuthError } from "@/lib/api-auth";
import { prisma } from "@/lib/db";
import { withApi } from "@/lib/api-route";
import { logger } from "@/lib/logger";

export const runtime = "nodejs";
export const maxDuration = 120;

async function handlePOST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const existing = await prisma.competitor.findUnique({ where: { id } });
    if (!existing) return fail("Competitor not found", 404);
    await guardProjectId(existing.projectId);

    const { ingestCompetitor } = await import("@/services/intel/ingest");
    const result = await ingestCompetitor(id);

    try {
      const { generateCompetitorSummary, refreshCompetitorFindings } =
        await import("@/services/intel/competitor-insights");
      await generateCompetitorSummary(id, { force: true });
      await refreshCompetitorFindings(existing.projectId);
    } catch (err) {
      logger.warn("ai", "Post-ingest insights skipped", {
        err: err instanceof Error ? err.message : String(err),
      });
    }

    const competitor = await prisma.competitor.findUnique({
      where: { id },
      include: {
        posts: { orderBy: { views: "desc" }, take: 20 },
        assets: { orderBy: { observedAt: "desc" }, take: 20 },
        snapshots: { orderBy: { date: "desc" }, take: 7 },
        _count: { select: { posts: true, assets: true } },
      },
    });
    return ok({ ...result, competitor });
  } catch (err) {
    if (isAuthError(err)) return fail(err.message, err.status);
    logger.error("api", "POST /api/competitors/[id]/sync failed", {
      message: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined,
    });
    return fail(err, 500, "sync");
  }
}

export const POST = withApi(handlePOST, "POST src/app/api/competitors/[id]/sync/route.ts");
