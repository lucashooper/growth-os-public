import { prisma } from "@/lib/db";
import { fail, ok } from "@/lib/api-response";
import { guardProjectId, isAuthError } from "@/lib/api-auth";
import { logger } from "@/lib/logger";
import { withApi } from "@/lib/api-route";
import { normalizeTikTokUsername } from "@/lib/tiktok-username";
import { dedupeTikTokAccounts } from "@/services/tiktok-oauth";

export const runtime = "nodejs";
/** Keep short so a hung TikTok/DB call can't cascade into Netlify 502s. */
export const maxDuration = 25;

type SafeAccount = Record<string, unknown> & {
  id: string;
  oauthConnected: boolean;
  hasRefreshToken: boolean;
};

/** In-memory last-good accounts per project (survives soft failures within the instance). */
const accountsCache = new Map<
  string,
  { at: number; accounts: SafeAccount[] }
>();
const CACHE_TTL_MS = 5 * 60 * 1000;

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`${label} timed out after ${ms}ms`)),
      ms,
    );
    promise.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

function mapSafeAccounts(
  accounts: Awaited<ReturnType<typeof prisma.connectedAccount.findMany>>,
): SafeAccount[] {
  return accounts.map((a) => {
    const {
      accessToken: _a,
      refreshToken: _r,
      ...rest
    } = a;
    return {
      ...rest,
      oauthConnected: Boolean(
        a.oauthConnectedAt &&
          a.accessToken &&
          ((a.oauthScopes || "").includes("video.publish") ||
            (a.oauthScopes || "").includes("video.upload")),
      ),
      hasRefreshToken: Boolean(a.refreshToken),
      oauthScopes: a.oauthScopes || "",
      displayName: a.nickname || a.username,
    };
  }) as SafeAccount[];
}

async function handleGET(req: Request) {
  const projectId = new URL(req.url).searchParams.get("projectId");
  if (!projectId) return fail("projectId required", 400);

  try {
    await withTimeout(guardProjectId(projectId), 5_000, "Auth");
  } catch (err) {
    if (isAuthError(err)) return fail(err.message, err.status);
    const cached = accountsCache.get(projectId);
    if (cached) {
      logger.warn("api", "GET /api/accounts auth slow — serving cache", {
        projectId,
        message: err instanceof Error ? err.message : String(err),
      });
      return ok({ accounts: cached.accounts, cached: true });
    }
    if (isAuthError(err)) return fail(err.message, err.status);
    logger.error("api", "GET /api/accounts auth failed", {
      message: err instanceof Error ? err.message : String(err),
    });
    return fail(err);
  }

  try {
    // Never let dedupe hang the list endpoint (DB-only, but can be slow under load).
    await withTimeout(
      dedupeTikTokAccounts(projectId).catch((err) => {
        logger.warn("api", "Account dedupe skipped", {
          message: err instanceof Error ? err.message : String(err),
        });
      }),
      5_000,
      "Account dedupe",
    ).catch((err) => {
      logger.warn("api", "Account dedupe timed out", {
        message: err instanceof Error ? err.message : String(err),
      });
    });

    await withTimeout(
      (async () => {
        const staleCutoff = new Date(Date.now() - 90_000);
        await prisma.connectedAccount.updateMany({
          where: {
            projectId,
            status: { in: ["SYNCING", "syncing"] },
            updatedAt: { lt: staleCutoff },
          },
          data: {
            status: "error",
            lastError:
              "Sync timed out. Tap Sync again — profile data is kept.",
          },
        });
      })(),
      3_000,
      "Stale sync cleanup",
    ).catch(() => undefined);

    const accounts = await withTimeout(
      prisma.connectedAccount.findMany({
        where: { projectId },
        orderBy: { createdAt: "asc" },
        include: {
          syncLogs: { orderBy: { startedAt: "desc" }, take: 1 },
          _count: { select: { posts: true } },
        },
      }),
      5_000,
      "Accounts query",
    );

    const safe = mapSafeAccounts(accounts);
    accountsCache.set(projectId, { at: Date.now(), accounts: safe });
    return ok({ accounts: safe });
  } catch (err) {
    if (isAuthError(err)) return fail(err.message, err.status);

    const cached = accountsCache.get(projectId);
    if (cached && Date.now() - cached.at < CACHE_TTL_MS * 3) {
      logger.warn("api", "GET /api/accounts failed — serving cached accounts", {
        projectId,
        message: err instanceof Error ? err.message : String(err),
      });
      return ok({ accounts: cached.accounts, cached: true });
    }

    logger.error("api", "GET /api/accounts failed", {
      message: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined,
    });
    return fail(err);
  }
}

