import { prisma } from "@/lib/db";
import { fail, ok } from "@/lib/api-response";
import { AuthError, guardProjectId } from "@/lib/api-auth";
import { logger } from "@/lib/logger";
import { withApi } from "@/lib/api-route";


export const runtime = "nodejs";

async function handleGET(req: Request) {
  try {
    const url = new URL(req.url);
    const projectId = url.searchParams.get("projectId");
    if (!projectId) return fail("projectId required", 400);
    await guardProjectId(projectId);
    const q = url.searchParams.get("q")?.toLowerCase() || "";
    const folder = url.searchParams.get("folder");
    const tag = url.searchParams.get("tag");

    const assets = await prisma.libraryAsset.findMany({
      where: {
        projectId,
        ...(folder != null && folder !== "" ? { folder } : {}),
      },
      orderBy: { createdAt: "desc" },
      include: { post: true },
    });

    const filtered = assets.filter((a) => {
      const tags = JSON.parse(a.tagsJson || "[]") as string[];
      if (tag && !tags.includes(tag)) return false;
      if (!q) return true;
      return (
        a.name.toLowerCase().includes(q) ||
        a.theme.toLowerCase().includes(q) ||
        tags.some((t) => t.toLowerCase().includes(q))
      );
    });

    const folders = [
      ...new Set(assets.map((a) => a.folder || "")),
    ].sort();

    return ok({
      assets: filtered.map((a) => ({
        ...a,
        tags: JSON.parse(a.tagsJson || "[]"),
        post: a.post
          ? {
              ...a.post,
              slides: JSON.parse(a.post.slidesJson || "[]"),
              meta: JSON.parse(a.post.metaJson || "{}"),
            }
          : null,
      })),
      folders,
    });
  } catch (err) {
    if (err instanceof AuthError) return fail(err.message, err.status);
    return fail(err);
  }
}

async function handlePOST(req: Request) {
  try {
    const body = (await req.json()) as {
      projectId?: string;
      name?: string;
      kind?: string;
      folder?: string;
      url?: string;
      path?: string;
      mime?: string;
      size?: number;
      tags?: string[];
      theme?: string;
      source?: string;
      postId?: string;
    };
    if (!body.projectId) return fail("projectId required", 400);
    await guardProjectId(body.projectId);
    if (body.kind !== "folder" && !body.url && !body.path) {
      return fail("url or path required", 400);
    }

    const asset = await prisma.libraryAsset.create({
      data: {
        projectId: body.projectId,
        name: body.name || "Untitled asset",
        kind: body.kind || "image",
        folder: body.folder || "",
        url: body.url || body.path || "",
        path: body.path || body.url || "",
        mime: body.mime || "",
        size: body.size || 0,
        tagsJson: JSON.stringify(body.tags || []),
        theme: body.theme || "",
        source: body.source || "upload",
        postId: body.postId,
      },
    });
    logger.info("db", "Created library asset", { id: asset.id });
    return ok({ asset: { ...asset, tags: body.tags || [] } }, 201);
  } catch (err) {
    if (err instanceof AuthError) return fail(err.message, err.status);
    return fail(err);
  }
}

export const GET = withApi(handleGET, "GET src/app/api/library/route.ts");

export const POST = withApi(handlePOST, "POST src/app/api/library/route.ts");
