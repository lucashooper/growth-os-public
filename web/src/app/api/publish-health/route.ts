import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { AuthError, guardProjectId, isAuthError } from "@/lib/api-auth";
import { logger } from "@/lib/logger";
import { withApi } from "@/lib/api-route";

export const runtime = "nodejs";

/**
 * GET /api/publish-health
 * Get publish health metrics per account
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

    const where: any = {};
    if (accountId) {
      where.accountId = accountId;
    } else {
      // Get all accounts for project
      const accounts = await prisma.connectedAccount.findMany({
        where: { projectId },
        select: { id: true },
      });
      where.accountId = { in: accounts.map((a) => a.id) };
    }

    const healthRecords = await prisma.publishHealth.findMany({
      where,
      include: {
        account: {
          select: {
            username: true,
            avatar: true,
          },
        },
      },
    });

    // Calculate next available publish time
    const now = new Date();
    const enriched = healthRecords.map((h) => {
      let nextAvailableAt: Date | null = null;

      if (h.isRateLimited && h.rateLimitUntil) {
        nextAvailableAt = h.rateLimitUntil;
      } else if (h.lastPublishAt) {
        // Min gap of 10 min
        const minGapMs = 10 * 60 * 1000;
        const nextTime = new Date(h.lastPublishAt.getTime() + minGapMs);
        if (nextTime > now) {
          nextAvailableAt = nextTime;
        }
      }

      return {
        ...h,
        nextAvailableAt,
      };
    });

    return NextResponse.json({ health: enriched });
  } catch (err) {
    if (isAuthError(err)) {
      return NextResponse.json(
        { error: (err as AuthError).message },
        { status: (err as AuthError).status },
      );
    }
    logger.error("api", "GET /api/publish-health failed", {
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json(
      { error: "Failed to fetch health" },
      { status: 500 },
    );
  }
}

export const GET = withApi(handleGET, "GET /api/publish-health");
