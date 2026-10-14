import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { AuthError, guardProjectId } from "@/lib/api-auth";
import { logger } from "@/lib/logger";
import { withApi } from "@/lib/api-route";
import { revokeTikTokToken } from "@/services/tiktok-oauth";

export const runtime = "nodejs";

async function handlePOST(req: Request) {
  try {
    const body = (await req.json()) as { accountId?: string };
    if (!body.accountId) {
      return NextResponse.json({ error: "accountId required" }, { status: 400 });
    }
    const account = await prisma.connectedAccount.findUnique({
      where: { id: body.accountId },
    });
    if (!account) {
      return NextResponse.json({ error: "Account not found" }, { status: 404 });
    }
    await guardProjectId(account.projectId);

    // Revoke on TikTok so the next Connect shows a full consent screen
    if (account.accessToken) {
      await revokeTikTokToken(account.accessToken).catch(() => undefined);
    }

    await prisma.connectedAccount.update({
      where: { id: account.id },
      data: {
        accessToken: "",
        refreshToken: "",
        openId: "",
        oauthScopes: "",
        oauthConnectedAt: null,
        tokenExpiresAt: null,
        lastError: null,
      },
    });

    logger.info("api", "TikTok OAuth disconnected + revoked", {
      accountId: account.id,
    });
    return NextResponse.json({ ok: true, revoked: true });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    const message = err instanceof Error ? err.message : "Disconnect failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export const POST = withApi(handlePOST, "POST src/app/api/tiktok/disconnect/route.ts");
