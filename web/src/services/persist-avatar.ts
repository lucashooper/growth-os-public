import "server-only";
import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { logger } from "@/lib/logger";
import {
  canUseSupabaseStorage,
  getAppBaseUrl,
  uploadPublicFile,
} from "@/lib/supabase/storage";

function isAlreadyDurable(url: string) {
  if (!url.startsWith("http")) return true;
  const base = getAppBaseUrl();
  if (base && url.startsWith(base)) return true;
  if (url.includes("/api/media/pull/")) return true;
  if (url.includes("/uploads/")) return true;
  return false;
}

/**
 * Download a remote image (TikTok CDN, etc.) and store a durable URL.
 * `objectPathBase` is the storage key without extension, e.g. `covers/acc/videoId`.
 */
export async function persistRemoteImage(
  objectPathBase: string,
  remoteUrl: string | null | undefined,
): Promise<string> {
  const src = (remoteUrl || "").trim();
  if (!src || !src.startsWith("http") || isAlreadyDurable(src)) {
    return src;
  }

  try {
    const res = await fetch(src, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
        Accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
        Referer: "https://www.tiktok.com/",
      },
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) {
      logger.warn("api", "Remote image download failed", {
        objectPathBase,
        status: res.status,
      });
      return src;
    }
    const contentType = res.headers.get("content-type") || "image/jpeg";
    if (!contentType.startsWith("image/")) return src;
    const bytes = Buffer.from(await res.arrayBuffer());
    if (bytes.length < 64 || bytes.length > 5_000_000) return src;

    const ext = contentType.includes("png")
      ? "png"
      : contentType.includes("webp")
        ? "webp"
        : "jpg";
    const objectPath = `${objectPathBase.replace(/\.[a-z0-9]+$/i, "")}.${ext}`;

    if (canUseSupabaseStorage()) {
      return await uploadPublicFile({
        path: objectPath,
        bytes,
        contentType,
      });
    }

    const base = (
      process.env.APP_BASE_URL ||
      process.env.NEXT_PUBLIC_APP_BASE_URL ||
      "http://localhost:3000"
    ).replace(/\/$/, "");
    const filename = `${objectPathBase.replace(/[^\w/-]+/g, "_")}.${ext}`;
    const dir = path.join(process.cwd(), "public", "uploads", path.dirname(filename));
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(process.cwd(), "public", "uploads", filename), bytes);
    return `${base}/uploads/${filename}`;
  } catch (err) {
    logger.warn("api", "Remote image persist skipped", {
      objectPathBase,
      message: err instanceof Error ? err.message : String(err),
    });
    return src;
  }
}

/**
 * TikTok CDN avatars expire / block hotlinking. Download once and store a durable URL.
 */
export async function persistRemoteAvatar(
  accountId: string,
  remoteUrl: string | null | undefined,
): Promise<string> {
  return persistRemoteImage(`avatars/${accountId}`, remoteUrl);
}
