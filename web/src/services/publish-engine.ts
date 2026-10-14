import "server-only";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";

/**
 * Production-grade Publish Engine
 * 
 * Core scheduler logic — handles lifecycle, rate limiting, staggering, retries.
 * Pure business logic with minimal I/O (only Prisma queries).
 */

export interface PublishEngineConfig {
  minPublishGapMinutes: number;
  maxPublishesPerDay: number;
  maxPublishesPerHour: number;
  staggerGapMinutes: [number, number];
  maxConcurrentPublishes: number;
  maxRetries: number;
  retryBackoffBaseMs: number;
}

const DEFAULT_CONFIG: PublishEngineConfig = {
  minPublishGapMinutes: parseInt(process.env.PUBLISH_MIN_GAP_MINUTES || "10", 10),
  maxPublishesPerDay: parseInt(process.env.PUBLISH_MAX_PER_DAY || "10", 10),
  maxPublishesPerHour: parseInt(process.env.PUBLISH_MAX_PER_HOUR || "3", 10),
  staggerGapMinutes: [
    parseInt(process.env.PUBLISH_STAGGER_GAP_MIN || "3", 10),
    parseInt(process.env.PUBLISH_STAGGER_GAP_MAX || "5", 10),
  ],
  maxConcurrentPublishes: 1, // Single-threaded for safety
  maxRetries: parseInt(process.env.PUBLISH_MAX_RETRIES || "3", 10),
  retryBackoffBaseMs: parseInt(process.env.PUBLISH_RETRY_BACKOFF_BASE_MS || "300000", 10), // 5 min
};

export type PublishAttemptStatus = 
  | "QUEUED" 
  | "PENDING" 
  | "PUBLISHING" 
  | "SUBMITTED" 
  | "COMPLETED" 
  | "FAILED" 
  | "ABANDONED";

export class PublishEngine {
  constructor(private config: PublishEngineConfig = DEFAULT_CONFIG) {}

  /**
   * Get all attempts ready to publish right now.
   * Includes PENDING status + actualPublishAt <= NOW.
   */
  async getPublishableJobs(): Promise<any[]> {
    const now = new Date();
    
    // First, transition QUEUED → PENDING if within publish window
    await this.transitionQueuedToPending(now);
    
    // Then find all PENDING jobs that are ready
    const jobs = await prisma.publishAttempt.findMany({
      where: {
        status: "PENDING",
        actualPublishAt: { lte: now },
        lockedAt: null, // Not already locked by another worker
      },
      include: {
        post: true,
        account: {
          include: {
            publishHealth: true,
          },
        },
      },
      orderBy: [
        { priority: "desc" },
        { scheduledAt: "asc" },
      ],
    });

    logger.info("publish-engine", "getPublishableJobs", {
      found: jobs.length,
      now: now.toISOString(),
    });

    return jobs;
  }

  /**
   * Transition QUEUED → PENDING when scheduledAt is reached.
   * Compute actualPublishAt (random within window).
   */
  private async transitionQueuedToPending(now: Date): Promise<void> {
    const queued = await prisma.publishAttempt.findMany({
      where: {
        status: "QUEUED",
        scheduledAt: { lte: now },
      },
    });

    for (const attempt of queued) {
      const actualPublishAt = this.computeActualPublishTime(
        attempt.scheduledAt,
        attempt.publishWindow,
      );

      await prisma.publishAttempt.update({
        where: { id: attempt.id },
        data: {
          status: "PENDING",
          actualPublishAt,
        },
      });

      logger.info("publish-engine", "transition:QUEUED→PENDING", {
        attemptId: attempt.id,
        scheduledAt: attempt.scheduledAt.toISOString(),
        actualPublishAt: actualPublishAt.toISOString(),
        window: attempt.publishWindow,
      });
    }
  }

  /**
   * Compute random publish time within window.
   * If publishWindow = 0, returns scheduledAt exactly.
   * Otherwise returns random time between scheduledAt and scheduledAt + window.
   */
  private computeActualPublishTime(scheduledAt: Date, publishWindow: number): Date {
    if (publishWindow === 0) return scheduledAt;
    
    const windowMs = publishWindow * 60 * 1000;
    const randomOffset = Math.random() * windowMs;
    return new Date(scheduledAt.getTime() + randomOffset);
  }

