import { fail, ok } from "@/lib/api-response";
import { AuthError, guardProjectId } from "@/lib/api-auth";
import { buildInsightReport } from "@/services/analytics";
import { withApi } from "@/lib/api-route";


export const runtime = "nodejs";

async function handleGET(
  _req: Request,
  { params }: { params: Promise<{ projectId: string }> },
) {
  try {
    const { projectId } = await params;
    await guardProjectId(projectId);
    const report = await buildInsightReport(projectId);
    if (!report) return fail("Project not found", 404);
    return ok({ report });
  } catch (err) {
    if (err instanceof AuthError) return fail(err.message, err.status);
    return fail(err);
  }
}

export const GET = withApi(handleGET, "GET src/app/api/insights/[projectId]/route.ts");
