import "server-only";
import { createHash, randomBytes } from "crypto";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import { normalizeTikTokUsername } from "@/lib/tiktok-username";

const AUTH_URL = "https://www.tiktok.com/v2/auth/authorize/";
const TOKEN_URL = "https://open.tiktokapis.com/v2/oauth/token/";
const USER_INFO_URL =
  "https://open.tiktokapis.com/v2/user/info/?fields=open_id,union_id,avatar_url,display_name,username";

/**
 * TikTok Desktop / Login Kit PKCE.
 * Challenge is hex(SHA256(verifier)) — not standard base64url PKCE.
 * @see https://developers.tiktok.com/doc/login-kit-desktop/
 */
export function createTikTokPkce() {
  const codeVerifier = randomBytes(32).toString("base64url");
  const codeChallenge = createHash("sha256")
    .update(codeVerifier)
    .digest("hex");
  return { codeVerifier, codeChallenge };
}

export function tiktokOAuthConfigured() {
  return Boolean(
    process.env.TIKTOK_CLIENT_KEY?.trim() &&
      process.env.TIKTOK_CLIENT_SECRET?.trim() &&
      (process.env.TIKTOK_REDIRECT_URI?.trim() ||
        process.env.APP_BASE_URL?.trim()),
  );
}

/**
 * Exact redirect URI — must match TikTok Developer Portal character-for-character.
 * Prefer TIKTOK_REDIRECT_URI; otherwise derive from APP_BASE_URL (no trailing slash).
 */
export function getTikTokRedirectUri() {
  const explicit = process.env.TIKTOK_REDIRECT_URI?.trim();
  if (explicit) return explicit.replace(/\/$/, "");
  const base = (process.env.APP_BASE_URL || "http://localhost:3000").replace(
    /\/$/,
    "",
  );
  return `${base}/api/tiktok/oauth/callback`;
}

/** Sandbox + Content Posting scopes */
export const TIKTOK_PUBLISH_SCOPES = [
  "user.info.basic",
  "video.publish",
  "video.upload",
].join(",");

export function isTikTokSandboxKey(key = process.env.TIKTOK_CLIENT_KEY || "") {
  return key.startsWith("sbaw") || key.includes("sandbox");
}

export function buildAuthorizeUrl(
  state: string,
  opts: { codeChallenge: string },
) {
  const key = process.env.TIKTOK_CLIENT_KEY!;
  const params = new URLSearchParams({
    client_key: key,
    scope: TIKTOK_PUBLISH_SCOPES,
    response_type: "code",
    redirect_uri: getTikTokRedirectUri(),
    state,
    code_challenge: opts.codeChallenge,
    code_challenge_method: "S256",
    // Always show consent — otherwise returning users skip the sandbox prompt
    disable_auto_auth: "1",
  });
  return `${AUTH_URL}?${params.toString()}`;
}

export type TikTokTokenResponse = {
  access_token: string;
  expires_in: number;
  open_id: string;
  refresh_token: string;
  refresh_expires_in: number;
  scope: string;
  token_type: string;
};

export async function exchangeCodeForToken(
  code: string,
  codeVerifier?: string,
): Promise<TikTokTokenResponse> {
  const body = new URLSearchParams({
    client_key: process.env.TIKTOK_CLIENT_KEY!,
    client_secret: process.env.TIKTOK_CLIENT_SECRET!,
    code,
    grant_type: "authorization_code",
    redirect_uri: getTikTokRedirectUri(),
  });
  // Required when authorize used PKCE (Desktop / some sandbox flows)
  if (codeVerifier) {
    body.set("code_verifier", codeVerifier);
  }

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const data = (await res.json()) as TikTokTokenResponse & {
    error?: string;
    error_description?: string;
    message?: string;
  };
  if (!res.ok || !data.access_token) {
    throw new Error(
      data.error_description ||
        data.error ||
        data.message ||
        "TikTok token exchange failed",
    );
  }
  return data;
}

export async function refreshAccessToken(
  refreshToken: string,
): Promise<TikTokTokenResponse> {
  const body = new URLSearchParams({
    client_key: process.env.TIKTOK_CLIENT_KEY!,
    client_secret: process.env.TIKTOK_CLIENT_SECRET!,
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5_000);
  let res: Response;
  try {
    res = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
      signal: controller.signal,
    });
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error("TikTok token refresh timed out after 5s");
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
  const data = (await res.json()) as TikTokTokenResponse & {
    error?: string;
    error_description?: string;
  };
  if (!res.ok || !data.access_token) {
    throw new Error(
      data.error_description || data.error || "TikTok token refresh failed",
    );
  }
  return data;
}

