import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { AuthError, guardProjectId, isAuthError } from "@/lib/api-auth";
import { logger } from "@/lib/logger";
import { withApi } from "@/lib/api-route";

export const runtime = "nodejs";

/**
 * GET /api/publish-attempts
 * List publish attempts — never throws 500 for empty / missing filters.
 */
async function handleGET(req: Request) {
  try {
    const url = new URL(req.url);
    const projectId = url.searchParams.get("projectId")?.trim() || "";
    const accountId = url.searchParams.get("accountId")?.trim() || "";
    const status = url.searchParams.get("status")?.trim() || "";
    const limitRaw = parseInt(url.searchParams.get("limit") || "50", 10);
    const limit = Number.isFinite(limitRaw)
      ? Math.min(Math.max(limitRaw, 1), 200)
      : 50;

    if (!projectId) {
      // Prefetcher / incomplete clients — soft empty rather than 400/500 noise
      return NextResponse.json({ attempts: [] });
    }

    try {
      await guardProjectId(projectId);
    } catch (err) {
      if (isAuthError(err)) {
        return NextResponse.json(
          { error: (err as AuthError).message },
          { status: (err as AuthError).status },
        );
      }
      return NextResponse.json({ attempts: [] });
    }

    const where: {
      projectId: string;
      accountId?: string;
      status?: string;
    } = { projectId };
    if (accountId) where.accountId = accountId;
    if (status) where.status = status;

    try {
      const attempts = await prisma.publishAttempt.findMany({
        where,
        include: {
          post: {
            select: {
              hook: true,
              coverUrl: true,
            },
          },
          account: {
            select: {
              username: true,
              avatar: true,
            },
          },
        },
        orderBy: [
          { priority: "desc" },
          { scheduledAt: "asc" },
        ],
        take: limit,
      });

      return NextResponse.json({ attempts: attempts ?? [] });
    } catch (dbErr) {
      // Table missing / relation broken — return empty so UI stays up
      logger.warn("api", "GET /api/publish-attempts query failed — returning []", {
        error: dbErr instanceof Error ? dbErr.message : String(dbErr),
        projectId,
      });
      return NextResponse.json({ attempts: [] });
    }
  } catch (err) {
    if (isAuthError(err)) {
      return NextResponse.json(
        { error: (err as AuthError).message },
        { status: (err as AuthError).status },
      );
    }
    logger.error("api", "GET /api/publish-attempts failed", {
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json({ attempts: [] });
  }
}

/**
 * POST /api/publish-attempts
 * Create new publish attempt (schedule a post)
 */
async function handlePOST(req: Request) {
  try {
    const body = (await req.json()) as {
      postId?: string;
      accountId?: string;
      projectId?: string;
      scheduledAt?: string;
      publishWindow?: number;
      priority?: number;
      source?: string;
    };

    if (!body.postId || !body.accountId || !body.projectId) {
      return NextResponse.json(
        { error: "postId, accountId, and projectId required" },
        { status: 400 },
      );
    }

    await guardProjectId(body.projectId);

    const post = await prisma.post.findFirst({
      where: { id: body.postId, projectId: body.projectId },
      select: { id: true },
    });
    if (!post) {
      return NextResponse.json({ error: "Post not found" }, { status: 404 });
    }

    const account = await prisma.connectedAccount.findFirst({
      where: { id: body.accountId, projectId: body.projectId },
      select: { id: true },
    });
    if (!account) {
      return NextResponse.json({ error: "Account not found" }, { status: 404 });
    }

    const scheduledAt = body.scheduledAt
      ? new Date(body.scheduledAt)
      : new Date();
    if (Number.isNaN(scheduledAt.getTime())) {
      return NextResponse.json({ error: "Invalid scheduledAt" }, { status: 400 });
    }

    const publishWindow = body.publishWindow ?? 0;
    const actualPublishAt =
      publishWindow > 0
        ? new Date(
            scheduledAt.getTime() + Math.random() * publishWindow * 60 * 1000,
          )
        : scheduledAt;

    const status = scheduledAt <= new Date() ? "PENDING" : "QUEUED";

    const attempt = await prisma.publishAttempt.create({
      data: {
        postId: body.postId,
        accountId: body.accountId,
        projectId: body.projectId,
        scheduledAt,
        publishWindow,
        actualPublishAt: status === "PENDING" ? actualPublishAt : null,
        status,
        priority: body.priority ?? 0,
        source: body.source || "manual",
      },
    });

    logger.info("api", "POST /api/publish-attempts created", {
      attemptId: attempt.id,
      postId: attempt.postId,
      accountId: attempt.accountId,
      scheduledAt: attempt.scheduledAt.toISOString(),
      status: attempt.status,
    });

    return NextResponse.json({ attempt });
  } catch (err) {
    if (isAuthError(err)) {
      return NextResponse.json(
        { error: (err as AuthError).message },
        { status: (err as AuthError).status },
      );
    }
    logger.error("api", "POST /api/publish-attempts failed", {
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json(
      {
        error:
          err instanceof Error ? err.message : "Failed to create attempt",
      },
      { status: 500 },
    );
  }
}

export const GET = withApi(handleGET, "GET /api/publish-attempts");
export const POST = withApi(handlePOST, "POST /api/publish-attempts");
