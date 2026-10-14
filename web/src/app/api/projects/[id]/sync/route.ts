import { NextResponse } from "next/server";
import { guardProjectId, isAuthError } from "@/lib/api-auth";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import { withApi } from "@/lib/api-route";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * Sync all connected TikTok accounts for a project, then return fresh.
 * Throttle: skip if synced within `minAgeMinutes` unless force=true.
 */
async function handlePOST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: projectId } = await params;
    await guardProjectId(projectId);

    const body = (await req.json().catch(() => ({}))) as {
      force?: boolean;
      minAgeMinutes?: number;
    };
    const force = Boolean(body.force);
    const minAge = body.minAgeMinutes ?? 15;

    const accounts = await prisma.connectedAccount.findMany({
      where: { projectId },
      select: { id: true, username: true, lastSyncAt: true },
    });

    if (!accounts.length) {
      return NextResponse.json({
        synced: 0,
        skipped: true,
        reason: "No connected accounts",
        results: [],
      });
    }

    const cutoff = Date.now() - minAge * 60_000;
    const stale = accounts.filter(
      (a) => force || !a.lastSyncAt || a.lastSyncAt.getTime() < cutoff,
    );

    if (!stale.length) {
      return NextResponse.json({
        synced: 0,
        skipped: true,
        reason: `All accounts synced within the last ${minAge} minutes`,
        results: [],
      });
    }

    const { syncTikTokAccount } = await import("@/services/tiktok-sync");

    const results: {
      accountId: string;
      username: string;
      ok: boolean;
      posts?: number;
      error?: string;
    }[] = [];

    for (const a of stale) {
      try {
        const r = await syncTikTokAccount(a.id);
        results.push({
          accountId: a.id,
          username: a.username,
          ok: r.success,
          posts: r.videosSynced,
          error: r.error,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : "Sync failed";
        logger.error("sync", `Project sync failed for ${a.username}: ${message}`);
        results.push({
          accountId: a.id,
          username: a.username,
          ok: false,
          error: message,
        });
      }
    }

    return NextResponse.json({
      synced: results.filter((r) => r.ok).length,
      skipped: false,
      results,
    });
  } catch (err) {
    if (isAuthError(err)) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    const message = err instanceof Error ? err.message : "Sync failed";
    logger.error("api", "POST /api/projects/[id]/sync failed", {
      message,
      stack: err instanceof Error ? err.stack : undefined,
    });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export const POST = withApi(handlePOST, "POST src/app/api/projects/[id]/sync/route.ts");
