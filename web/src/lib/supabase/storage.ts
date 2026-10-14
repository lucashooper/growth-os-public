import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const BUCKET =
  process.env.SUPABASE_COVERS_BUCKET?.trim() ||
  process.env.SUPABASE_STORAGE_BUCKET?.trim() ||
  "uploads";

export function canUseSupabaseStorage() {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() &&
      process.env.SUPABASE_SERVICE_ROLE_KEY?.trim(),
  );
}

export function getAppBaseUrl() {
  return (
    process.env.APP_BASE_URL ||
    process.env.NEXT_PUBLIC_APP_BASE_URL ||
    ""
  ).replace(/\/$/, "");
}

function adminClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/**
 * Paths that may be served via the public /api/media/pull proxy (TikTok + in-app CDN).
 */
export function isAllowedMediaPullPath(objectPath: string): boolean {
  if (!objectPath || objectPath.includes("..")) return false;
  return (
    objectPath.startsWith("publish/") ||
    objectPath.startsWith("avatars/") ||
    objectPath.startsWith("covers/") ||
    objectPath.startsWith("packs/") ||
    objectPath.startsWith("format-refs/") ||
    /^\d{10,}-/.test(objectPath)
  );
}

/**
 * Public HTTPS URL TikTok can PULL_FROM_URL.
 * Prefer APP_BASE_URL so you can verify your own domain in TikTok URL properties
 * (you cannot verify *.supabase.co via DNS).
 */
export function toTikTokPullUrl(objectPath: string, supabasePublicUrl: string): string {
  const base = getAppBaseUrl();
  if (base.startsWith("https://")) {
    const encoded = objectPath
      .split("/")
      .filter(Boolean)
      .map((s) => encodeURIComponent(s))
      .join("/");
    return `${base}/api/media/pull/${encoded}`;
  }
  return supabasePublicUrl;
}

/**
 * Upload bytes to public Supabase Storage (bucket: uploads).
 * Returns a pull URL on APP_BASE_URL when configured (required for TikTok).
 * Retries transient Supabase edge / network failures.
 */
export async function uploadPublicFile(opts: {
  path: string;
  bytes: Buffer;
  contentType: string;
}): Promise<string> {
  const supabase = adminClient();
  let lastError: Error | null = null;
  for (let attempt = 1; attempt <= 3; attempt++) {
    const { error } = await supabase.storage.from(BUCKET).upload(opts.path, opts.bytes, {
      contentType: opts.contentType,
      upsert: true,
    });
    if (!error) {
      const { data } = supabase.storage.from(BUCKET).getPublicUrl(opts.path);
      return toTikTokPullUrl(opts.path, data.publicUrl);
    }
    lastError = new Error(error.message);
    const transient =
      /edge function|502|503|504|timeout|fetch failed|ECONNRESET|network/i.test(
        error.message,
      );
    if (!transient || attempt === 3) break;
    await new Promise((r) => setTimeout(r, 250 * attempt * attempt));
  }
  throw new Error(
    `Storage upload failed: ${lastError?.message || "unknown error"}`,
  );
}

/** Stream a stored object for TikTok PULL_FROM_URL (must stay public, no redirects). */
export async function downloadPublicFile(objectPath: string): Promise<{
  bytes: Buffer;
  contentType: string;
} | null> {
  const supabase = adminClient();
  const { data, error } = await supabase.storage.from(BUCKET).download(objectPath);
  if (error || !data) return null;
  const bytes = Buffer.from(await data.arrayBuffer());
  const contentType = data.type || "application/octet-stream";
  return { bytes, contentType };
}

export { BUCKET as UPLOADS_BUCKET };
