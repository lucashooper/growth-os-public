import { fail, ok } from "@/lib/api-response";
import { guardProjectId, isAuthError } from "@/lib/api-auth";
import { withApi } from "@/lib/api-route";

export const runtime = "nodejs";
export const maxDuration = 90;

async function handlePOST(req: Request) {
  try {
    const body = (await req.json()) as { projectId?: string; query?: string };
    if (!body.projectId) return fail("projectId required", 400);
    if (!body.query?.trim()) return fail("query required", 400);
    await guardProjectId(body.projectId);

    const { deepSearchCompetitors } = await import(
      "@/services/intel/deep-search"
    );
    const candidates = await deepSearchCompetitors(body.query.trim());
    return ok({ query: body.query.trim(), candidates });
  } catch (err) {
    if (isAuthError(err)) return fail(err.message, err.status);
    return fail(err);
  }
}

export const POST = withApi(
  handlePOST,
  "POST src/app/api/intel/deep-search/route.ts",
);
