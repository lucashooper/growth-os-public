import { fail, ok } from "@/lib/api-response";
import { AuthError, requireUser } from "@/lib/auth";
import { withApi } from "@/lib/api-route";
import { deleteWorkspaceForUser } from "@/services/account-deletion";

export const runtime = "nodejs";

async function handleDELETE(req: Request) {
  try {
    const user = await requireUser();
    const body = (await req.json().catch(() => ({}))) as { workspaceId?: string };
    const workspaceId = body.workspaceId?.trim();
    if (!workspaceId) return fail("workspaceId is required", 400);

    await deleteWorkspaceForUser(workspaceId, user.id);
    return ok({ deleted: true });
  } catch (err) {
    if (err instanceof AuthError) return fail(err.message, err.status);
    const message = err instanceof Error ? err.message : "Delete failed";
    const status = message.includes("Only workspace owners") ? 403 : 500;
    return fail(message, status);
  }
}

export const DELETE = withApi(handleDELETE, "DELETE src/app/api/workspace/delete/route.ts");
