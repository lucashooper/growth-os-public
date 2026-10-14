import "server-only";
import { writeFile, mkdir } from "fs/promises";
import path from "path";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import { createPerfTimer } from "@/lib/perf";
import {
  accountCanPublish,
  accountCanUploadInbox,
  fetchTikTokUser,
  getValidAccessToken,
} from "@/services/tiktok-oauth";
import {
  maskAccessToken,
  tiktokFetchJson,
  TikTokApiError,
  type TikTokOAuthUserInfo,
} from "@/services/tiktok-api";
import {
  canUseSupabaseStorage,
  uploadPublicFile,
} from "@/lib/supabase/storage";

const CREATOR_INFO =
  "https://open.tiktokapis.com/v2/post/publish/creator_info/query/";
const CONTENT_INIT = "https://open.tiktokapis.com/v2/post/publish/content/init/";
const INBOX_VIDEO_INIT =
  "https://open.tiktokapis.com/v2/post/publish/inbox/video/init/";
const STATUS_FETCH = "https://open.tiktokapis.com/v2/post/publish/status/fetch/";

export type CreatorInfo = {
  creator_avatar_url?: string;
  creator_username?: string;
  creator_nickname?: string;
  privacy_level_options?: string[];
  comment_disabled?: boolean;
  duet_disabled?: boolean;
  stitch_disabled?: boolean;
  max_video_post_duration_sec?: number;
};

async function resolveOAuthUserInfo(
  accessToken: string,
): Promise<TikTokOAuthUserInfo | null> {
  try {
    const user = await fetchTikTokUser(accessToken);
    if (!user) return null;
    return {
      open_id: user.open_id,
      avatar_url: user.avatar_url,
      display_name: user.display_name,
      username: user.username,
    };
  } catch (err) {
    logger.warn("api", "OAuth user.info failed (continuing publish)", {
      message: err instanceof Error ? err.message : String(err),
      accessTokenPrefix: maskAccessToken(accessToken),
    });
    return null;
  }
}

export type ComposerCreatorInfo = {
  creator_avatar_url?: string;
  creator_username?: string;
  creator_nickname?: string;
  privacy_level_options?: string[];
  comment_disabled?: boolean;
  duet_disabled?: boolean;
  stitch_disabled?: boolean;
  max_video_post_duration_sec?: number;
  canPost: boolean;
  postingBlockedCode?: string | null;
  postingBlockedReason?: string | null;
};

const POSTING_BLOCKED_CODES = new Set([
  "spam_risk_too_many_posts",
  "spam_risk_user_banned_from_posting",
  "reached_active_user_cap",
]);

export async function queryCreatorInfo(
  accessToken: string,
  oauthUserInfo?: TikTokOAuthUserInfo | null,
): Promise<CreatorInfo> {
  const enriched = await queryCreatorInfoForComposer(accessToken, oauthUserInfo);
  return enriched;
}

/** Fetch creator_info for composer UI — surfaces posting caps without throwing. */
export async function queryCreatorInfoForComposer(
  accessToken: string,
  oauthUserInfo?: TikTokOAuthUserInfo | null,
): Promise<ComposerCreatorInfo> {
  const result = await tiktokFetchJson<{
    data?: CreatorInfo;
    error?: { code?: string; message?: string; log_id?: string };
  }>({
    step: "creator_info/query",
    method: "POST",
    url: CREATOR_INFO,
    accessToken,
    body: {},
    oauthUserInfo: oauthUserInfo ?? null,
    requireOkCode: false,
  });

  const code = result.diagnostics.error_code;
  const data = result.parsed?.data || {};
  const blocked = Boolean(code && code !== "ok" && POSTING_BLOCKED_CODES.has(code));

  if (code && code !== "ok" && !blocked) {
    throw new TikTokApiError(
      result.diagnostics.error_message || `creator_info failed (${code})`,
      result.diagnostics,
      result.httpStatus,
    );
  }

  return {
    ...data,
    canPost: !blocked,
    postingBlockedCode: blocked ? code : null,
    postingBlockedReason: blocked
      ? result.diagnostics.error_message || code
      : null,
  };
}

/**
 * Persist image buffers as public HTTPS URLs for TikTok PULL_FROM_URL.
 * Uses Supabase Storage on serverless; local disk in pure file-dev mode.
 * APP_BASE_URL / storage domain must be allowed for photo pull in TikTok portal.
 */
