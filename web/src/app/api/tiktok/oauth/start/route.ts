import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { AuthError, guardProjectId, requireUser } from "@/lib/api-auth";
import {
  buildAuthorizeUrl,
  createTikTokPkce,
  getTikTokRedirectUri,
  tiktokOAuthConfigured,
} from "@/services/tiktok-oauth";
import { logger } from "@/lib/logger";
import { withApi } from "@/lib/api-route";

export const runtime = "nodejs";

function isLocalHost(value: string) {
  return /localhost|127\.0\.0\.1/i.test(value);
}

function hostFromUrlOrHost(value: string) {
  try {
    if (value.includes("://")) return new URL(value).host;
  } catch {
    /* ignore */
  }
  return value.replace(/^https?:\/\//i, "").split("/")[0] || value;
}

/** Prefer ngrok / proxy public host over the internal localhost bind address. */
function publicRequestHost(req: Request, urlObj: URL): string {
  const forwarded = req.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  if (forwarded) return forwarded;
  const origin = req.headers.get("origin");
  if (origin) {
    try {
      return new URL(origin).host;
    } catch {
      /* ignore */
    }
  }
  const referer = req.headers.get("referer");
  if (referer) {
    try {
      return new URL(referer).host;
    } catch {
      /* ignore */
    }
  }
  return req.headers.get("host") || urlObj.host;
}

async function handleGET(req: Request) {
  try {
    const urlObj = new URL(req.url);
    const projectId = urlObj.searchParams.get("projectId");
    const accountId = urlObj.searchParams.get("accountId") || undefined;
    if (!projectId) {
      return NextResponse.json({ error: "projectId required" }, { status: 400 });
    }
    const user = await requireUser();
    await guardProjectId(projectId);

    if (accountId) {
      const { prisma } = await import("@/lib/db");
      const account = await prisma.connectedAccount.findFirst({
        where: { id: accountId, projectId, platform: "tiktok" },
      });
      if (!account) {
        return NextResponse.json(
          { error: "Account not found for this project" },
          { status: 404 },
        );
      }
    }

    if (!tiktokOAuthConfigured()) {
      return NextResponse.json(
        {
          error:
            "TikTok OAuth is not configured. Add TIKTOK_CLIENT_KEY, TIKTOK_CLIENT_SECRET, TIKTOK_REDIRECT_URI (or APP_BASE_URL).",
          redirectUri: getTikTokRedirectUri(),
        },
        { status: 400 },
      );
    }

    const redirectUri = getTikTokRedirectUri();
    const requestHost = publicRequestHost(req, urlObj);
    const redirectHost = hostFromUrlOrHost(redirectUri);
    const requestIsLocal = isLocalHost(requestHost);
    const redirectIsLocal = isLocalHost(redirectUri);
    const hostsMatch =
      requestHost === redirectHost ||
      requestHost.split(":")[0] === redirectHost.split(":")[0];

    // OAuth cookies are host-bound. Starting on localhost while redirect is ngrok
    // (or the reverse) always breaks the callback.
    if (requestIsLocal !== redirectIsLocal || !hostsMatch) {
      const openHere = redirectIsLocal
        ? "http://localhost:3000/accounts"
        : `${redirectUri.replace(/\/api\/tiktok\/oauth\/callback\/?$/, "")}/accounts`;
      return NextResponse.json(
        {
          error: requestIsLocal && !redirectIsLocal
            ? `You're on localhost but TikTok redirects to ngrok. Open Growth OS via the ngrok URL (address bar must show *.ngrok-free.app) and click Connect there.`
            : `Browser host (${requestHost}) does not match TIKTOK_REDIRECT_URI host (${redirectHost}). Update .env.local to your CURRENT ngrok URL, restart npm run dev, and open that URL.`,
          requestHost,
          redirectUri,
          openThisUrl: openHere,
          tiktokPortalUriMustBe: redirectUri,
          hint: "In TikTok Login Kit add the CALLBACK path (/api/tiktok/oauth/callback), not /accounts. Free ngrok URLs change every restart — keep .env.local in sync.",
        },
        { status: 400 },
      );
    }

    const nonce = randomBytes(24).toString("hex");
    const state = Buffer.from(
      JSON.stringify({
        projectId,
        userId: user.id,
        nonce,
        ...(accountId ? { accountId } : {}),
      }),
    ).toString("base64url");
    const { codeVerifier, codeChallenge } = createTikTokPkce();
    const url = buildAuthorizeUrl(state, { codeChallenge });
    logger.info("api", "TikTok OAuth start", {
      projectId,
      userId: user.id,
      accountId: accountId || null,
      redirectUri,
      pkce: true,
    });

    const useSecureCookie =
      redirectUri.startsWith("https://") || urlObj.protocol === "https:";
    const cookieOpts = {
      httpOnly: true,
      sameSite: "lax" as const,
      secure: useSecureCookie,
      path: "/",
      maxAge: 600,
    };

    const res = NextResponse.redirect(url);
    res.cookies.set("tt_oauth_state", state, cookieOpts);
    res.cookies.set("tt_oauth_verifier", codeVerifier, cookieOpts);
    return res;
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    const message = err instanceof Error ? err.message : "OAuth start failed";
    logger.error("api", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export const GET = withApi(handleGET, "GET src/app/api/tiktok/oauth/start/route.ts");
