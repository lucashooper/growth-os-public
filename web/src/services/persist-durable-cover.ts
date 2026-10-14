import "server-only";

import { logger } from "@/lib/logger";
import {
  canUseSupabaseStorage,
  getAppBaseUrl,
  uploadPublicFile,
} from "@/lib/supabase/storage";
import { mkdir, writeFile } from "fs/promises";
import path from "path";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

export function isEphemeralTikTokCdn(url: string): boolean {
  if (!url.startsWith("http")) return false;
  return /tiktokcdn|byteoversea|ibyteimg|byteimg|muscdn|ttwstatic|tiktok\.com\/.*\/obj\//i.test(
    url,
  );
}

export function isDurableMediaUrl(url: string): boolean {
  if (!url.startsWith("http")) return false;
  const base = getAppBaseUrl();
  if (base && url.startsWith(base)) return true;
  if (url.includes("/api/media/pull/")) return true;
  if (url.includes("/uploads/")) return true;
  if (url.includes("supabase.co/storage/")) return true;
  return false;
}

async function downloadImageBytes(src: string): Promise<{
  bytes: Buffer;
  contentType: string;
} | null> {
  const attempts = [
    src,
    // Datacenter IPs often can't reach TikTok CDN; weserv can.
    `https://wsrv.nl/?url=${encodeURIComponent(src)}&output=jpg&n=-1`,
  ];

  for (const url of attempts) {
    try {
      const res = await fetch(url, {
        headers: {
          "User-Agent": UA,
          Accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
          Referer: "https://www.tiktok.com/",
        },
        signal: AbortSignal.timeout(10_000),
        redirect: "follow",
      });
      if (!res.ok) continue;
      const contentType = res.headers.get("content-type") || "image/jpeg";
      if (!contentType.startsWith("image/") && !url.includes("wsrv.nl")) continue;
      const bytes = Buffer.from(await res.arrayBuffer());
      if (bytes.length < 64 || bytes.length > 8_000_000) continue;
      return {
        bytes,
        contentType: contentType.startsWith("image/")
          ? contentType
          : "image/jpeg",
      };
    } catch {
      /* try next */
    }
  }
  return null;
}

/**
 * Download a TikTok (or other) cover and store a permanent URL.
 * Never returns an ephemeral tiktokcdn URL — empty string if persist fails.
 */
export async function persistDurableCover(
  accountId: string,
  postExternalId: string,
  remoteUrl: string | null | undefined,
  existingDurable?: string | null,
): Promise<string> {
  const existing = (existingDurable || "").trim();
  if (existing && isDurableMediaUrl(existing)) return existing;

  const src = (remoteUrl || "").trim();
  if (!src) return "";
  if (isDurableMediaUrl(src)) return src;

  const objectPathBase = `covers/${accountId}/${postExternalId}`;
  const file = await downloadImageBytes(src);
  if (!file) {
    logger.warn("api", "Cover persist failed — leaving empty (no ephemeral CDN)", {
      accountId,
      postExternalId,
      src: src.slice(0, 80),
    });
    return "";
  }

  const ext = file.contentType.includes("png")
    ? "png"
    : file.contentType.includes("webp")
      ? "webp"
      : "jpg";
  const objectPath = `${objectPathBase}.${ext}`;

  try {
    if (canUseSupabaseStorage()) {
      return await uploadPublicFile({
        path: objectPath,
        bytes: file.bytes,
        contentType: file.contentType,
      });
    }

    const base = (
      process.env.APP_BASE_URL ||
      process.env.NEXT_PUBLIC_APP_BASE_URL ||
      "http://localhost:3000"
    ).replace(/\/$/, "");
    const dir = path.join(
      process.cwd(),
      "public",
      "uploads",
      "covers",
      accountId,
    );
    await mkdir(dir, { recursive: true });
    const filename = `${postExternalId}.${ext}`;
    await writeFile(path.join(dir, filename), file.bytes);
    return `${base}/uploads/covers/${accountId}/${filename}`;
  } catch (err) {
    logger.warn("api", "Cover upload failed", {
      accountId,
      message: err instanceof Error ? err.message : String(err),
    });
    return "";
  }
}