  /**
   * Check if account can publish now (rate limit check).
   */
  async canPublishNow(
    accountId: string,
  ): Promise<{ ok: boolean; reason?: string; waitMinutes?: number }> {
    // Get or create health record
    let health = await prisma.publishHealth.findUnique({
      where: { accountId },
    });

    if (!health) {
      health = await prisma.publishHealth.create({
        data: { accountId },
      });
    }

    const now = new Date();

    // Check if explicitly rate-limited
    if (health.isRateLimited && health.rateLimitUntil) {
      if (health.rateLimitUntil > now) {
        const waitMs = health.rateLimitUntil.getTime() - now.getTime();
        return {
          ok: false,
          reason: "rate_limited_explicit",
          waitMinutes: Math.ceil(waitMs / 60000),
        };
      }
      // Rate limit expired, clear it
      await prisma.publishHealth.update({
        where: { accountId },
        data: { isRateLimited: false, rateLimitUntil: null },
      });
    }

    // Reset counters if window expired (24h for daily, 1h for hourly)
    const resetAge = now.getTime() - health.windowResetAt.getTime();
    if (resetAge > 24 * 60 * 60 * 1000) {
      await prisma.publishHealth.update({
        where: { accountId },
        data: {
          publishCount24h: 0,
          publishCount1h: 0,
          windowResetAt: now,
        },
      });
      health.publishCount24h = 0;
      health.publishCount1h = 0;
    } else if (resetAge > 60 * 60 * 1000) {
      await prisma.publishHealth.update({
        where: { accountId },
        data: { publishCount1h: 0 },
      });
      health.publishCount1h = 0;
    }

    // Check daily limit
    if (health.publishCount24h >= this.config.maxPublishesPerDay) {
      return {
        ok: false,
        reason: "daily_limit_reached",
        waitMinutes: Math.ceil((24 * 60 * 60 * 1000 - resetAge) / 60000),
      };
    }

    // Check hourly limit
    if (health.publishCount1h >= this.config.maxPublishesPerHour) {
      return {
        ok: false,
        reason: "hourly_limit_reached",
        waitMinutes: Math.ceil((60 * 60 * 1000 - resetAge) / 60000),
      };
    }

    // Check minimum gap since last publish
    if (health.lastPublishAt) {
      const gapMs = now.getTime() - health.lastPublishAt.getTime();
      const minGapMs = this.config.minPublishGapMinutes * 60 * 1000;
      if (gapMs < minGapMs) {
        return {
          ok: false,
          reason: "min_gap_not_met",
          waitMinutes: Math.ceil((minGapMs - gapMs) / 60000),
        };
      }
    }

    return { ok: true };
  }

  /**
   * Acquire lock on an attempt (prevents concurrent publishes).
   * Returns true if lock acquired, false if already locked.
   */
  async acquireLock(attemptId: string, workerId: string): Promise<boolean> {
    const now = new Date();
    
    try {
      const result = await prisma.publishAttempt.updateMany({
        where: {
          id: attemptId,
          lockedAt: null,
        },
        data: {
          lockedAt: now,
          lockedBy: workerId,
        },
      });

      const acquired = result.count > 0;
      
      if (acquired) {
        logger.info("publish-engine", "lock:acquired", {
          attemptId,
          workerId,
        });
      }

      return acquired;
    } catch (err) {
      logger.error("publish-engine", "lock:failed", {
        attemptId,
        workerId,
        error: err instanceof Error ? err.message : String(err),
      });
      return false;
    }
  }

  /**
   * Release lock on an attempt.
   */
  async releaseLock(attemptId: string): Promise<void> {
    await prisma.publishAttempt.update({
      where: { id: attemptId },
      data: {
        lockedAt: null,
        lockedBy: null,
      },
    });

    logger.info("publish-engine", "lock:released", { attemptId });
  }

  /**
   * Transition attempt to new status with metadata.
   */
  async transitionTo(
    attemptId: string,
    status: PublishAttemptStatus,
    meta?: { publishJobId?: string; publishId?: string; error?: string; errorCode?: string },
  ): Promise<void> {
    const attempt = await prisma.publishAttempt.findUnique({
      where: { id: attemptId },
    });

    if (!attempt) {
      logger.error("publish-engine", "transition:attempt_not_found", { attemptId });
      return;
    }

    const updates: any = { status, updatedAt: new Date() };
    
    if (meta?.publishJobId) updates.publishJobId = meta.publishJobId;
    if (meta?.publishId) updates.publishId = meta.publishId;
    if (meta?.error) updates.error = meta.error;
    if (meta?.errorCode) updates.errorCode = meta.errorCode;

    // Clear lock when moving to terminal states
    if (["COMPLETED", "FAILED", "ABANDONED"].includes(status)) {
      updates.lockedAt = null;
      updates.lockedBy = null;
    }

    await prisma.publishAttempt.update({
      where: { id: attemptId },
      data: updates,
    });

    logger.info("publish-engine", "transition", {
      attemptId,
      postId: attempt.postId,
      accountId: attempt.accountId,
      fromStatus: attempt.status,
      toStatus: status,
      attempt: attempt.attempt,
      ...meta,
    });

    // Update Post.status for backward compat
    if (status === "COMPLETED") {
      await prisma.post.update({
        where: { id: attempt.postId },
        data: { status: "published", publishedAt: new Date() },
      });
    } else if (status === "FAILED" || status === "ABANDONED") {
      await prisma.post.update({
        where: { id: attempt.postId },
        data: { status: "failed" },
      });
    }
  }

