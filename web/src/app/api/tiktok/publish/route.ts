import { NextResponse } from "next/server";
import { AuthError, guardProjectId } from "@/lib/api-auth";
import { logger } from "@/lib/logger";
import { tiktokOAuthConfigured } from "@/services/tiktok-oauth";
import { withApi } from "@/lib/api-route";
import {
  isTikTokApiError,
  tiktokErrorResponseBody,
} from "@/services/tiktok-api";

import {
  persistPublishImages,
  publishPhotoCarousel,
} from "@/services/tiktok-publish";

export const runtime = "nodejs";
export const maxDuration = 120;

/**
 * Body (JSON):
 * - projectId, accountId
 * - title, description, privacyLevel
 * - disableComment, autoAddMusic, brandOrganic, brandContent, consentGiven
 * - images: base64 data URLs or raw base64
 * - photoUrls?: optional if already hosted on verified domain
 *
 * On TikTok API failure, returns error_code / error_message / log_id / request_id
 * plus full diagnostics in development or when TIKTOK_DEBUG_ERRORS=1.
 */
async function handlePOST(req: Request) {
  try {
    if (!tiktokOAuthConfigured()) {
      return NextResponse.json(
        {
          error:
            "Configure TIKTOK_CLIENT_KEY / TIKTOK_CLIENT_SECRET / APP_BASE_URL first",
        },
        { status: 400 },
      );
    }

    const body = (await req.json()) as {
      projectId?: string;
      accountId?: string;
      postId?: string;
      title?: string;
      description?: string;
      privacyLevel?: string;
      disableComment?: boolean;
      disableDuet?: boolean;
      disableStitch?: boolean;
      autoAddMusic?: boolean;
      brandOrganic?: boolean;
      brandContent?: boolean;
      consentGiven?: boolean;
      images?: string[];
      photoUrls?: string[];
      /** DIRECT_POST (default) or MEDIA_UPLOAD (Save as draft / inbox) */
      postMode?: "DIRECT_POST" | "MEDIA_UPLOAD";
    };

    const postMode = body.postMode === "MEDIA_UPLOAD" ? "MEDIA_UPLOAD" : "DIRECT_POST";
    const isDraft = postMode === "MEDIA_UPLOAD";

    if (!body.projectId || !body.accountId) {
      return NextResponse.json(
        { error: "projectId and accountId required" },
        { status: 400 },
      );
    }
    await guardProjectId(body.projectId);
    if (!body.consentGiven) {
      return NextResponse.json(
        { error: "Consent checkbox required before posting" },
        { status: 400 },
      );
    }
    if (!isDraft && !body.privacyLevel) {
      return NextResponse.json(
        { error: "Select a privacy level (no default allowed by TikTok)" },
        { status: 400 },
      );
    }

    if (!isDraft && body.brandContent && body.privacyLevel === "SELF_ONLY") {
      return NextResponse.json(
        { error: "Branded content cannot be set to private (Only you)." },
        { status: 400 },
      );
    }

    const started = Date.now();
    logger.info("api", "POST /api/tiktok/publish", {
      projectId: body.projectId,
      accountId: body.accountId,
      postMode,
      privacy: body.privacyLevel,
      photoUrlCount: body.photoUrls?.length || 0,
      imageCount: body.images?.length || 0,
      autoAddMusic: body.autoAddMusic === true,
    });

    let photoUrls = body.photoUrls || [];
    if (!photoUrls.length && body.images?.length) {
      const buffers = body.images.map((raw, i) => {
        const b64 = raw.includes(",") ? raw.split(",")[1] : raw;
        const isJpeg = /^data:image\/jpe?g/i.test(raw);
        return {
          filename: `slide${i + 1}.${isJpeg ? "jpg" : "png"}`,
          bytes: Buffer.from(b64, "base64"),
          contentType: isJpeg ? "image/jpeg" : "image/png",
        };
      });
      photoUrls = await persistPublishImages(body.projectId, buffers);
      logger.info("api", "Persisted publish images", {
        projectId: body.projectId,
        count: photoUrls.length,
        photoUrls,
      });
    }

    if (!photoUrls.length) {
      return NextResponse.json(
        { error: "Provide images (base64) or photoUrls" },
        { status: 400 },
      );
    }

    const badUrl = photoUrls.find((u) => !/^https:\/\//i.test(u));
    if (badUrl) {
      return NextResponse.json(
        {
          error:
            "TikTok requires HTTPS image URLs on a verified domain/prefix (Developer Portal → URL properties). Localhost URLs will not work.",
          badUrl,
        },
        { status: 400 },
      );
    }

    const result = await publishPhotoCarousel({
      projectId: body.projectId,
      accountId: body.accountId,
      postId: body.postId,
      title: body.title || "Carousel",
      description: body.description || "",
      privacyLevel: body.privacyLevel,
      disableComment: Boolean(body.disableComment),
      disableDuet: body.disableDuet !== false,
      disableStitch: body.disableStitch !== false,
      autoAddMusic: body.autoAddMusic === true,
      brandOrganic: Boolean(body.brandOrganic),
      brandContent: Boolean(body.brandContent),
      photoUrls,
      consentGiven: true,
      postMode,
    });

    logger.info("api", "POST /api/tiktok/publish ok", {
      publish_id: result.publishId,
      status_code: 200,
      error_message: null,
      jobId: result.jobId,
      tiktokRequestId: result.tiktokRequestId,
      tiktokLogId: result.tiktokLogId,
      accessTokenPrefix: result.accessTokenPrefix,
      oauthUserInfo: result.oauthUserInfo,
      postMode,
      ms: Date.now() - started,
    });
    console.log(
      `[TikTok Publish] Raw response: publish_id=${result.publishId} status_code=200 postMode=${postMode}`,
    );

    return NextResponse.json({
      ok: true,
      ...result,
      photoUrls,
    });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }

    if (isTikTokApiError(err)) {
      const payload = tiktokErrorResponseBody(err);
      logger.error("api", "POST /api/tiktok/publish TikTokApiError", payload);
      return NextResponse.json(payload, {
        status: err.status >= 400 && err.status < 600 ? err.status : 502,
      });
    }

    const message = err instanceof Error ? err.message : "Publish failed";
    const stack = err instanceof Error ? err.stack : undefined;
    logger.error("api", "POST /api/tiktok/publish failed", { message, stack });

    const body: Record<string, unknown> = {
      ok: false,
      error: message,
      code: "PUBLISH_ERROR",
    };
    if (
      process.env.NODE_ENV !== "production" ||
      process.env.TIKTOK_DEBUG_ERRORS === "1"
    ) {
      if (stack) body.stack = stack;
    }
    return NextResponse.json(body, { status: 500 });
  }
}

export const POST = withApi(handlePOST, "POST src/app/api/tiktok/publish/route.ts");
