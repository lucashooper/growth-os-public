import { NextResponse } from "next/server";
import { AuthError, requireProjectAccess } from "@/lib/api-auth";
import { prisma } from "@/lib/db";
import {
  accountCanPublish,
  accountCanUploadInbox,
  fetchTikTokUser,
  getValidAccessToken,
} from "@/services/tiktok-oauth";
import { queryCreatorInfoForComposer } from "@/services/tiktok-publish";
import {
  isTikTokSandboxKey,
} from "@/services/tiktok-oauth";
import {
  isTikTokApiError,
  maskAccessToken,
  tiktokErrorResponseBody,
} from "@/services/tiktok-api";
import { logger } from "@/lib/logger";
import { withApi } from "@/lib/api-route";

export const runtime = "nodejs";

async function handleGET(req: Request) {
  try {
    const accountId = new URL(req.url).searchParams.get("accountId");
    if (!accountId) {
      return NextResponse.json({ error: "accountId required" }, { status: 400 });
    }
    const account = await prisma.connectedAccount.findUnique({
      where: { id: accountId },
    });
    if (!account) {
      return NextResponse.json({ error: "Account not found" }, { status: 404 });
    }
    await requireProjectAccess(account.projectId);

    if (!accountCanPublish(account) && !accountCanUploadInbox(account)) {
      return NextResponse.json(
        {
          error:
            "Connect TikTok OAuth first (need video.publish and/or video.upload).",
          code: "OAUTH_REQUIRED",
        },
        { status: 400 },
      );
    }

    let token: string;
    try {
      token = await getValidAccessToken(accountId);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "TikTok token refresh failed";
      logger.warn("api", "creator-info token refresh failed", { message });
      return NextResponse.json(
        {
          error: `${message} Reconnect TikTok on Accounts.`,
          code: "TOKEN_REFRESH_FAILED",
          reconnect: true,
        },
        { status: 401 },
      );
    }

    const accessTokenPrefix = maskAccessToken(token);
    const started = Date.now();

    try {
      const [oauthUserInfo, creator] = await Promise.all([
        fetchTikTokUser(token).catch((err) => {
          logger.warn("api", "creator-info user.info.basic failed", {
            message: err instanceof Error ? err.message : String(err),
            accessTokenPrefix,
          });
          return null;
        }),
        queryCreatorInfoForComposer(token, null),
      ]);

    logger.info("api", "creator-info:oauth", {
      accessTokenPrefix,
      oauthUserInfo,
      scopes: account.oauthScopes,
      ms: Date.now() - started,
    });
      const clientKey = process.env.TIKTOK_CLIENT_KEY?.trim() || "";
      const appAudited = process.env.TIKTOK_APP_AUDITED === "true";
      const isUnaudited = !appAudited || isTikTokSandboxKey(clientKey);

      return NextResponse.json({
        creator,
        isUnaudited,
        canPost: creator.canPost,
        postingBlocked: !creator.canPost,
        postingBlockedMessage: creator.canPost
          ? null
          : "Your TikTok account cannot make new posts right now. Please try again later.",
        accessTokenPrefix,
        oauthUserInfo,
        account: {
          id: account.id,
          username: account.username,
          nickname: account.nickname,
          avatar: account.avatar,
          oauthConnected: true,
          oauthScopes: account.oauthScopes,
        },
      });
    } catch (err) {
      if (isTikTokApiError(err)) {
        const code = err.diagnostics.error_code || "";
        if (
          code === "access_token_invalid" ||
          code === "access_token_expired" ||
          err.status === 401
        ) {
          return NextResponse.json(
            {
              ...tiktokErrorResponseBody(err),
              error:
                "TikTok access token invalid. Disconnect and Connect TikTok again.",
              code: "TOKEN_INVALID",
              reconnect: true,
            },
            { status: 401 },
          );
        }
        throw err;
      }
      throw err;
    }
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json(
        {
          error: err.message,
          code: err.status === 401 ? "SESSION_UNAUTHORIZED" : "FORBIDDEN",
        },
        { status: err.status },
      );
    }
    if (isTikTokApiError(err)) {
      const payload = tiktokErrorResponseBody(err);
      logger.error("api", "creator-info TikTokApiError", payload);
      return NextResponse.json(payload, {
        status: err.status >= 400 && err.status < 600 ? err.status : 502,
      });
    }
    const message = err instanceof Error ? err.message : "Creator info failed";
    logger.error("api", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export const GET = withApi(
  handleGET,
  "GET src/app/api/tiktok/creator-info/route.ts",
);