export async function fetchTikTokUser(accessToken: string) {
  const res = await fetch(USER_INFO_URL, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const json = (await res.json()) as {
    data?: {
      user?: {
        open_id?: string;
        avatar_url?: string;
        display_name?: string;
        username?: string;
      };
    };
    error?: { code?: string; message?: string };
  };
  if (!res.ok || (json.error?.code && json.error.code !== "ok")) {
    throw new Error(json.error?.message || "Failed to fetch TikTok user");
  }
  return json.data?.user;
}

export async function revokeTikTokToken(accessToken: string): Promise<void> {
  const token = accessToken?.trim();
  if (!token) return;
  const key = process.env.TIKTOK_CLIENT_KEY?.trim();
  const secret = process.env.TIKTOK_CLIENT_SECRET?.trim();
  if (!key || !secret) {
    logger.warn("api", "TikTok revoke skipped — missing client credentials");
    return;
  }
  const body = new URLSearchParams({
    client_key: key,
    client_secret: secret,
    token,
  });
  const res = await fetch("https://open.tiktokapis.com/v2/oauth/revoke/", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    logger.warn("api", "TikTok token revoke failed", {
      status: res.status,
      body: text.slice(0, 300),
    });
    return;
  }
  logger.info("api", "TikTok access token revoked");
}

function looksLikeOpenIdHandle(username: string, openId: string) {
  const u = normalizeTikTokUsername(username);
  if (!u) return true;
  if (/^-/.test(u)) return true;
  if (
    openId &&
    (u === openId || openId.startsWith(u) || u === openId.slice(0, 12))
  ) {
    return true;
  }
  return false;
}

async function findTikTokByUsername(projectId: string, username: string) {
  const clean = normalizeTikTokUsername(username);
  if (!clean) return null;
  const all = await prisma.connectedAccount.findMany({
    where: { projectId, platform: "tiktok" },
  });
  return (
    all.find(
      (a) =>
        normalizeTikTokUsername(a.username).toLowerCase() ===
        clean.toLowerCase(),
    ) || null
  );
}

/** Merge trailing-slash / casing duplicates; keep the strongest OAuth row. */
export async function dedupeTikTokAccounts(projectId: string) {
  const rows = await prisma.connectedAccount.findMany({
    where: { projectId, platform: "tiktok" },
  });

  const byKey = new Map<string, typeof rows>();
  for (const row of rows) {
    const normalized = normalizeTikTokUsername(row.username);
    if (!normalized || looksLikeOpenIdHandle(normalized, row.openId)) {
      if (normalized && normalized !== row.username) {
        await prisma.connectedAccount
          .update({ where: { id: row.id }, data: { username: normalized } })
          .catch(() => undefined);
      }
      continue;
    }
    const key = normalized.toLowerCase();
    const list = byKey.get(key) || [];
    list.push(row);
    byKey.set(key, list);
  }

  for (const [key, group] of byKey) {
    if (group.length === 1) {
      const only = group[0]!;
      const preferred = normalizeTikTokUsername(only.username);
      if (preferred && preferred !== only.username) {
        await prisma.connectedAccount
          .update({ where: { id: only.id }, data: { username: preferred } })
          .catch(() => undefined);
      }
      continue;
    }

    const detailed = await Promise.all(
      group.map(async (g) => {
        const postCount = await prisma.post.count({
          where: { accountId: g.id },
        });
        return { ...g, postCount };
      }),
    );
    detailed.sort((a, b) => {
      const sa =
        (a.accessToken && a.oauthConnectedAt ? 1000 : 0) +
        (a.followers || 0) +
        a.postCount;
      const sb =
        (b.accessToken && b.oauthConnectedAt ? 1000 : 0) +
        (b.followers || 0) +
        b.postCount;
      return sb - sa;
    });
    const winner = detailed[0]!;
    const losers = detailed.slice(1);

    for (const loser of losers) {
      if (!winner.accessToken && loser.accessToken) {
        await prisma.connectedAccount.update({
          where: { id: winner.id },
          data: {
            accessToken: loser.accessToken,
            refreshToken: loser.refreshToken,
            openId: loser.openId || winner.openId,
            oauthScopes: loser.oauthScopes,
            oauthConnectedAt: loser.oauthConnectedAt,
            tokenExpiresAt: loser.tokenExpiresAt,
            userId: loser.userId || winner.userId,
            avatar: winner.avatar || loser.avatar,
            nickname: winner.nickname || loser.nickname,
            followers: Math.max(winner.followers || 0, loser.followers || 0),
          },
        });
      } else {
        await prisma.connectedAccount.update({
          where: { id: winner.id },
          data: {
            avatar: winner.avatar || loser.avatar,
            nickname: winner.nickname || loser.nickname,
            followers: Math.max(winner.followers || 0, loser.followers || 0),
            bio: winner.bio || loser.bio,
          },
        });
      }
      await prisma.post.updateMany({
        where: { accountId: loser.id },
        data: { accountId: winner.id },
      });
      await prisma.publishJob.updateMany({
        where: { accountId: loser.id },
        data: { accountId: winner.id },
      });
      await prisma.syncLog.deleteMany({ where: { accountId: loser.id } });
      await prisma.connectedAccount.delete({ where: { id: loser.id } });
      logger.info("api", "Deduped TikTok account rows", {
        projectId,
        kept: winner.username,
        removed: loser.username,
      });
    }

    const cleanName = normalizeTikTokUsername(winner.username) || key;
    if (winner.username !== cleanName) {
      await prisma.connectedAccount
        .update({ where: { id: winner.id }, data: { username: cleanName } })
        .catch(() => undefined);
    }
  }
}

export async function upsertOAuthAccount(opts: {
  projectId: string;
  userId: string;
  token: TikTokTokenResponse;
  /** When connecting from an existing analytics card, bind OAuth to that row */
  accountId?: string;
  user?: {
    open_id?: string;
    avatar_url?: string;
    display_name?: string;
    username?: string;
  };
}) {
  const openId = opts.token.open_id || opts.user?.open_id || "";
  const apiUsername = normalizeTikTokUsername(opts.user?.username);
  const fallbackFromDisplay = normalizeTikTokUsername(
    (opts.user?.display_name || "").replace(/\s+/g, ""),
  ).toLowerCase();
  const rawUsername =
    apiUsername ||
    (!looksLikeOpenIdHandle(fallbackFromDisplay, openId)
      ? fallbackFromDisplay
      : "") ||
    openId.slice(0, 12);

  const expires = new Date(
    Date.now() + (opts.token.expires_in || 86400) * 1000,
  );

  await dedupeTikTokAccounts(opts.projectId);

  let existing = opts.accountId
    ? await prisma.connectedAccount.findFirst({
        where: {
          id: opts.accountId,
          projectId: opts.projectId,
          platform: "tiktok",
        },
      })
    : null;

  if (!existing && openId) {
    existing = await prisma.connectedAccount.findFirst({
      where: { projectId: opts.projectId, platform: "tiktok", openId },
    });
  }

  if (!existing) {
    for (const candidate of [apiUsername, fallbackFromDisplay, rawUsername]) {
      if (!candidate || looksLikeOpenIdHandle(candidate, openId)) continue;
      existing = await findTikTokByUsername(opts.projectId, candidate);
      if (existing) break;
    }
  }

  let username = normalizeTikTokUsername(
    existing && looksLikeOpenIdHandle(rawUsername, openId)
      ? existing.username
      : rawUsername,
  );

  const byUsername = await findTikTokByUsername(opts.projectId, username);
  if (byUsername && (!existing || byUsername.id !== existing.id)) {
    if (
      existing &&
      looksLikeOpenIdHandle(existing.username, existing.openId || openId)
    ) {
      logger.info("api", "Merging OAuth onto existing @handle; removing orphan", {
        orphanId: existing.id,
        orphanUsername: existing.username,
        targetId: byUsername.id,
        targetUsername: byUsername.username,
      });
      await prisma.post.updateMany({
        where: { accountId: existing.id },
        data: { accountId: byUsername.id },
      });
      await prisma.connectedAccount
        .delete({ where: { id: existing.id } })
        .catch(() => undefined);
    }
    existing = byUsername;
    username = normalizeTikTokUsername(byUsername.username);
  }

  const data = {
    openId,
    userId: opts.userId,
    accessToken: opts.token.access_token,
    refreshToken: opts.token.refresh_token,
    tokenExpiresAt: expires,
    oauthScopes: opts.token.scope || TIKTOK_PUBLISH_SCOPES,
    oauthConnectedAt: new Date(),
    nickname:
      opts.user?.display_name ||
      existing?.nickname ||
      apiUsername ||
      username,
    avatar: opts.user?.avatar_url || existing?.avatar || "",
    username,
    status: "active",
    lastError: null as string | null,
  };

  let account;
  if (existing) {
    account = await prisma.connectedAccount.update({
      where: { id: existing.id },
      data,
    });
  } else {
    try {
      account = await prisma.connectedAccount.create({
        data: {
          projectId: opts.projectId,
          platform: "tiktok",
          ...data,
        },
      });
    } catch (err) {
      const code =
        err && typeof err === "object" && "code" in err
          ? String((err as { code?: string }).code)
          : "";
      if (code !== "P2002") throw err;
      const collided = await findTikTokByUsername(opts.projectId, username);
      if (!collided) throw err;
      account = await prisma.connectedAccount.update({
        where: { id: collided.id },
        data,
      });
    }
  }

  const avatarSrc = opts.user?.avatar_url || account.avatar;
  if (avatarSrc?.startsWith("http")) {
    const { persistRemoteAvatar } = await import("@/services/persist-avatar");
    const stored = await persistRemoteAvatar(account.id, avatarSrc);
    if (stored && stored !== account.avatar) {
      account = await prisma.connectedAccount.update({
        where: { id: account.id },
        data: { avatar: stored },
      });
    }
  }

  await dedupeTikTokAccounts(opts.projectId);
  const fresh = await prisma.connectedAccount.findUnique({
    where: { id: account.id },
  });
  return fresh || account;
}

export async function getValidAccessToken(
  accountId: string,
  opts?: { forceRefresh?: boolean },
): Promise<string> {
  const account = await prisma.connectedAccount.findUniqueOrThrow({
    where: { id: accountId },
  });
  if (!account.accessToken) {
    throw new Error(
      "Account is not OAuth-connected. Connect with TikTok first.",
    );
  }
  const expiresSoon =
    !account.tokenExpiresAt ||
    account.tokenExpiresAt.getTime() < Date.now() + 60_000;

  if (!opts?.forceRefresh && !expiresSoon) return account.accessToken;

  if (!account.refreshToken) {
    if (opts?.forceRefresh && !expiresSoon) return account.accessToken;
    throw new Error("Access token expired. Reconnect with TikTok.");
  }

  try {
    const token = await refreshAccessToken(account.refreshToken);
    await prisma.connectedAccount.update({
      where: { id: accountId },
      data: {
        accessToken: token.access_token,
        refreshToken: token.refresh_token || account.refreshToken,
        tokenExpiresAt: new Date(Date.now() + token.expires_in * 1000),
        oauthScopes: token.scope || account.oauthScopes,
      },
    });
    logger.info("api", "Refreshed TikTok access token", {
      accountId,
      forceRefresh: Boolean(opts?.forceRefresh),
    });
    return token.access_token;
  } catch (err) {
    // Prefer remaining access token over hard-failing the request (avoids 502 cascades).
    if (account.accessToken && !expiresSoon) {
      logger.warn("api", "Token refresh failed; using cached access token", {
        accountId,
        message: err instanceof Error ? err.message : String(err),
      });
      return account.accessToken;
    }
    if (!opts?.forceRefresh || expiresSoon) {
      throw err instanceof Error
        ? err
        : new Error("TikTok token refresh failed. Reconnect with TikTok.");
    }
    logger.warn("api", "Force refresh failed; using existing access token", {
      accountId,
      message: err instanceof Error ? err.message : String(err),
    });
    return account.accessToken;
  }
}

export function accountCanPublish(account: {
  accessToken?: string | null;
  oauthScopes?: string | null;
  oauthConnectedAt?: Date | null;
}) {
  const scopes = account.oauthScopes || "";
  return Boolean(
    account.accessToken &&
      account.oauthConnectedAt &&
      (scopes.includes("video.publish") || scopes.includes("video.upload")),
  );
}

export function accountCanUploadInbox(account: {
  accessToken?: string | null;
  oauthScopes?: string | null;
  oauthConnectedAt?: Date | null;
}) {
  const scopes = account.oauthScopes || "";
  return Boolean(
    account.accessToken &&
      account.oauthConnectedAt &&
      scopes.includes("video.upload"),
  );
}
