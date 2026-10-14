import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import {
  getTikTokRedirectUri,
  isTikTokSandboxKey,
  tiktokOAuthConfigured,
} from "@/services/tiktok-oauth";
import { prisma } from "@/lib/db";
import { withApi } from "@/lib/api-route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function handleGET() {
  const key = process.env.TIKTOK_CLIENT_KEY?.trim() || "";
  const secret = process.env.TIKTOK_CLIENT_SECRET?.trim() || "";
  const redirectUri = getTikTokRedirectUri();
  const user = await getSessionUser();

  let tokenValid: boolean | null = null;
  let connectedCount = 0;
  if (user) {
    const accounts = await prisma.connectedAccount.findMany({
      where: {
        userId: user.id,
        platform: "tiktok",
        accessToken: { not: "" },
      },
      select: {
        id: true,
        tokenExpiresAt: true,
        refreshToken: true,
        oauthScopes: true,
      },
    });
    connectedCount = accounts.length;
    if (accounts.length > 0) {
      tokenValid = accounts.some(
        (a) =>
          a.tokenExpiresAt &&
          a.tokenExpiresAt.getTime() > Date.now() + 60_000,
      );
      if (!tokenValid && accounts.some((a) => a.refreshToken)) {
        tokenValid = false; // expired but refreshable
      }
    }
  }

  return NextResponse.json({
    ok: true,
    tiktok: {
      environmentConfigured: tiktokOAuthConfigured(),
      clientKeyPresent: Boolean(key),
      clientSecretPresent: Boolean(secret),
      clientKeyPrefix: key ? `${key.slice(0, 4)}…` : null,
      redirectUri,
      redirectUriMatchesExplicit: Boolean(
        process.env.TIKTOK_REDIRECT_URI?.trim(),
      ),
      appBaseUrl: (process.env.APP_BASE_URL || "").replace(/\/$/, "") || null,
      callbackPath: "/api/tiktok/oauth/callback",
      callbackReachable: true,
      mode: isTikTokSandboxKey(key) ? "sandbox" : "production",
      scopesRequested: [
        "user.info.basic",
        "video.publish",
        "video.upload",
      ],
    },
    auth: {
      authenticated: Boolean(user),
      userId: user?.id ?? null,
    },
    tokens: {
      connectedAccountsForUser: connectedCount,
      accessTokenValid: tokenValid,
    },
  });
}

export const GET = withApi(handleGET, "GET src/app/api/tiktok/debug/route.ts");
