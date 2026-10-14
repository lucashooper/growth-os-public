import "server-only";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import { publishPhotoCarousel } from "@/services/tiktok-publish";
import type { ExportSlide } from "@/lib/carousel-export";

/**
 * Publisher — thin wrapper around publishPhotoCarousel
 * 
 * Handles image preparation, API calls, and error formatting.
 * Stateless — all state managed by PublishEngine.
 */

export interface PublishResult {
  success: boolean;
  publishId?: string;
  publishJobId?: string;
  error?: string;
  errorCode?: string;
}

export class Publisher {
  /**
   * Publish a post attempt to TikTok.
   * Returns success/failure + TikTok IDs.
   */
  async publish(attempt: {
    id: string;
    postId: string;
    accountId: string;
    post: {
      hook: string;
      caption: string;
      slidesJson: string;
      metaJson: string;
      coverUrl?: string;
      projectId: string;
    };
    account: {
      username: string;
    };
  }): Promise<PublishResult> {
    const { post, account } = attempt;

    logger.info("publisher", "publish:start", {
      attemptId: attempt.id,
      postId: post.projectId,
      accountId: attempt.accountId,
      account: account.username,
    });

    try {
      // Prepare images (hosted URLs required by TikTok)
      const photoUrls = await this.prepareImages(post);

      if (!photoUrls.length) {
        return {
          success: false,
          error: "No images found in post",
          errorCode: "NO_IMAGES",
        };
      }

      // Parse meta for publish settings
      const meta = this.parseMeta(post.metaJson);

      // Call TikTok API
      const result = await publishPhotoCarousel({
        projectId: post.projectId,
        accountId: attempt.accountId,
        postId: post.projectId,
        title: post.hook.slice(0, 90),
        description: post.caption || post.hook,
        privacyLevel: meta.privacyLevel || "PUBLIC_TO_EVERYONE",
        disableComment: meta.disableComment ?? false,
        autoAddMusic: meta.autoAddMusic ?? true,
        brandOrganic: meta.brandOrganic ?? false,
        brandContent: meta.brandContent ?? false,
        photoUrls,
        consentGiven: true,
        postMode: meta.postMode || "DIRECT_POST",
      });

      logger.info("publisher", "publish:success", {
        attemptId: attempt.id,
        publishId: result.publishId,
        jobId: result.jobId,
      });

      return {
        success: true,
        publishId: result.publishId,
        publishJobId: result.jobId,
      };
    } catch (err) {
      const formatted = this.formatError(err);
      
      logger.error("publisher", "publish:failed", {
        attemptId: attempt.id,
        postId: attempt.postId,
        ...formatted,
      });

      return {
        success: false,
        ...formatted,
      };
    }
  }

  /**
   * Prepare images for TikTok (extract hosted URLs from post).
   * For now, assumes images are already hosted (from visualSlides or coverUrl).
   * 
   * TODO: If images need rendering, call renderSlidesBase64 + uploadSlideUrls here.
   */
  private async prepareImages(post: {
    metaJson: string;
    coverUrl?: string;
    slidesJson: string;
  }): Promise<string[]> {
    const meta = this.parseMeta(post.metaJson);
    const urls: string[] = [];

    // 1. Check for pre-rendered images in meta.visualSlides
    if (meta.visualSlides?.length) {
      for (const slide of meta.visualSlides) {
        if (slide.backgroundUrl && /^https?:\/\//i.test(slide.backgroundUrl)) {
          urls.push(slide.backgroundUrl);
        }
      }
    }

    // 2. Fallback to coverUrl if no visualSlides
    if (!urls.length && post.coverUrl && /^https?:\/\//i.test(post.coverUrl)) {
      urls.push(post.coverUrl);
    }

    // 3. If still no images, log warning (caller will handle error)
    if (!urls.length) {
      logger.warn("publisher", "prepareImages:no_urls", {
        postId: post.coverUrl,
        hasCoverUrl: Boolean(post.coverUrl),
        hasVisualSlides: Boolean(meta.visualSlides?.length),
      });
    }

    return urls;
  }

  /**
   * Parse post metadata (safe JSON parse).
   */
  private parseMeta(metaJson: string): any {
    try {
      return JSON.parse(metaJson || "{}");
    } catch {
      return {};
    }
  }

  /**
   * Format error for storage + logging.
   */
  private formatError(err: unknown): { error: string; errorCode?: string } {
    if (err instanceof Error) {
      // Check for TikTok API error codes
      const message = err.message;
      
      if (message.includes("rate_limit")) {
        return { error: message, errorCode: "RATE_LIMIT" };
      }
      if (message.includes("spam_risk")) {
        return { error: message, errorCode: "SPAM_RISK" };
      }
      if (message.includes("access_token")) {
        return { error: message, errorCode: "TOKEN_INVALID" };
      }
      if (message.includes("privacy_level")) {
        return { error: message, errorCode: "PRIVACY_MISMATCH" };
      }

      return { error: message, errorCode: "UNKNOWN" };
    }

    return { error: String(err), errorCode: "UNKNOWN" };
  }
}
