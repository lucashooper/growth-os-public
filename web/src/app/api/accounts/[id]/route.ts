import { fail, ok } from "@/lib/api-response";
import { isAuthError, requireProjectAccess } from "@/lib/api-auth";
import { prisma } from "@/lib/db";
import { withApi } from "@/lib/api-route";
import { logger } from "@/lib/logger";
import { revokeTikTokToken } from "@/services/tiktok-oauth";

export const runtime = "nodejs";

async function handleDELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const existing = await prisma.connectedAccount.findUnique({ where: { id } });
    if (!existing) return fail("Account not found", 404);
    await requireProjectAccess(existing.projectId);

    if (existing.accessToken) {
      await revokeTikTokToken(existing.accessToken).catch(() => undefined);
    }

    await prisma.connectedAccount.delete({ where: { id } });
    logger.info("api", "Connected account removed", {
      accountId: id,
      username: existing.username,
      projectId: existing.projectId,
    });
    return ok({ ok: true, revoked: true });
  } catch (err) {
    if (isAuthError(err)) return fail(err.message, err.status);
    logger.error("api", "DELETE /api/accounts/[id] failed", {
      message: err instanceof Error ? err.message : String(err),
    });
    return fail(err);
  }
}

export const DELETE = withApi(
  handleDELETE,
  "DELETE src/app/api/accounts/[id]/route.ts",
);