async function handlePOST(req: Request) {
  try {
    const body = (await req.json()) as {
      projectId?: string;
      platform?: string;
      username?: string;
      nickname?: string;
      sync?: boolean;
    };
    if (!body.projectId) return fail("projectId required", 400);
    await guardProjectId(body.projectId);
    const username = normalizeTikTokUsername(body.username);
    if (!username) return fail("username required", 400);

    const project = await prisma.project.findUnique({
      where: { id: body.projectId },
      select: { workspaceId: true },
    });
    if (project?.workspaceId) {
      const { getWorkspaceUsageSnapshot } = await import("@/services/usage");
      const snap = await getWorkspaceUsageSnapshot(project.workspaceId);
      if (snap && snap.usage.channels >= snap.limits.channels) {
        const all = await prisma.connectedAccount.findMany({
          where: { project: { workspaceId: project.workspaceId } },
          select: { username: true },
        });
        const already = all.some(
          (a) =>
            a.username.replace(/^@/, "").toLowerCase() ===
            username.replace(/^@/, "").toLowerCase(),
        );
        if (!already) {
          return fail(
            `Channel limit reached (${snap.usage.channels}/${snap.limits.channels}). Upgrade your plan to add more accounts.`,
            429,
          );
        }
      }
    }

    const platform = body.platform ?? "tiktok";
    const rows = await prisma.connectedAccount.findMany({
      where: { projectId: body.projectId, platform },
    });
    const account =
      rows.find(
        (r) =>
          normalizeTikTokUsername(r.username).toLowerCase() ===
          username.toLowerCase(),
      ) || null;

    let saved;
    if (account) {
      saved = await prisma.connectedAccount.update({
        where: { id: account.id },
        data: {
          username,
          nickname: body.nickname?.trim() || account.nickname || username,
          status: platform === "tiktok" ? "active" : account.status,
        },
      });
      logger.info("db", "Reusing connected account", {
        id: saved.id,
        username,
        platform,
      });
    } else {
      saved = await prisma.connectedAccount.create({
        data: {
          projectId: body.projectId,
          platform,
          username,
          nickname: body.nickname?.trim() || username,
          avatar: username.slice(0, 1).toUpperCase(),
          status: platform === "tiktok" ? "active" : "coming_soon",
        },
      });
      logger.info("db", "Created connected account", {
        id: saved.id,
        username,
        platform,
      });
    }

    await withTimeout(
      dedupeTikTokAccounts(body.projectId).catch(() => undefined),
      5_000,
      "Account dedupe",
    ).catch(() => undefined);

    let sync = null;
    if (platform === "tiktok" && body.sync !== false) {
      try {
        const { syncTikTokAccount } = await import("@/services/tiktok-sync");
        // Hard cap so a slow TikTok scrape can't 502 the whole function.
        sync = await withTimeout(
          syncTikTokAccount(saved.id),
          5_000,
          "TikTok sync",
        );
      } catch (syncErr) {
        logger.warn("api", "Account saved but sync failed/timed out", {
          accountId: saved.id,
          message: syncErr instanceof Error ? syncErr.message : String(syncErr),
        });
        sync = {
          success: false,
          steps: [],
          error:
            syncErr instanceof Error ? syncErr.message : "Sync failed",
        };
      }
    }

    const fresh = await prisma.connectedAccount.findUnique({
      where: { id: saved.id },
      include: { syncLogs: { orderBy: { startedAt: "desc" }, take: 3 } },
    });

    // Invalidate list cache for this project
    accountsCache.delete(body.projectId);

    return ok({ account: fresh, sync }, account ? 200 : 201);
  } catch (err) {
    if (isAuthError(err)) return fail(err.message, err.status);
    logger.error("api", "POST /api/accounts failed", {
      message: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined,
    });
    return fail(err);
  }
}

export const GET = withApi(handleGET, "GET src/app/api/accounts/route.ts");
export const POST = withApi(handlePOST, "POST src/app/api/accounts/route.ts");
