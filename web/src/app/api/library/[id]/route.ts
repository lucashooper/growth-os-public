import { prisma } from "@/lib/db";
import { fail, ok } from "@/lib/api-response";
import { AuthError, guardProjectId } from "@/lib/api-auth";
import { withApi } from "@/lib/api-route";


export const runtime = "nodejs";

async function handlePATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const existing = await prisma.libraryAsset.findUnique({ where: { id } });
    if (!existing) return fail("Asset not found", 404);
    await guardProjectId(existing.projectId);

    const body = (await req.json()) as {
      name?: string;
      folder?: string;
      tags?: string[];
      theme?: string;
    };
    const asset = await prisma.libraryAsset.update({
      where: { id },
      data: {
        ...(body.name != null ? { name: body.name } : {}),
        ...(body.folder != null ? { folder: body.folder } : {}),
        ...(body.theme != null ? { theme: body.theme } : {}),
        ...(body.tags != null ? { tagsJson: JSON.stringify(body.tags) } : {}),
      },
    });
    return ok({ asset: { ...asset, tags: JSON.parse(asset.tagsJson || "[]") } });
  } catch (err) {
    if (err instanceof AuthError) return fail(err.message, err.status);
    return fail(err);
  }
}

async function handleDELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const existing = await prisma.libraryAsset.findUnique({ where: { id } });
    if (!existing) return fail("Asset not found", 404);
    await guardProjectId(existing.projectId);

    await prisma.libraryAsset.delete({ where: { id } });
    return ok({ deleted: true });
  } catch (err) {
    if (err instanceof AuthError) return fail(err.message, err.status);
    return fail(err);
  }
}

export const PATCH = withApi(handlePATCH, "PATCH src/app/api/library/[id]/route.ts");

export const DELETE = withApi(handleDELETE, "DELETE src/app/api/library/[id]/route.ts");
