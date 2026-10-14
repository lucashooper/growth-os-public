import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { AuthError, guardProjectId } from "@/lib/api-auth";
import { logger } from "@/lib/logger";
import { ensureImagePackSchema, serializePack } from "@/services/image-packs";
import { withApi } from "@/lib/api-route";


export const runtime = "nodejs";

async function handleGET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await ensureImagePackSchema();
    const { id } = await params;
    const pack = await prisma.imagePack.findUnique({
      where: { id },
      include: { assets: { orderBy: { sortOrder: "asc" } } },
    });
    if (!pack) return NextResponse.json({ error: "Not found" }, { status: 404 });
    await guardProjectId(pack.projectId);
    return NextResponse.json({ pack: serializePack(pack) });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    const message = err instanceof Error ? err.message : "Failed to load pack";
    logger.error("api", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

async function handlePATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await ensureImagePackSchema();
    const { id } = await params;
    const body = (await req.json()) as {
      name?: string;
      description?: string;
      orderMode?: string;
      /** Reorder asset ids */
      assetOrder?: string[];
      /** Add assets */
      addAssets?: {
        label?: string;
        url: string;
        kind?: string;
        path?: string;
        tags?: string[];
        description?: string;
        includedInSequence?: boolean;
      }[];
      removeAssetIds?: string[];
      /** Patch individual assets (kind, label, tags, description) */
      updateAssets?: {
        id: string;
        kind?: string;
        label?: string;
        tags?: string[];
        description?: string;
        includedInSequence?: boolean;
      }[];
    };

    const pack = await prisma.imagePack.findUnique({ where: { id } });
    if (!pack) return NextResponse.json({ error: "Not found" }, { status: 404 });
    await guardProjectId(pack.projectId);

    if (body.name != null || body.description != null || body.orderMode != null) {
      await prisma.imagePack.update({
        where: { id },
        data: {
          ...(body.name != null ? { name: body.name } : {}),
          ...(body.description != null ? { description: body.description } : {}),
          ...(body.orderMode != null ? { orderMode: body.orderMode } : {}),
        },
      });
    }

    if (body.removeAssetIds?.length) {
      await prisma.imagePackAsset.deleteMany({
        where: { id: { in: body.removeAssetIds }, packId: id },
      });
    }

    if (body.addAssets?.length) {
      const max = await prisma.imagePackAsset.aggregate({
        where: { packId: id },
        _max: { sortOrder: true },
      });
      let order = (max._max.sortOrder ?? -1) + 1;
      const rows = body.addAssets.map((a) => ({
        packId: id,
        label: a.label || "Image",
        url: a.url,
        path: a.path || "",
        kind: a.kind || "background",
        description: a.description || "",
        tagsJson: JSON.stringify(a.tags || []),
        includedInSequence: a.includedInSequence !== false,
        sortOrder: order++,
      }));
      try {
        await prisma.imagePackAsset.createMany({ data: rows });
      } catch (createErr) {
        // Older Prisma clients may lack newer columns until regenerate
        const msg =
          createErr instanceof Error ? createErr.message : String(createErr);
        if (!/Unknown argument|Unknown field/i.test(msg)) {
          throw createErr;
        }
        await prisma.imagePackAsset.createMany({
          data: rows.map(
            ({ description: _d, includedInSequence: _i, ...rest }) => rest,
          ),
        });
      }
    }

    if (body.assetOrder?.length) {
      await Promise.all(
        body.assetOrder.map((assetId, i) =>
          prisma.imagePackAsset.updateMany({
            where: { id: assetId, packId: id },
            data: { sortOrder: i },
          }),
        ),
      );
    }

    if (body.updateAssets?.length) {
      await Promise.all(
        body.updateAssets.map((a) =>
          prisma.imagePackAsset.updateMany({
            where: { id: a.id, packId: id },
            data: {
              ...(a.kind != null ? { kind: a.kind } : {}),
              ...(a.label != null ? { label: a.label } : {}),
              ...(a.description != null ? { description: a.description } : {}),
              ...(a.includedInSequence != null
                ? { includedInSequence: a.includedInSequence }
                : {}),
              ...(a.tags != null
                ? { tagsJson: JSON.stringify(a.tags) }
                : {}),
            },
          }),
        ),
      );
    }

    const full = await prisma.imagePack.findUniqueOrThrow({
      where: { id },
      include: { assets: { orderBy: { sortOrder: "asc" } } },
    });
    logger.info("api", "Image pack updated", { packId: id });
    return NextResponse.json({ pack: serializePack(full) });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    const message = err instanceof Error ? err.message : "Update failed";
    logger.error("api", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

async function handleDELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const pack = await prisma.imagePack.findUnique({ where: { id } });
    if (!pack) return NextResponse.json({ error: "Not found" }, { status: 404 });
    await guardProjectId(pack.projectId);

    await prisma.imagePack.delete({ where: { id } });
    logger.info("api", "Image pack deleted", { packId: id });
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    const message = err instanceof Error ? err.message : "Delete failed";
    logger.error("api", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export const GET = withApi(handleGET, "GET src/app/api/image-packs/[id]/route.ts");

export const PATCH = withApi(handlePATCH, "PATCH src/app/api/image-packs/[id]/route.ts");

export const DELETE = withApi(handleDELETE, "DELETE src/app/api/image-packs/[id]/route.ts");