  /**
   * Schedule retry with exponential backoff.
   * If maxRetries reached, transition to ABANDONED.
   */
  async scheduleRetry(
    attemptId: string,
    error: string,
    errorCode?: string,
  ): Promise<void> {
    const attempt = await prisma.publishAttempt.findUnique({
      where: { id: attemptId },
    });

    if (!attempt) return;

    const nextAttempt = attempt.attempt + 1;

    if (nextAttempt > attempt.maxRetries) {
      await this.transitionTo(attemptId, "ABANDONED", { error, errorCode });
      logger.warn("publish-engine", "retry:abandoned", {
        attemptId,
        attempts: attempt.attempt,
        maxRetries: attempt.maxRetries,
        error,
      });
      return;
    }

    // Exponential backoff: base * 2^(attempt - 1)
    const backoffMs = this.config.retryBackoffBaseMs * Math.pow(2, attempt.attempt - 1);
    const retryAt = new Date(Date.now() + backoffMs);

    await prisma.publishAttempt.update({
      where: { id: attemptId },
      data: {
        status: "PENDING",
        attempt: nextAttempt,
        actualPublishAt: retryAt,
        error,
        errorCode,
        lockedAt: null,
        lockedBy: null,
      },
    });

    logger.info("publish-engine", "retry:scheduled", {
      attemptId,
      attempt: nextAttempt,
      maxRetries: attempt.maxRetries,
      retryAt: retryAt.toISOString(),
      backoffMs,
      error,
    });
  }

  /**
   * Update publish health after attempt (success or failure).
   */
  async updatePublishHealth(accountId: string, success: boolean): Promise<void> {
    const now = new Date();

    let health = await prisma.publishHealth.findUnique({
      where: { accountId },
    });

    if (!health) {
      health = await prisma.publishHealth.create({
        data: { accountId },
      });
    }

    const updates: any = {
      lastPublishAt: now,
      publishCount24h: health.publishCount24h + 1,
      publishCount1h: health.publishCount1h + 1,
    };

    if (success) {
      updates.lastSuccessAt = now;
      updates.successCount = health.successCount + 1;
    } else {
      updates.lastFailureAt = now;
      updates.failureCount = health.failureCount + 1;
    }

    const totalAttempts = updates.successCount + updates.failureCount;
    updates.successRate = totalAttempts > 0 ? updates.successCount / totalAttempts : 1.0;

    await prisma.publishHealth.update({
      where: { accountId },
      data: updates,
    });

    logger.info("publish-engine", "health:updated", {
      accountId,
      success,
      successRate: updates.successRate,
      publishCount24h: updates.publishCount24h,
    });
  }

  /**
   * Get next account to publish (staggered by lastPublishAt).
   * Returns accountId of account that published longest ago.
   */
  async getNextPublishableAccount(accountIds: string[]): Promise<string | null> {
    if (!accountIds.length) return null;

    // Get health records for all accounts
    const healthRecords = await prisma.publishHealth.findMany({
      where: { accountId: { in: accountIds } },
    });

    // Map accountId → lastPublishAt
    const healthMap = new Map<string, Date | null>();
    for (const record of healthRecords) {
      healthMap.set(record.accountId, record.lastPublishAt);
    }

    // Add accounts without health records (never published)
    for (const accountId of accountIds) {
      if (!healthMap.has(accountId)) {
        healthMap.set(accountId, null);
      }
    }

    // Sort by lastPublishAt (oldest first, null = never published = highest priority)
    const sorted = Array.from(healthMap.entries()).sort((a, b) => {
      if (a[1] === null) return -1; // Never published = highest priority
      if (b[1] === null) return 1;
      return a[1].getTime() - b[1].getTime();
    });

    return sorted[0]?.[0] || null;
  }

  /**
   * Get accounts that are currently rate-limited.
   */
  async getRateLimitedAccounts(): Promise<string[]> {
    const now = new Date();
    
    const limited = await prisma.publishHealth.findMany({
      where: {
        OR: [
          { isRateLimited: true, rateLimitUntil: { gt: now } },
        ],
      },
      select: { accountId: true },
    });

    return limited.map((h) => h.accountId);
  }
}