export async function persistPublishImages(
  projectId: string,
  images: { filename: string; bytes: Buffer; contentType?: string }[],
): Promise<string[]> {
  const uploads = images.map(async (img, i) => {
    const safe = img.filename.replace(/[^a-zA-Z0-9._-]/g, "_");
    const name = `${Date.now()}-${i}-${safe}`;
    const objectPath = `publish/${projectId}/${name}`;
    const contentType = img.contentType || "image/jpeg";

    if (canUseSupabaseStorage()) {
      return uploadPublicFile({
        path: objectPath,
        bytes: img.bytes,
        contentType,
      });
    }
    const base = (process.env.APP_BASE_URL || "http://localhost:3000").replace(
      /\/$/,
      "",
    );
    const dir = path.join(
      process.cwd(),
      "public",
      "uploads",
      "publish",
      projectId,
    );
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, name), img.bytes);
    return `${base}/uploads/publish/${projectId}/${name}`;
  });
  return Promise.all(uploads);
}

export type PublishPhotoInput = {
  projectId: string;
  accountId: string;
  postId?: string;
  title: string;
  description: string;
  /** Required for DIRECT_POST; ignored for MEDIA_UPLOAD drafts */
  privacyLevel?: string;
  disableComment: boolean;
  disableDuet?: boolean;
  disableStitch?: boolean;
  autoAddMusic: boolean;
  brandOrganic: boolean;
  brandContent: boolean;
  /** Public HTTPS URLs on a TikTok-verified domain */
  photoUrls: string[];
  /** User expressly consented in UI */
  consentGiven: boolean;
  /**
   * DIRECT_POST = publish now (video.publish)
   * MEDIA_UPLOAD = save as draft / inbox (video.upload)
   */
  postMode?: "DIRECT_POST" | "MEDIA_UPLOAD";
};

