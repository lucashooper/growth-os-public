import { NextResponse } from "next/server";
import {
  exchangeCodeForToken,
  fetchTikTokUser,
  getTikTokRedirectUri,
  upsertOAuthAccount,
} from "@/services/tiktok-oauth";
import { logger } from "@/lib/logger";
import { withApi } from "@/lib/api-route";

export const runtime = "nodejs";

function readCookie(cookieHeader: string, name: string) {
  const match = cookieHeader.match(
    new RegExp(`(?:^|;\\s*)${name}=([^;]+)`),
  );
  return match?.[1] ? decodeURIComponent(match[1]) : null;
}

async function handleGET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const err = url.searchParams.get("error");
  // Prefer canonical APP_BASE_URL so deploy-preview hosts don't steal the session
  const base = (
    process.env.APP_BASE_URL ||
    process.env.NEXT_PUBLIC_APP_BASE_URL ||
    url.origin
  ).replace(/\/$/, "");
  const accountsUrl = `${base}/accounts`;

  if (err) {
    logger.error("api", "TikTok OAuth denied", { err });
    return NextResponse.redirect(
      `${accountsUrl}?oauth=error&message=${encodeURIComponent(err)}`,
    );
  }

  const cookie = req.headers.get("cookie") || "";
  const cookieState = readCookie(cookie, "tt_oauth_state");
  const codeVerifier = readCookie(cookie, "tt_oauth_verifier");
  if (!code || !state || !cookieState || cookieState !== state) {
    logger.warn("api", "TikTok OAuth state mismatch", {
      hasCode: Boolean(code),
      hasState: Boolean(state),
      hasCookie: Boolean(cookieState),
      hasVerifier: Boolean(codeVerifier),
      redirectUri: getTikTokRedirectUri(),
    });
    return NextResponse.redirect(
      `${accountsUrl}?oauth=error&message=${encodeURIComponent("Invalid OAuth state")}`,
    );
  }

  try {
    const parsed = JSON.parse(
      Buffer.from(state, "base64url").toString("utf8"),
    ) as { projectId: string; userId: string; accountId?: string };

    if (!parsed.projectId || !parsed.userId) {
      throw new Error("OAuth state missing projectId or userId");
    }

    const token = await exchangeCodeForToken(
      code,
      codeVerifier || undefined,
    );
    let user;
    try {
      user = await fetchTikTokUser(token.access_token);
    } catch (e) {
      logger.warn("api", "TikTok user.info.basic failed after token exchange", {
        message: e instanceof Error ? e.message : String(e),
      });
      user = { open_id: token.open_id };
    }

    // Creator info often has a better sandbox display username than user.info
    try {
      const { queryCreatorInfo } = await import("@/services/tiktok-publish");
      const creator = await queryCreatorInfo(token.access_token);
      if (creator.creator_username || creator.creator_nickname) {
        user = {
          ...user,
          username: creator.creator_username || user?.username,
          display_name:
            creator.creator_nickname ||
            creator.creator_username ||
            user?.display_name,
          avatar_url: creator.creator_avatar_url || user?.avatar_url,
          open_id: user?.open_id || token.open_id,
        };
      }
    } catch (e) {
      logger.warn("api", "TikTok creator_info after OAuth skipped", {
        message: e instanceof Error ? e.message : String(e),
      });
    }

    const account = await upsertOAuthAccount({
      projectId: parsed.projectId,
      userId: parsed.userId,
      accountId: parsed.accountId,
      token,
      user,
    });

    logger.info("api", "TikTok OAuth connected", {
      projectId: parsed.projectId,
      userId: parsed.userId,
      accountId: account.id,
      username: account.username,
      scopes: account.oauthScopes,
    });

    const res = NextResponse.redirect(
      `${accountsUrl}?oauth=success&accountId=${account.id}`,
    );
    res.cookies.set("tt_oauth_state", "", { path: "/", maxAge: 0 });
    res.cookies.set("tt_oauth_verifier", "", { path: "/", maxAge: 0 });
    return res;
  } catch (e) {
    const message = e instanceof Error ? e.message : "OAuth failed";
    logger.error("api", message, {
      redirectUri: getTikTokRedirectUri(),
    });
    return NextResponse.redirect(
      `${accountsUrl}?oauth=error&message=${encodeURIComponent(message)}`,
    );
  }
}

export const GET = withApi(handleGET, "GET src/app/api/tiktok/oauth/callback/route.ts");
