import { NextResponse } from "next/server";
import { AuthError, guardProjectId } from "@/lib/api-auth";
import { logger } from "@/lib/logger";
import { tiktokOAuthConfigured } from "@/services/tiktok-oauth";
import { withApi } from "@/lib/api-route";
import {
  isTikTokApiError,
  tiktokErrorResponseBody,
} from "@/services/tiktok-api";
import { uploadVideoToTikTokInbox } from "@/services/tiktok-publish";

export const runtime = "nodejs";
export const maxDuration = 180;

/**
 * Upload-to-Inbox (video.upload scope).
 * POST multipart/form-data:
 *   projectId, accountId, consentGiven=true, file=<video>
 * Optional JSON: { projectId, accountId, consentGiven, videoBase64, contentType }
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

    const contentType = req.headers.get("content-type") || "";
    let projectId = "";
    let accountId = "";
    let postId: string | undefined;
    let consentGiven = false;
    let videoBytes: Buffer | null = null;
    let videoContentType = "video/mp4";
    let videoUrl = "";

    if (contentType.includes("multipart/form-data")) {
      // Netlify serverless rejects large bodies (HTTP 413). Prefer JSON + videoUrl.
      if (process.env.NETLIFY === "true" || process.env.AWS_LAMBDA_FUNCTION_NAME) {
        return NextResponse.json(
          {
            error:
              "Multipart inbox upload is blocked on Netlify (HTTP 413 risk). Upload the video via /api/upload first, then POST JSON { videoUrl }.",
            code: "USE_VIDEO_URL",
          },
          { status: 413 },
        );
      }
      const form = await req.formData();
      projectId = String(form.get("projectId") || "");
      accountId = String(form.get("accountId") || "");
      postId = form.get("postId") ? String(form.get("postId")) : undefined;
      consentGiven =
        String(form.get("consentGiven") || "").toLowerCase() === "true" ||
        form.get("consentGiven") === "1";
      videoUrl = String(form.get("videoUrl") || "");
      const file = form.get("file");
      if (file && typeof file !== "string" && "arrayBuffer" in file) {
        videoBytes = Buffer.from(await file.arrayBuffer());
        videoContentType = file.type || "video/mp4";
      }
    } else {
      const body = (await req.json()) as {
        projectId?: string;
        accountId?: string;
        postId?: string;
        consentGiven?: boolean;
        videoBase64?: string;
        contentType?: string;
        videoUrl?: string;
      };
      projectId = body.projectId || "";
      accountId = body.accountId || "";
      postId = body.postId;
      consentGiven = Boolean(body.consentGiven);
      videoContentType = body.contentType || "video/mp4";
      videoUrl = body.videoUrl || "";
      if (body.videoBase64) {
        const b64 = body.videoBase64.includes(",")
          ? body.videoBase64.split(",")[1]
          : body.videoBase64;
        videoBytes = Buffer.from(b64, "base64");
      }
    }

    if (!projectId || !accountId) {
      return NextResponse.json(
        { error: "projectId and accountId required" },
        { status: 400 },
      );
    }
    await guardProjectId(projectId);
    if (!consentGiven) {
      return NextResponse.json(
        { error: "Consent checkbox required before inbox upload" },
        { status: 400 },
      );
    }

    if (videoBytes && videoBytes.length > 50 * 1024 * 1024) {
      return NextResponse.json(
        { error: "Video must be under 50MB for inbox upload" },
        { status: 400 },
      );
    }

    // Keep raw bytes for FILE_UPLOAD → binary PUT to upload_url.
    // Do NOT convert to PULL_FROM_URL (that yields v_inbox_url~ and often never notifies).
    if (!videoUrl && !videoBytes?.length) {
      return NextResponse.json(
        { error: "Video file or videoUrl required" },
        { status: 400 },
      );
    }

    logger.info("api", "POST /api/tiktok/inbox", {
      projectId,
      accountId,
      bytes: videoBytes?.length || 0,
      videoUrl: videoUrl || null,
      contentType: videoContentType,
      transfer: videoBytes?.length ? "FILE_UPLOAD" : "via_url_then_file",
    });

    const result = await uploadVideoToTikTokInbox({
      projectId,
      accountId,
      postId,
      videoBytes: videoBytes || undefined,
      contentType: videoContentType,
      videoUrl: videoBytes?.length ? undefined : videoUrl || undefined,
      consentGiven: true,
    });

    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    if (isTikTokApiError(err)) {
      const payload = tiktokErrorResponseBody(err);
      logger.error("api", "POST /api/tiktok/inbox TikTokApiError", payload);
      return NextResponse.json(payload, {
        status: err.status >= 400 && err.status < 600 ? err.status : 502,
      });
    }
    const message = err instanceof Error ? err.message : "Inbox upload failed";
    logger.error("api", "POST /api/tiktok/inbox failed", { message });
    return NextResponse.json(
      { ok: false, error: message, code: "INBOX_UPLOAD_ERROR" },
      { status: 500 },
    );
  }
}

export const POST = withApi(handlePOST, "POST src/app/api/tiktok/inbox/route.ts");
