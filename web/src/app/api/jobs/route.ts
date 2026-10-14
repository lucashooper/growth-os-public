import { prisma } from "@/lib/db";
import { isAuthError, requireUser } from "@/lib/api-auth";
import { fail, ok } from "@/lib/api-response";
import { withApi } from "@/lib/api-route";
import { logger } from "@/lib/logger";

export const runtime = "nodejs";

async function handleGET() {
  try {
    await requireUser();
    const jobs = await prisma.jobRun.findMany({
      orderBy: { startedAt: "desc" },
      take: 50,
    });
    return ok({ jobs });
  } catch (err) {
    if (isAuthError(err)) return fail(err.message, err.status);
    return fail(err, 500, "job");
  }
}

async function handlePOST(req: Request) {
  try {
    await requireUser();
    const body = (await req.json()) as { type?: string };
    if (!body.type) return fail("type required", 400);
    const { runJob } = await import("@/services/jobs");
    const result = await runJob(body.type);
    return ok(result);
  } catch (err) {
    if (isAuthError(err)) return fail(err.message, err.status);
    logger.error("api", "POST /api/jobs failed", {
      message: err instanceof Error ? err.message : String(err),
    });
    return fail(err, 500, "job");
  }
}

export const GET = withApi(handleGET, "GET src/app/api/jobs/route.ts");

export const POST = withApi(handlePOST, "POST src/app/api/jobs/route.ts");
