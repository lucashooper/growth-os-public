import { fail, ok } from "@/lib/api-response";
import { AuthError, guardProjectId } from "@/lib/api-auth";
import { ensureContentFlows } from "@/services/brand-packs";
import { withApi } from "@/lib/api-route";


export const runtime = "nodejs";

async function handleGET(req: Request) {
  try {
    const projectId = new URL(req.url).searchParams.get("projectId");
    if (!projectId) return fail("projectId required", 400);
    await guardProjectId(projectId);
    const flows = await ensureContentFlows(projectId);
    return ok({
      flows: flows.map((f) => ({
        ...f,
        beats: JSON.parse(f.beatsJson || "[]"),
      })),
    });
  } catch (err) {
    if (err instanceof AuthError) return fail(err.message, err.status);
    return fail(err);
  }
}

export const GET = withApi(handleGET, "GET src/app/api/flows/route.ts");
