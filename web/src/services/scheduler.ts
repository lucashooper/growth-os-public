import "server-only";

import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";

export type StaggerPlanInput = {
  projectId: string;
  postIds: string[];
  accountIds: string[];
  /** When the first post should go out */
  startAt: Date;
  /** Hours between posts (e.g. 4) */
  intervalHours: number;
  /** ± jitter in minutes (e.g. 20) */
  randomJitterMinutes?: number;
  /** Store as TikTok inbox draft vs direct publish */
  uploadAsDraft?: boolean;
  /** Round-robin across accounts (default true) */
  distributeEvenly?: boolean;
  source?: string;
};

export type StaggerPlanItem = {
  postId: string;
  accountId: string;
  scheduledAt: Date;
  publishWindow: number;
};

/**
 * Distribute posts across accounts with anti-bot randomized stagger timing.
 */
export function buildStaggerPlan(input: StaggerPlanInput): StaggerPlanItem[] {
  const {
    postIds,
    accountIds,
    startAt,
    intervalHours,
    randomJitterMinutes = 20,
    distributeEvenly = true,
  } = input;

  if (!postIds.length || !accountIds.length) return [];

  const intervalMs = Math.max(0.25, intervalHours) * 60 * 60 * 1000;
  const jitterMs = Math.max(0, randomJitterMinutes) * 60 * 1000;
  const plan: StaggerPlanItem[] = [];

  for (let i = 0; i < postIds.length; i++) {
    const postId = postIds[i]!;
    const accountId = distributeEvenly
      ? accountIds[i % accountIds.length]!
      : accountIds[0]!;
    const jitter =
      jitterMs > 0 ? (Math.random() * 2 - 1) * jitterMs : 0;
    const scheduledAt = new Date(
      startAt.getTime() + i * intervalMs + jitter,
    );
    // Ensure we never schedule in the past
    if (scheduledAt.getTime() < Date.now() + 60_000) {
      scheduledAt.setTime(Date.now() + 60_000 + i * 30_000);
    }
    plan.push({
      postId,
      accountId,
      scheduledAt,
      publishWindow: Math.round(randomJitterMinutes),
    });
  }

  return plan;
}

/**
 * Persist stagger plan as PublishAttempt rows + mark posts scheduled.
 */
export async function scheduleStaggerBatch(
  input: StaggerPlanInput,
): Promise<{ attempts: { id: string; scheduledAt: string }[]; count: number }> {
  const plan = buildStaggerPlan(input);
  const uploadAsDraft = input.uploadAsDraft !== false;
  const attempts: { id: string; scheduledAt: string }[] = [];

  for (const item of plan) {
    const meta = JSON.stringify({
      uploadAsDraft,
      stagger: true,
      intervalHours: input.intervalHours,
      jitterMinutes: input.randomJitterMinutes ?? 20,
    });

    const attempt = await prisma.publishAttempt.create({
      data: {
        postId: item.postId,
        accountId: item.accountId,
        projectId: input.projectId,
        scheduledAt: item.scheduledAt,
        publishWindow: item.publishWindow,
        status: "QUEUED",
        priority: 0,
        source: input.source || "stagger",
        metaJson: meta,
      },
    });

    await prisma.post.update({
      where: { id: item.postId },
      data: {
        status: "scheduled",
        accountId: item.accountId,
        scheduledAt: item.scheduledAt,
      },
    });

    attempts.push({
      id: attempt.id,
      scheduledAt: attempt.scheduledAt.toISOString(),
    });
  }

  logger.info("publish-engine", "Stagger batch scheduled", {
    projectId: input.projectId,
    count: attempts.length,
    accounts: input.accountIds.length,
  });

  return { attempts, count: attempts.length };
}

/** Map spacing presets to hours. */
export function spacingToHours(
  spacing: "2h" | "4h" | "daily" | string,
): number {
  if (spacing === "2h") return 2;
  if (spacing === "4h") return 4;
  if (spacing === "daily") return 24;
  const n = Number(spacing);
  return Number.isFinite(n) && n > 0 ? n : 4;
}
