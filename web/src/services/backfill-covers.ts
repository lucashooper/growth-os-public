import "server-only";

import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";

/**
 * Backfill missing coverUrl values for existing posts
 * Uses slides[0] or meta.visualSlides[0].backgroundUrl
 */
export async function backfillMissingCovers(opts?: {
  projectId?: string;
  dryRun?: boolean;
  limit?: number;
}): Promise<{
  checked: number;
  updated: number;
  skipped: number;
  errors: number;
}> {
  const dryRun = opts?.dryRun ?? false;
  const limit = opts?.limit ?? 100;

  const posts = await prisma.post.findMany({
    where: {
      ...(opts?.projectId && { projectId: opts.projectId }),
      OR: [
        { coverUrl: { in: [null as any, ""] } },
      ],
    },
    take: limit,
    select: {
      id: true,
      hook: true,
      coverUrl: true,
      slidesJson: true,
      metaJson: true,
    },
  });

  logger.info("backfill", `Checking ${posts.length} posts for missing covers`, {
    projectId: opts?.projectId,
    dryRun,
  });

  let updated = 0;
  let skipped = 0;
  let errors = 0;

  for (const post of posts) {
    try {
      // Parse slides and meta
      const slides = JSON.parse(post.slidesJson || "[]") as string[];
      const meta = JSON.parse(post.metaJson || "{}") as {
        visualSlides?: { backgroundUrl?: string }[];
      };

      // Try to find a cover image
      let coverUrl: string | null = null;

      // 1. First slide if it's a URL
      if (Array.isArray(slides) && slides[0]?.startsWith("http")) {
        coverUrl = slides[0];
      }

      // 2. First visualSlide backgroundUrl
      if (
        !coverUrl &&
        Array.isArray(meta.visualSlides) &&
        meta.visualSlides[0]?.backgroundUrl
      ) {
        coverUrl = meta.visualSlides[0].backgroundUrl;
      }

      if (coverUrl) {
        console.log(`[backfill] Found cover for "${post.hook?.substring(0, 30)}": ${coverUrl.substring(0, 50)}`);

        if (!dryRun) {
          await prisma.post.update({
            where: { id: post.id },
            data: { coverUrl },
          });
        }

        updated++;
      } else {
        skipped++;
      }
    } catch (err) {
      logger.error("backfill", `Failed to process post ${post.id}`, {
        error: err instanceof Error ? err.message : String(err),
      });
      errors++;
    }
  }

  logger.info("backfill", "Backfill complete", {
    checked: posts.length,
    updated,
    skipped,
    errors,
    dryRun,
  });

  return {
    checked: posts.length,
    updated,
    skipped,
    errors,
  };
}

/**
 * Run backfill from CLI:
 * 
 * ```bash
 * node --loader ts-node/esm -e "import('./src/services/backfill-covers.ts').then(m => m.backfillMissingCovers({ dryRun: true }))"
 * ```
 */
if (require.main === module) {
  backfillMissingCovers({ dryRun: process.argv.includes("--dry-run") })
    .then((result) => {
      console.log("Backfill complete:", result);
      process.exit(0);
    })
    .catch((err) => {
      console.error("Backfill failed:", err);
      process.exit(1);
    });
}
