import { writeFile, mkdir } from "fs/promises";
import path from "path";
import { fail, ok } from "@/lib/api-response";
import { AuthError, guardProjectId, requireUser } from "@/lib/api-auth";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/db";
import { withApi } from "@/lib/api-route";
import {
  canUseSupabaseStorage,
  uploadPublicFile,
} from "@/lib/supabase/storage";

export const runtime = "nodejs";

async function handlePOST(req: Request) {
  const started = Date.now();
  try {
    await requireUser();
    const form = await req.formData();
    const file = form.get("file");
    if (!file || !(file instanceof File)) {
      return fail("file required", 400);
    }

    const isImage = file.type.startsWith("image/");
    const isVideo = file.type.startsWith("video/");
    if (!isImage && !isVideo) {
      return fail("Only image and video uploads are supported", 400);
    }
    const max = isVideo ? 40 * 1024 * 1024 : 12 * 1024 * 1024;
    if (file.size > max) {
      return fail(`File too large (max ${isVideo ? "40MB" : "12MB"})`, 400);
    }

    const projectId = form.get("projectId");
    const folder = String(form.get("folder") || "");
    const bytes = Buffer.from(await file.arrayBuffer());
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const filename = `${Date.now()}-${safeName}`;
    // Keep publish slides under publish/{projectId}/ so TikTok pull URLs are scoped
    const objectPath =
      folder === "publish" && typeof projectId === "string" && projectId
        ? `publish/${projectId}/${filename}`
        : typeof folder === "string" &&
            (folder.startsWith("packs/") || folder.startsWith("format-refs/"))
          ? `${folder.replace(/[^a-zA-Z0-9/_-]/g, "")}/${filename}`
          : filename;

    let url: string;
    if (canUseSupabaseStorage()) {
      // Netlify / serverless — no writable public/ directory
      // Returns {APP_BASE_URL}/api/media/pull/... when APP_BASE_URL is set
      url = await uploadPublicFile({
        path: objectPath,
        bytes,
        contentType: file.type || "application/octet-stream",
      });
    } else {
      const dir = path.join(process.cwd(), "public", "uploads");
      await mkdir(dir, { recursive: true });
      await writeFile(path.join(dir, filename), bytes);
      url = `/uploads/${filename}`;
    }

    const tagsRaw = form.get("tags");
    let tags: string[] = [];
    if (typeof tagsRaw === "string" && tagsRaw) {
      try {
        tags = JSON.parse(tagsRaw);
      } catch {
        tags = tagsRaw.split(",").map((t) => t.trim()).filter(Boolean);
      }
    }

    let asset = null;
    const skipLibrary =
      folder === "publish" || form.get("skipLibrary") === "1";
    if (typeof projectId === "string" && projectId && !skipLibrary) {
      await guardProjectId(projectId);
      asset = await prisma.libraryAsset.create({
        data: {
          projectId,
          name: file.name,
          kind: isVideo ? "video" : "image",
          folder,
          url,
          path: url,
          mime: file.type,
          size: file.size,
          tagsJson: JSON.stringify(tags),
          source: "upload",
        },
      });
    } else if (typeof projectId === "string" && projectId) {
      await guardProjectId(projectId);
    }

    logger.info("api", "Uploaded file", {
      filename: objectPath,
      size: file.size,
      type: file.type,
      assetId: asset?.id,
      storage: canUseSupabaseStorage() ? "supabase" : "local",
      url,
      ms: Date.now() - started,
    });
    return ok({
      name: file.name,
      url,
      mime: file.type,
      size: file.size,
      kind: isVideo ? "video" : "image",
      asset,
    });
  } catch (err) {
    if (err instanceof AuthError) return fail(err.message, err.status);
    const message = err instanceof Error ? err.message : String(err);
    logger.error("api", "Upload failed", { message });
    // Surface Supabase edge flakes clearly (client may retry)
    if (/edge function|502|503|504/i.test(message)) {
      return fail(
        "Image upload temporarily failed (storage edge). Please retry — this is usually transient.",
        502,
      );
    }
    return fail(err);
  }
}

export const POST = withApi(handlePOST, "POST src/app/api/upload/route.ts");
