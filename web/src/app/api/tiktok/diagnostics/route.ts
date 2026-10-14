import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { AuthError, guardProjectId, isAuthError } from "@/lib/api-auth";
import { withApi } from "@/lib/api-route";
import { logger } from "@/lib/logger";
import { 
  isTikTokSandboxKey,
  getTikTokRedirectUri,
  TIKTOK_PUBLISH_SCOPES,
} from "@/services/tiktok-oauth";
import { tiktokFetchJson } from "@/services/tiktok-api";

export const runtime = "nodejs";

/**
 * GET /api/tiktok/diagnostics
 * 
 * Comprehensive TikTok integration diagnostics:
 * - Environment & client key status (sandbox vs production)
 * - OAuth configuration
 * - Account tokens & scopes
 * - Creator info & privacy options
 * - Recent publish attempts
 */
async function handleGET(req: Request) {
  try {
    const url = new URL(req.url);
    const projectId = url.searchParams.get("projectId");
    const accountId = url.searchParams.get("accountId");

    if (!projectId) {
      return NextResponse.json({ error: "projectId required" }, { status: 400 });
    }

    await guardProjectId(projectId);

    const clientKey = process.env.TIKTOK_CLIENT_KEY?.trim() || "";
    const clientSecret = process.env.TIKTOK_CLIENT_SECRET?.trim() || "";
    const appBaseUrl = process.env.APP_BASE_URL || process.env.NEXT_PUBLIC_APP_BASE_URL || "";
    const netlify = process.env.NETLIFY === "true";
    const nodeEnv = process.env.NODE_ENV || "development";

    // Detect sandbox vs production
    const isSandbox = isTikTokSandboxKey(clientKey);
    const redirectUri = getTikTokRedirectUri();

    // Get accounts for project
    const accounts = await prisma.connectedAccount.findMany({
      where: { projectId, platform: "tiktok" },
      select: {
        id: true,
        username: true,
        oauthConnectedAt: true,
        oauthScopes: true,
        tokenExpiresAt: true,
        accessToken: true,
        status: true,
      },
    });

    // If specific account requested, get detailed info
    let accountDetails = null;
    if (accountId) {
      const account = accounts.find((a) => a.id === accountId);
      if (account && account.accessToken) {
        try {
          // Fetch creator info to check privacy options
          const creatorRes = await tiktokFetchJson<any>({
            step: "creator_info/query",
            method: "POST",
            url: "https://open.tiktokapis.com/v2/post/publish/creator_info/query/",
            accessToken: account.accessToken,
            body: {},
            requireOkCode: false,
          });

          accountDetails = {
            username: account.username,
            oauthConnectedAt: account.oauthConnectedAt,
            scopes: account.oauthScopes.split(",").filter(Boolean),
            tokenExpiresAt: account.tokenExpiresAt,
            tokenExpired: account.tokenExpiresAt ? account.tokenExpiresAt < new Date() : null,
            creatorInfo: creatorRes.parsed?.data || null,
            creatorInfoError: creatorRes.diagnostics.error_code || null,
          };
        } catch (err) {
          accountDetails = {
            username: account.username,
            error: err instanceof Error ? err.message : "Failed to fetch creator info",
          };
        }
      }
    }

    // Get recent publish attempts
    const recentAttempts = await prisma.publishAttempt.findMany({
      where: { projectId },
      orderBy: { createdAt: "desc" },
      take: 5,
      select: {
        id: true,
        status: true,
        error: true,
        errorCode: true,
        publishId: true,
        createdAt: true,
        account: {
          select: { username: true },
        },
      },
    });

    // Get recent publish jobs (legacy)
    const recentJobs = await prisma.publishJob.findMany({
      where: { projectId },
      orderBy: { createdAt: "desc" },
      take: 5,
      select: {
        id: true,
        status: true,
        error: true,
        publishId: true,
        privacyLevel: true,
        createdAt: true,
        account: {
          select: { username: true },
        },
      },
    });

    const diagnostics = {
      environment: {
        nodeEnv,
        netlify,
        appBaseUrl,
        redirectUri,
      },
      tiktokApp: {
        clientKeyPrefix: clientKey ? `${clientKey.slice(0, 6)}...${clientKey.slice(-4)}` : null,
        clientSecretConfigured: Boolean(clientSecret),
        isSandbox,
        detectedMode: isSandbox ? "SANDBOX (Unaudited)" : "PRODUCTION (Approved)",
        expectedScopes: TIKTOK_PUBLISH_SCOPES.split(","),
      },
      accounts: accounts.map((a) => ({
        id: a.id,
        username: a.username,
        oauthConnected: Boolean(a.oauthConnectedAt),
        connectedAt: a.oauthConnectedAt,
        scopes: a.oauthScopes.split(",").filter(Boolean),
        tokenExpired: a.tokenExpiresAt ? a.tokenExpiresAt < new Date() : null,
        tokenExpiresAt: a.tokenExpiresAt,
        status: a.status,
      })),
      accountDetails,
      recentAttempts: recentAttempts.map((a) => ({
        id: a.id,
        account: a.account?.username || "Unknown",
        status: a.status,
        error: a.error,
        errorCode: a.errorCode,
        publishId: a.publishId,
        createdAt: a.createdAt,
      })),
      recentJobs: recentJobs.map((j) => ({
        id: j.id,
        account: j.account?.username || "Unknown",
        status: j.status,
        error: j.error,
        publishId: j.publishId,
        privacyLevel: j.privacyLevel,
        createdAt: j.createdAt,
      })),
      recommendations: generateRecommendations({
        isSandbox,
        clientKey,
        clientSecret,
        accounts,
        recentJobs,
      }),
    };

    return NextResponse.json({ diagnostics });
  } catch (err) {
    if (isAuthError(err)) {
      return NextResponse.json(
        { error: (err as AuthError).message },
        { status: (err as AuthError).status },
      );
    }
    logger.error("api", "GET /api/tiktok/diagnostics failed", {
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json(
      { error: "Failed to fetch diagnostics" },
      { status: 500 },
    );
  }
}

function generateRecommendations(ctx: {
  isSandbox: boolean;
  clientKey: string;
  clientSecret: string;
  accounts: any[];
  recentJobs: any[];
}): string[] {
  const recs: string[] = [];

  if (ctx.isSandbox) {
    recs.push(
      "⚠️ Using SANDBOX client key. Update TIKTOK_CLIENT_KEY in Netlify to production key (starts with 'aw...' not 'sbaw...').",
    );
  }

  if (!ctx.clientKey) {
    recs.push("❌ TIKTOK_CLIENT_KEY not configured. Set in .env.local or Netlify.");
  }

  if (!ctx.clientSecret) {
    recs.push("❌ TIKTOK_CLIENT_SECRET not configured. Set in .env.local or Netlify.");
  }

  if (ctx.isSandbox && ctx.recentJobs.some((j) => j.privacyLevel !== "SELF_ONLY")) {
    recs.push(
      "⚠️ Sandbox apps can only post privately (SELF_ONLY). Posts with other privacy levels will fail.",
    );
  }

  const expiredTokens = ctx.accounts.filter(
    (a) => a.tokenExpiresAt && a.tokenExpiresAt < new Date(),
  );
  if (expiredTokens.length > 0) {
    recs.push(
      `⚠️ ${expiredTokens.length} account(s) have expired tokens. Disconnect → Reconnect on /accounts.`,
    );
  }

  const missingScopes = ctx.accounts.filter(
    (a) => !a.oauthScopes.includes("video.publish") && !a.oauthScopes.includes("video.upload"),
  );
  if (missingScopes.length > 0) {
    recs.push(
      `⚠️ ${missingScopes.length} account(s) missing publish scopes. Reconnect with "Connect with TikTok".`,
    );
  }

  if (recs.length === 0 && !ctx.isSandbox) {
    recs.push("✅ Production client key detected. All accounts configured correctly.");
  }

  return recs;
}

export const GET = withApi(handleGET, "GET /api/tiktok/diagnostics");
