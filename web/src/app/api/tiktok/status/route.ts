import { NextResponse } from "next/server";
import { AuthError, requireProjectAccess } from "@/lib/api-auth";
import { prisma } from "@/lib/db";
import { getValidAccessToken } from "@/services/tiktok-oauth";
import { fetchPublishStatus } from "@/services/tiktok-publish";
import { withApi } from "@/lib/api-route";
import { logger } from "@/lib/logger";

export const runtime = "nodejs";

/** GET /api/tiktok/status?accountId=&publishId= — poll inbox/direct post status */
async function handleGET(req: Request) {
  try {
    const url = new URL(req.url);
    const accountId = url.searchParams.get("accountId");
    const publishId = url.searchParams.get("publishId");
    if (!accountId || !publishId) {
      return NextResponse.json(
        { error: "accountId and publishId required" },
        { status: 400 },
      );
    }
    const account = await prisma.connectedAccount.findUnique({
      where: { id: accountId },
    });
    if (!account) {
      return NextResponse.json({ error: "Account not found" }, { status: 404 });
    }
    await requireProjectAccess(account.projectId);
    await getValidAccessToken(accountId, { forceRefresh: false });

    const parsed = (await fetchPublishStatus(accountId, publishId)) as {
      data?: { status?: string; fail_reason?: string };
      error?: { code?: string; message?: string; log_id?: string };
    };

    const status = parsed?.data?.status || "";
    const failReason = parsed?.data?.fail_reason || "";
    logger.info("api", "GET /api/tiktok/status", {
      accountId,
      publishId,
      status,
      failReason,
    });

    return NextResponse.json({
      ok: true,
      publishId,
      status,
      fail_reason: failReason,
      raw: parsed,
    });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    const message = err instanceof Error ? err.message : "Status fetch failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export const GET = withApi(handleGET, "GET src/app/api/tiktok/status/route.ts");
