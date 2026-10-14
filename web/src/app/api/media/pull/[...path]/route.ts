import { NextResponse } from "next/server";
import {
  canUseSupabaseStorage,
  downloadPublicFile,
  isAllowedMediaPullPath,
} from "@/lib/supabase/storage";
import { withApi } from "@/lib/api-route";

export const runtime = "nodejs";

/**
 * Public media proxy for TikTok PULL_FROM_URL.
 * Verify your APP_BASE_URL host in
 * TikTok Developer Portal → URL properties, then TikTok can pull from here.
 * Must remain publicly reachable over HTTPS with no redirects.
 */
async function handleGET(
  _req: Request,
  ctx: { params: Promise<{ path?: string[] }> },
) {
  const { path: parts } = await ctx.params;
  if (!parts?.length) {
    return NextResponse.json({ error: "path required" }, { status: 400 });
  }

  const objectPath = parts.map((p) => decodeURIComponent(p)).join("/");
  if (!isAllowedMediaPullPath(objectPath)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  if (!canUseSupabaseStorage()) {
    return NextResponse.json(
      { error: "Supabase storage not configured" },
      { status: 503 },
    );
  }

  const file = await downloadPublicFile(objectPath);
  if (!file) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  return new NextResponse(new Uint8Array(file.bytes), {
    status: 200,
    headers: {
      "Content-Type": file.contentType,
      "Cache-Control": "public, max-age=3600",
      "Content-Length": String(file.bytes.length),
    },
  });
}

export const GET = withApi(handleGET, "GET src/app/api/media/pull/[...path]/route.ts");
