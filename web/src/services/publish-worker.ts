import "server-only";
import { logger } from "@/lib/logger";
import { PublishEngine } from "@/services/publish-engine";
import { Publisher } from "@/services/publisher";
import { v4 as uuidv4 } from "uuid";

/**
 * Publish Worker — Background job that runs every 2 min
 * 
 * Orchestrates the full publish pipeline:
 * 1. Find jobs due now
 * 2. Check rate limits
 * 3. Stagger multi-account publishing
 * 4. Acquire locks
 * 5. Publish via TikTok API
 * 6. Handle success/failure/retry
 */

// Worker ID persists for process lifetime
const WORKER_ID = uuidv4();

export async function jobPublishScheduled(): Promise<string> {
  const startTime = Date.now();
  
  logger.info("publish-worker", "job:start", {
    workerId: WORKER_ID,
  });

  const engine = new PublishEngine();
  const publisher = new Publisher();

  try {
    // 1. Get all jobs due now (status=PENDING, actualPublishAt <= NOW, not locked)
    const dueJobs = await engine.getPublishableJobs();
    
    if (!dueJobs.length) {
      logger.info("publish-worker", "job:no_jobs", {
        workerId: WORKER_ID,
        duration: Date.now() - startTime,
      });
      return "No jobs due";
    }

    logger.info("publish-worker", "job:found_jobs", {
      workerId: WORKER_ID,
      count: dueJobs.length,
      accountIds: [...new Set(dueJobs.map((j: any) => j.accountId))],
    });

    // 2. Check which accounts are rate-limited
    const rateLimited = await engine.getRateLimitedAccounts();
    const availableJobs = dueJobs.filter((j: any) => !rateLimited.includes(j.accountId));

    if (!availableJobs.length) {
      logger.warn("publish-worker", "job:all_rate_limited", {
        workerId: WORKER_ID,
        rateLimitedAccounts: rateLimited.length,
      });
      return `All ${rateLimited.length} accounts rate-limited`;
    }

    // 3. Get next account to publish (staggered by lastPublishAt)
    const accountIds = [...new Set(availableJobs.map((j: any) => j.accountId))];
    const nextAccountId = await engine.getNextPublishableAccount(accountIds);

    if (!nextAccountId) {
      logger.warn("publish-worker", "job:no_publishable_account", {
        workerId: WORKER_ID,
        accountIds,
      });
      return "No publishable accounts";
    }

    // 4. Publish ONE job from that account (single-threaded, staggered)
    const jobsForAccount = availableJobs.filter((j: any) => j.accountId === nextAccountId);
    const job = jobsForAccount[0]; // Highest priority

    logger.info("publish-worker", "job:selected", {
      workerId: WORKER_ID,
      attemptId: job.id,
      postId: job.postId,
      accountId: job.accountId,
      account: job.account.username,
      priority: job.priority,
    });

    // 5. Acquire lock
    const locked = await engine.acquireLock(job.id, WORKER_ID);
    if (!locked) {
      logger.warn("publish-worker", "job:lock_failed", {
        workerId: WORKER_ID,
        attemptId: job.id,
      });
      return "Lock failed (another worker publishing)";
    }

    let publishSuccess = false;

    try {
      // 6. Double-check rate limits (prevent race condition)
      const { ok, reason, waitMinutes } = await engine.canPublishNow(job.accountId);
      if (!ok) {
        logger.warn("publish-worker", "job:rate_limited", {
          workerId: WORKER_ID,
          attemptId: job.id,
          reason,
          waitMinutes,
        });
        await engine.scheduleRetry(job.id, `Rate limited: ${reason}`, reason);
        return `Rate limited: ${reason} (retry in ${waitMinutes} min)`;
      }

      // 7. Publish
      await engine.transitionTo(job.id, "PUBLISHING");
      
      const result = await publisher.publish(job);

      if (result.success) {
        await engine.transitionTo(job.id, "SUBMITTED", {
          publishId: result.publishId,
          publishJobId: result.publishJobId,
        });
        await engine.updatePublishHealth(job.accountId, true);
        publishSuccess = true;

        logger.info("publish-worker", "job:published", {
          workerId: WORKER_ID,
          attemptId: job.id,
          publishId: result.publishId,
          duration: Date.now() - startTime,
        });

        return `Published: ${job.account.username} → "${job.post.hook.slice(0, 40)}..."`;
      } else {
        await engine.scheduleRetry(job.id, result.error || "Unknown error", result.errorCode);
        await engine.updatePublishHealth(job.accountId, false);

        logger.error("publish-worker", "job:failed", {
          workerId: WORKER_ID,
          attemptId: job.id,
          error: result.error,
          errorCode: result.errorCode,
        });

        return `Failed: ${result.error}`;
      }
    } finally {
      // 8. Always release lock
      await engine.releaseLock(job.id);
      
      logger.info("publish-worker", "job:complete", {
        workerId: WORKER_ID,
        attemptId: job.id,
        success: publishSuccess,
        duration: Date.now() - startTime,
      });
    }
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    
    logger.error("publish-worker", "job:error", {
      workerId: WORKER_ID,
      error,
      duration: Date.now() - startTime,
    });

    return `Worker error: ${error}`;
  }
}
