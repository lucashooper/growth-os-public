import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { AuthError, guardProjectId } from "@/lib/api-auth";
import { logger } from "@/lib/logger";
import { withApi } from "@/lib/api-route";

import {
  createImagePack,
  ensureImagePacks,
  serializePack,
} from "@/services/image-packs";

export const runtime = "nodejs";

async function handleGET(req: Request) {
  try {
    const projectId = new URL(req.url).searchParams.get("projectId");
    if (!projectId) {
      return NextResponse.json({ error: "projectId required" }, { status: 400 });
    }
    await guardProjectId(projectId);
    const packs = await ensureImagePacks(projectId);
    return NextResponse.json({ packs: packs.map(serializePack) });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    const message = err instanceof Error ? err.message : "Failed to load packs";
    logger.error("api", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

async function handlePOST(req: Request) {
  try {
    const body = (await req.json()) as {
      projectId?: string;
      name?: string;
      description?: string;
      orderMode?: "sequential" | "random" | "ai";
    };
    if (!body.projectId || !body.name?.trim()) {
      return NextResponse.json({ error: "projectId and name required" }, { status: 400 });
    }
    await guardProjectId(body.projectId);
    const pack = await createImagePack(body.projectId, {
      name: body.name,
      description: body.description,
      orderMode: body.orderMode,
    });
    logger.info("api", "Image pack created", { projectId: body.projectId, packId: pack.id });
    const full = await prisma.imagePack.findUniqueOrThrow({
      where: { id: pack.id },
      include: { assets: { orderBy: { sortOrder: "asc" } } },
    });
    return NextResponse.json({ pack: serializePack(full) });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    const message = err instanceof Error ? err.message : "Create failed";
    logger.error("api", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export const GET = withApi(handleGET, "GET src/app/api/image-packs/route.ts");

export const POST = withApi(handlePOST, "POST src/app/api/image-packs/route.ts");