export async function publishPhotoCarousel(input: PublishPhotoInput) {
  if (!input.consentGiven) {
    throw new Error("User consent is required before publishing to TikTok");
  }
  const timer = createPerfTimer(
    input.postMode === "MEDIA_UPLOAD"
      ? "tiktok-publish-server:draft"
      : "tiktok-publish-server:direct",
  );
  const postMode = input.postMode || "DIRECT_POST";
  const isDraft = postMode === "MEDIA_UPLOAD";

  if (!isDraft && !input.privacyLevel) {
    throw new Error("Privacy level must be selected manually (no default)");
  }
  if (!input.photoUrls.length) {
    throw new Error("At least one photo URL is required");
  }
  if (input.photoUrls.length > 35) {
    throw new Error("TikTok allows at most 35 photos per carousel");
  }

  const account = await prisma.connectedAccount.findUnique({
    where: { id: input.accountId },
  });
  if (!account || account.projectId !== input.projectId) {
    throw new Error("Account not found");
  }
  if (isDraft) {
    if (!accountCanUploadInbox(account)) {
      throw new Error(
        "This account is missing video.upload. Reconnect TikTok and grant draft upload.",
      );
    }
  } else if (!accountCanPublish(account)) {
    throw new Error(
      "This account is not verified for publishing. Connect with TikTok (video.publish scope).",
    );
  }

  // Use the cached token unless it expires in <60s — forceRefresh adds a
  // full OAuth round-trip on every draft even when the token is valid.
  const accessToken = await getValidAccessToken(input.accountId);
  timer.mark("token");
  const accessTokenPrefix = maskAccessToken(accessToken);

  let oauthUserInfo = null;
  let creator: Awaited<ReturnType<typeof queryCreatorInfoForComposer>> = {
    creator_username: account.username || undefined,
    creator_nickname: account.nickname || undefined,
    canPost: true,
    privacy_level_options: ["PUBLIC_TO_EVERYONE"],
  };

  if (!isDraft) {
    const [user, info] = await Promise.all([
      resolveOAuthUserInfo(accessToken),
      queryCreatorInfoForComposer(accessToken, null),
    ]);
    oauthUserInfo = user;
    creator = info;
    timer.mark("creator");
  }

  logger.info("api", "publishPhotoCarousel:start", {
    accountId: input.accountId,
    projectId: input.projectId,
    postMode,
    privacy: input.privacyLevel,
    photos: input.photoUrls.length,
    autoAddMusic: input.autoAddMusic,
    accessTokenPrefix,
    oauthUserInfo,
    urls: input.photoUrls,
    skippedCreatorQuery: isDraft,
  });

  if (!isDraft && !creator.canPost) {
    throw new Error(
      "Your TikTok account cannot make new posts right now. Please try again later.",
    );
  }

  if (!isDraft) {
    const options = creator.privacy_level_options || [];
    if (options.length && input.privacyLevel && !options.includes(input.privacyLevel)) {
      throw new Error(
        `Privacy level must be one of: ${options.join(", ")}.`,
      );
    }
  }

  const job = await prisma.publishJob.create({
    data: {
      projectId: input.projectId,
      accountId: input.accountId,
      postId: input.postId,
      platform: "tiktok",
      status: "publishing",
      title: input.title.slice(0, 90),
      caption: input.description.slice(0, 4000),
      privacyLevel: isDraft ? "MEDIA_UPLOAD_DRAFT" : input.privacyLevel || "",
      imageUrlsJson: JSON.stringify(input.photoUrls),
      metaJson: JSON.stringify({
        postMode,
        creatorUsername: creator.creator_username,
        creatorNickname: creator.creator_nickname,
        oauthUserInfo,
        accessTokenPrefix,
      }),
    },
  });

  try {
    const postInfo: Record<string, unknown> = {
      title: input.title.slice(0, 90),
      description: input.description.slice(0, 4000),
    };
    if (!isDraft) {
      postInfo.privacy_level = input.privacyLevel;
      postInfo.disable_comment =
        input.disableComment || Boolean(creator.comment_disabled);
      postInfo.disable_duet =
        input.disableDuet ?? Boolean(creator.duet_disabled);
      postInfo.disable_stitch =
        input.disableStitch ?? Boolean(creator.stitch_disabled);
      postInfo.auto_add_music = input.autoAddMusic;
      postInfo.brand_organic_toggle = input.brandOrganic;
      postInfo.brand_content_toggle = input.brandContent;
    }

    const body = {
      post_info: postInfo,
      source_info: {
        source: "PULL_FROM_URL",
        photo_cover_index: 0,
        photo_images: input.photoUrls,
      },
      post_mode: postMode,
      media_type: "PHOTO",
    };

    const controller = new AbortController();
    const abortTimer = setTimeout(() => controller.abort(), 55_000);

    let result: Awaited<
      ReturnType<
        typeof tiktokFetchJson<{
          data?: { publish_id?: string };
          error?: { code?: string; message?: string; log_id?: string };
        }>
      >
    >;
    try {
      result = await tiktokFetchJson<{
        data?: { publish_id?: string };
        error?: { code?: string; message?: string; log_id?: string };
      }>({
        step: "content/init",
        method: "POST",
        url: CONTENT_INIT,
        accessToken,
        body,
        oauthUserInfo,
        signal: controller.signal,
        requireOkCode: true,
      });
    } finally {
      clearTimeout(abortTimer);
    }

    const publishId =
      result.parsed &&
      typeof result.parsed === "object" &&
      "data" in result.parsed
        ? (result.parsed as { data?: { publish_id?: string } }).data?.publish_id
        : undefined;
    if (!publishId) {
      const diagnostics = {
        ...result.diagnostics,
        error_code: result.diagnostics.error_code || "missing_publish_id",
        error_message:
          result.diagnostics.error_message ||
          "TikTok returned ok but no publish_id",
      };
      throw new TikTokApiError(
        diagnostics.error_message || "TikTok returned no publish_id",
        diagnostics,
        502,
      );
    }

    console.log(
      `[TikTok Publish] Raw response:`,
      JSON.stringify({
        publish_id: publishId,
        status_code: result.diagnostics.httpStatus,
        error_code: result.diagnostics.error_code,
        error_message: result.diagnostics.error_message,
        log_id: result.diagnostics.log_id,
        postMode,
      }),
    );
    timer.mark("content/init");
    logger.info("api", "[TikTok Publish] content/init response", {
      publish_id: publishId,
      status_code: result.diagnostics.httpStatus,
      error_code: result.diagnostics.error_code,
      error_message: result.diagnostics.error_message,
      log_id: result.diagnostics.log_id,
      request_id: result.diagnostics.request_id,
      postMode,
    });

    await prisma.publishJob.update({
      where: { id: job.id },
      data: {
        status: "submitted",
        publishId,
        metaJson: JSON.stringify({
          ...JSON.parse(job.metaJson || "{}"),
          contentInit: {
            error_code: result.diagnostics.error_code,
            log_id: result.diagnostics.log_id,
            request_id: result.diagnostics.request_id,
            httpStatus: result.diagnostics.httpStatus,
          },
        }),
      },
    });

    if (input.postId && !isDraft) {
      await prisma.post.update({
        where: { id: input.postId },
        data: { status: "published", publishedAt: new Date() },
      });
    }

    timer.end({ publishId, photos: input.photoUrls.length });
    return {
      jobId: job.id,
      publishId,
      postMode,
      creator,
      oauthUserInfo,
      accessTokenPrefix,
      statusPeek: null,
      tiktokRequestId: result.diagnostics.request_id,
      tiktokLogId: result.diagnostics.log_id,
      note: isDraft
        ? "Draft sent to TikTok Inbox. Open the phone notification and finish in the TikTok app."
        : "TikTok may take a few minutes to process the post.",
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Publish failed";
    const metaExtra =
      err instanceof TikTokApiError
        ? {
            tiktok: err.toJSON(),
          }
        : { message };

    logger.error("api", "publishPhotoCarousel:error", {
      message,
      jobId: job.id,
      accessTokenPrefix,
      oauthUserInfo,
      ...(err instanceof TikTokApiError ? err.toJSON() : {}),
    });

    await prisma.publishJob
      .update({
        where: { id: job.id },
        data: {
          status: "failed",
          error: message.slice(0, 2000),
          metaJson: JSON.stringify({
            ...JSON.parse(job.metaJson || "{}"),
            ...metaExtra,
          }),
        },
      })
      .catch(() => undefined);
    timer.fail("publish", err);
    throw err;
  }
}

export async function uploadVideoToTikTokInbox(input: {
  projectId: string;
  accountId: string;
  postId?: string;
  /** Raw video bytes (mp4 / webm / mov) — used for FILE_UPLOAD */
  videoBytes?: Buffer;
  contentType?: string;
  /** Public HTTPS URL on a TikTok-verified domain — used for PULL_FROM_URL */
  videoUrl?: string;
  consentGiven: boolean;
}) {
  if (!input.consentGiven) {
    throw new Error("User consent is required before uploading to TikTok Inbox");
  }
  if (!input.videoBytes?.length && !input.videoUrl?.startsWith("https://")) {
    throw new Error("Video file or HTTPS videoUrl is required for inbox upload");
  }

  const account = await prisma.connectedAccount.findUnique({
    where: { id: input.accountId },
  });
  if (!account || account.projectId !== input.projectId) {
    throw new Error("Account not found");
  }
  if (!accountCanUploadInbox(account)) {
    throw new Error(
      "This account is missing video.upload. Reconnect TikTok and grant Upload to Inbox.",
    );
  }

  const accessToken = await getValidAccessToken(input.accountId, {
    forceRefresh: true,
  });
  const accessTokenPrefix = maskAccessToken(accessToken);
  const oauthUserInfo = await resolveOAuthUserInfo(accessToken);

  // Prefer FILE_UPLOAD with raw bytes. If only a hosted URL is provided, download
  // it ourselves — never leave TikTok on PULL_FROM_URL for inbox (v_inbox_url~).
  let videoBytes = input.videoBytes;
  let contentType = (input.contentType || "video/mp4").includes("webm")
    ? "video/webm"
    : (input.contentType || "").includes("quicktime")
      ? "video/quicktime"
      : "video/mp4";

  if ((!videoBytes || !videoBytes.length) && input.videoUrl?.startsWith("https://")) {
    logger.info("api", "uploadVideoToTikTokInbox:fetching hosted video", {
      videoUrl: input.videoUrl,
    });
    const pulled = await fetch(input.videoUrl, {
      signal: AbortSignal.timeout(45_000),
    });
    if (!pulled.ok) {
      throw new Error(
        `Could not fetch hosted video for inbox upload (HTTP ${pulled.status})`,
      );
    }
    videoBytes = Buffer.from(await pulled.arrayBuffer());
    const ct = pulled.headers.get("content-type");
    if (ct?.startsWith("video/")) contentType = ct.split(";")[0]!.trim();
  }

  if (!videoBytes?.length) {
    throw new Error("Video file or HTTPS videoUrl is required for inbox upload");
  }

  const videoSize = videoBytes.length;
  if (videoSize < 1024) {
    throw new Error("Encoded video is too small — re-encode and try again");
  }

  logger.info("api", "uploadVideoToTikTokInbox:start", {
    accountId: input.accountId,
    projectId: input.projectId,
    mode: "FILE_UPLOAD",
    videoSize,
    videoUrl: input.videoUrl,
    contentType,
    accessTokenPrefix,
    oauthUserInfo,
  });

  const job = await prisma.publishJob.create({
    data: {
      projectId: input.projectId,
      accountId: input.accountId,
      postId: input.postId,
      platform: "tiktok",
      status: "publishing",
      title: "Inbox draft",
      caption: "",
      privacyLevel: "INBOX_DRAFT",
      imageUrlsJson: JSON.stringify(input.videoUrl ? [input.videoUrl] : []),
      metaJson: JSON.stringify({
        mode: "MEDIA_UPLOAD_INBOX",
        endpoint: INBOX_VIDEO_INIT,
        transfer: "FILE_UPLOAD",
        videoSize,
        contentType,
        videoUrl: input.videoUrl,
        oauthUserInfo,
        accessTokenPrefix,
      }),
    },
  });

  try {
    const initResult = await tiktokFetchJson<{
      data?: { publish_id?: string; upload_url?: string };
      error?: { code?: string; message?: string; log_id?: string };
    }>({
      step: "inbox/video/init",
      method: "POST",
      url: INBOX_VIDEO_INIT,
      accessToken,
      body: {
        source_info: {
          source: "FILE_UPLOAD",
          video_size: videoSize,
          chunk_size: videoSize,
          total_chunk_count: 1,
        },
      },
      oauthUserInfo,
      requireOkCode: true,
    });

    const publishId = initResult.parsed?.data?.publish_id;
    const uploadUrl = initResult.parsed?.data?.upload_url;
    if (!publishId || !uploadUrl) {
      throw new TikTokApiError(
        "TikTok inbox init returned no publish_id/upload_url",
        {
          ...initResult.diagnostics,
          error_code:
            initResult.diagnostics.error_code || "missing_upload_url",
          error_message:
            initResult.diagnostics.error_message ||
            "TikTok inbox init returned no publish_id/upload_url",
        },
        502,
      );
    }

    if (!publishId.startsWith("v_inbox_file")) {
      logger.warn("api", "Expected v_inbox_file~ publish_id for FILE_UPLOAD", {
        publishId,
      });
    }

    // Secondary binary PUT — required before TikTok sends the mobile notification
    logger.info("api", "uploadVideoToTikTokInbox:PUT start", {
      publishId,
      uploadUrlHost: (() => {
        try {
          return new URL(uploadUrl).host;
        } catch {
          return "(invalid)";
        }
      })(),
      videoSize,
      contentType,
      contentRange: `bytes 0-${videoSize - 1}/${videoSize}`,
    });

    const putRes = await fetch(uploadUrl, {
      method: "PUT",
      headers: {
        "Content-Type": contentType,
        "Content-Length": String(videoSize),
        "Content-Range": `bytes 0-${videoSize - 1}/${videoSize}`,
      },
      // Uint8Array body — do not omit this step; init alone never notifies the user
      body: new Uint8Array(videoBytes),
      signal: AbortSignal.timeout(90_000),
    });
    const putText = await putRes.text().catch(() => "");
    logger.info("api", "uploadVideoToTikTokInbox:PUT done", {
      publishId,
      httpStatus: putRes.status,
      ok: putRes.ok,
      bodyPreview: putText.slice(0, 400),
    });
    if (!putRes.ok) {
      throw new Error(
        `TikTok binary PUT to upload_url failed HTTP ${putRes.status}: ${putText.slice(0, 300)}`,
      );
    }

    // Don't block the user on PROCESSING_UPLOAD — TikTok finishes inbox
    // delivery after we return. One immediate peek is enough for logs.
    let statusPeek: unknown = null;
    let statusValue = "";
    let failReason = "";
    try {
      const statusResult = await tiktokFetchJson<{
        data?: {
          status?: string;
          fail_reason?: string;
          publicaly_available_post_id?: unknown;
        };
        error?: { code?: string; message?: string; log_id?: string };
      }>({
        step: "status/fetch",
        method: "POST",
        url: STATUS_FETCH,
        accessToken,
        body: { publish_id: publishId },
        oauthUserInfo,
        requireOkCode: false,
      });
      statusPeek = statusResult.parsed;
      statusValue = String(statusResult.parsed?.data?.status || "");
      failReason = String(statusResult.parsed?.data?.fail_reason || "");
      logger.info("api", "TikTok inbox status peek", {
        publishId,
        status: statusValue || "(empty)",
        fail_reason: failReason || "",
        error_code: statusResult.diagnostics.error_code,
        log_id: statusResult.diagnostics.log_id,
      });
    } catch (peekErr) {
      logger.warn("api", "TikTok inbox status peek failed", {
        publishId,
        err: peekErr instanceof Error ? peekErr.message : String(peekErr),
      });
    }

    if (statusValue === "FAILED") {
      throw new Error(
        `TikTok rejected the draft upload (fail_reason=${failReason || "FAILED"}). Videos must be 23–60 FPS, ≥3s, and WebM/MP4.`,
      );
    }

    await prisma.publishJob.update({
      where: { id: job.id },
      data: {
        status: "submitted",
        publishId,
        metaJson: JSON.stringify({
          ...JSON.parse(job.metaJson || "{}"),
          putHttpStatus: putRes.status,
          inboxInit: {
            error_code: initResult.diagnostics.error_code,
            log_id: initResult.diagnostics.log_id,
            request_id: initResult.diagnostics.request_id,
            httpStatus: initResult.diagnostics.httpStatus,
          },
          statusPeek,
          status: statusValue,
          failReason,
        }),
      },
    });

    if (input.postId) {
      await prisma.post.update({
        where: { id: input.postId },
        data: { status: "published", publishedAt: new Date() },
      });
    }

    return {
      jobId: job.id,
      publishId,
      mode: "inbox" as const,
      putHttpStatus: putRes.status,
      status: statusValue || "PROCESSING_UPLOAD",
      failReason: failReason || undefined,
      oauthUserInfo,
      accessTokenPrefix,
      tiktokRequestId: initResult.diagnostics.request_id,
      tiktokLogId: initResult.diagnostics.log_id,
      statusPeek,
      note:
        statusValue === "SEND_TO_USER_INBOX"
          ? "TikTok status=SEND_TO_USER_INBOX — open the TikTok mobile app Inbox notification."
          : `Binary PUT OK (HTTP ${putRes.status}). Latest status=${statusValue || "PROCESSING_UPLOAD"}. Check phone Inbox shortly.`,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Inbox upload failed";
    const metaExtra =
      err instanceof TikTokApiError ? { tiktok: err.toJSON() } : { message };

    logger.error("api", "uploadVideoToTikTokInbox:error", {
      message,
      jobId: job.id,
      accessTokenPrefix,
      oauthUserInfo,
      ...(err instanceof TikTokApiError ? err.toJSON() : {}),
    });

    await prisma.publishJob
      .update({
        where: { id: job.id },
        data: {
          status: "failed",
          error: message.slice(0, 2000),
          metaJson: JSON.stringify({
            ...JSON.parse(job.metaJson || "{}"),
            ...metaExtra,
          }),
        },
      })
      .catch(() => undefined);
    throw err;
  }
}

export async function fetchPublishStatus(accountId: string, publishId: string) {
  const accessToken = await getValidAccessToken(accountId);
  const oauthUserInfo = await resolveOAuthUserInfo(accessToken);
  const result = await tiktokFetchJson({
    step: "status/fetch",
    method: "POST",
    url: STATUS_FETCH,
    accessToken,
    body: { publish_id: publishId },
    oauthUserInfo,
    requireOkCode: false,
  });
  return result.parsed;
}

export { TikTokApiError, isTikTokApiError } from "@/services/tiktok-api";
