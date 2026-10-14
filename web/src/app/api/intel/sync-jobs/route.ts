import { fail, ok } from "@/lib/api-response";
import { guardProjectId, isAuthError } from "@/lib/api-auth";
import { prisma } from "@/lib/db";
import { withApi } from "@/lib/api-route";

export const runtime = "nodejs";
export const maxDuration = 300;

async function handleGET(req: Request) {
  try {
    const projectId = new URL(req.url).searchParams.get("projectId");
    if (!projectId) return fail("projectId required", 400);
    await guardProjectId(projectId);
    const jobs = await prisma.intelSyncJob.findMany({
      where: { projectId },
      orderBy: { createdAt: "desc" },
      take: 40,
      include: {
        competitor: { select: { id: true, name: true, handle: true } },
      },
    });
    return ok({ jobs });
  } catch (err) {
    if (isAuthError(err)) return fail(err.message, err.status);
    return fail(err);
  }
}

/** Run due scheduled competitor syncs (daily/weekly) or force all */
async function handlePOST(req: Request) {
  try {
    const body = (await req.json()) as {
      projectId?: string;
      force?: boolean;
      competitorId?: string;
    };
    if (!body.projectId) return fail("projectId required", 400);
    await guardProjectId(body.projectId);

    const { ingestCompetitor } = await import("@/services/intel/ingest");

    if (body.competitorId) {
      const result = await ingestCompetitor(body.competitorId);
      return ok({ synced: 1, results: [result] });
    }

    const now = new Date();
    const competitors = await prisma.competitor.findMany({
      where: {
        projectId: body.projectId,
        ...(body.force
          ? {}
          : {
              OR: [
                { syncCadence: "daily" },
                { syncCadence: "weekly" },
                { nextSyncAt: { lte: now } },
              ],
            }),
      },
    });

    const due = body.force
      ? competitors
      : competitors.filter((c) => {
          if (c.syncCadence === "manual" && !c.nextSyncAt) return false;
          if (!c.lastSyncAt) return true;
          const age = now.getTime() - c.lastSyncAt.getTime();
          if (c.syncCadence === "daily") return age > 20 * 60 * 60 * 1000;
          if (c.syncCadence === "weekly") return age > 6 * 24 * 60 * 60 * 1000;
          return c.nextSyncAt != null && c.nextSyncAt <= now;
        });

    const results = [];
    for (const c of due.slice(0, 8)) {
      const r = await ingestCompetitor(c.id);
      const next =
        c.syncCadence === "weekly"
          ? new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)
          : c.syncCadence === "daily"
            ? new Date(now.getTime() + 24 * 60 * 60 * 1000)
            : null;
      await prisma.competitor.update({
        where: { id: c.id },
        data: { nextSyncAt: next },
      });
      results.push({ competitorId: c.id, ...r });
    }

    return ok({ synced: results.length, results });
  } catch (err) {
    if (isAuthError(err)) return fail(err.message, err.status);
    return fail(err);
  }
}

export const GET = withApi(handleGET, "GET src/app/api/intel/sync-jobs/route.ts");
export const POST = withApi(
  handlePOST,
  "POST src/app/api/intel/sync-jobs/route.ts",
);
