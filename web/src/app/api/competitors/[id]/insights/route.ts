import { fail, ok } from "@/lib/api-response";
import { guardProjectId, isAuthError } from "@/lib/api-auth";
import { prisma } from "@/lib/db";
import { withApi } from "@/lib/api-route";

export const runtime = "nodejs";
export const maxDuration = 60;

async function handlePOST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const existing = await prisma.competitor.findUnique({ where: { id } });
    if (!existing) return fail("Competitor not found", 404);
    await guardProjectId(existing.projectId);

    const body = (await req.json().catch(() => ({}))) as {
      force?: boolean;
      provider?: string;
    };

    const { generateCompetitorSummary, refreshCompetitorFindings } =
      await import("@/services/intel/competitor-insights");
    const result = await generateCompetitorSummary(id, {
      force: body.force !== false,
      provider: body.provider as never,
    });
    await refreshCompetitorFindings(existing.projectId);

    const competitor = await prisma.competitor.findUnique({ where: { id } });
    return ok({ ...result, competitor });
  } catch (err) {
    if (isAuthError(err)) return fail(err.message, err.status);
    return fail(err);
  }
}

export const POST = withApi(
  handlePOST,
  "POST src/app/api/competitors/[id]/insights/route.ts",
);
