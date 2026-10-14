import { after } from "next/server";
import { fail, ok } from "@/lib/api-response";
import { isAuthError, requireProjectAccess } from "@/lib/api-auth";
import { prisma } from "@/lib/db";
import { withApi } from "@/lib/api-route";
import { logger } from "@/lib/logger";

export const runtime = "nodejs";
/** Fast ACK — background work continues via next/server `after` */
export const maxDuration = 60;

/**
 * Async TikTok sync: mark SYNCING, return 202 immediately, finish in background.
 * Avoids Netlify 504 gateway timeouts on long Apify / cover upload runs.
 * Uses `after()` so the runtime keeps the isolate alive until the job settles.
 */
async function handlePOST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const existing = await prisma.connectedAccount.findUnique({ where: { id } });
    if (!existing) return fail("Account not found", 404);
    await requireProjectAccess(existing.projectId);

    const syncing =
      existing.status === "syncing" || existing.status === "SYNCING";
    // Netlify `after()` can die mid-job and leave SYNCING forever — recover after 90s.
    const staleMs = Date.now() - new Date(existing.updatedAt).getTime();
    const STALE_SYNC_MS = 90_000;
    if (syncing && staleMs < STALE_SYNC_MS) {
      return ok(
        {
          status: "SYNCING",
          message: "Sync already in progress",
          accountId: id,
        },
        202,
      );
    }
    if (syncing && staleMs >= STALE_SYNC_MS) {
      console.log(
        `[Sync] Clearing stale SYNCING for @${existing.username} (${Math.round(staleMs / 1000)}s old)`,
      );
      await prisma.connectedAccount.update({
        where: { id },
        data: {
          status: "error",
          lastError: "Previous sync timed out. Starting a fresh sync…",
        },
      });
    }

    await prisma.connectedAccount.update({
      where: { id },
      data: { status: "SYNCING", lastError: null },
    });

    console.log(`[Sync Job Started] @${existing.username} (${id})`);
    logger.info("sync", `[Sync Job Started] @${existing.username}`, {
      accountId: id,
    });

    const username = existing.username;

    after(async () => {
      const finishStatus = async (
        success: boolean,
        error?: string | null,
        preserveProfileError?: string | null,
      ) => {
        await prisma.connectedAccount.update({
          where: { id },
          data: {
            status: success ? "active" : "error",
            lastSyncAt: new Date(),
            lastError: success
              ? preserveProfileError || null
              : (error || "Sync failed").slice(0, 500),
          },
        });
      };

      try {
        const { syncTikTokAccount } = await import("@/services/tiktok-sync");
        const result = await syncTikTokAccount(id);
        console.log(
          `[TikTok Sync] Raw response: follower_count=${result.followers} videos=${result.videosSynced} success=${result.success}`,
          result.rawValues || {},
        );
        logger.info("sync", "[TikTok Sync] Job result", {
          accountId: id,
          follower_count: result.followers,
          videosSynced: result.videosSynced,
          success: result.success,
        });

        // Keep soft warning when profile ok but no videos (don't wipe it with null)
        const softWarn =
          result.success &&
          result.videosSynced === 0 &&
          typeof result.rawValues?.videosSynced === "number"
            ? "Profile synced, but no public videos were returned. The account may have no posts, or TikTok hid the grid. Try Sync again."
            : null;

        await finishStatus(
          result.success,
          result.error,
          softWarn,
        );
        console.log(
          `[Sync Job Complete] @${username} success=${result.success} videos=${result.videosSynced}`,
        );
        logger.info("sync", `[Sync Job Complete] @${username}`, {
          accountId: id,
          success: result.success,
          videosSynced: result.videosSynced,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.log(`[Sync Job Failed] @${username}: ${message}`);
        logger.error("sync", `[Sync Job Failed] @${username}`, {
          accountId: id,
          message,
        });
        await finishStatus(false, message).catch(() => undefined);
      }
    });

    return ok(
      {
        status: "SYNCING",
        message: "Sync started",
        accountId: id,
        username: existing.username,
      },
      202,
    );
  } catch (err) {
    if (isAuthError(err)) return fail(err.message, err.status);
    logger.error("api", "POST /api/accounts/[id]/sync failed", {
      message: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined,
    });
    return fail(err, 500, "sync");
  }
}

export const POST = withApi(
  handlePOST,
  "POST src/app/api/accounts/[id]/sync/route.ts",
);
