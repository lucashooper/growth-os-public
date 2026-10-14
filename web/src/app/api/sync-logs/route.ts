import { prisma } from "@/lib/db";
import { fail, ok } from "@/lib/api-response";
import { withApi } from "@/lib/api-route";

import {
  AuthError,
  guardProjectId,
  requireProjectAccess,
  requireUser,
} from "@/lib/api-auth";

export const runtime = "nodejs";

async function handleGET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const accountId = searchParams.get("accountId");
    const projectId = searchParams.get("projectId");
    const limit = Math.min(Number(searchParams.get("limit") ?? 50), 200);

    if (projectId) {
      await guardProjectId(projectId);
    } else if (accountId) {
      const account = await prisma.connectedAccount.findUnique({
        where: { id: accountId },
        select: { projectId: true },
      });
      if (!account) return fail("Account not found", 404);
      await requireProjectAccess(account.projectId);
    } else {
      await requireUser();
    }

    const logs = await prisma.syncLog.findMany({
      where: accountId
        ? { accountId }
        : projectId
          ? { account: { projectId } }
          : undefined,
      orderBy: { startedAt: "desc" },
      take: limit,
      include: {
        account: {
          select: { username: true, platform: true, projectId: true, nickname: true },
        },
      },
    });

    return ok({
      logs: logs.map((l) => ({
        ...l,
        steps: JSON.parse(l.stepsJson || "[]"),
        rawResponse: l.rawResponse ? JSON.parse(l.rawResponse) : null,
      })),
    });
  } catch (err) {
    if (err instanceof AuthError) return fail(err.message, err.status);
    return fail(err);
  }
}

export const GET = withApi(handleGET, "GET src/app/api/sync-logs/route.ts");
