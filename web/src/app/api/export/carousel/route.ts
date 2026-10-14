import { NextResponse } from "next/server";
import { AuthError, guardProjectId, requireUser } from "@/lib/api-auth";
import { logger } from "@/lib/logger";
import { withApi } from "@/lib/api-route";

import {
  buildCaptionFile,
  buildPublishManifest,
  type ExportPack,
} from "@/services/publishing";

export const runtime = "nodejs";

async function handlePOST(req: Request) {
  try {
    const body = (await req.json()) as { pack?: ExportPack; projectId?: string };
    if (body.projectId) await guardProjectId(body.projectId);
    else await requireUser();
    if (!body.pack?.slides?.length) {
      return NextResponse.json({ error: "pack with slides required" }, { status: 400 });
    }

    const manifest = buildPublishManifest(body.pack);
    const captionTxt = buildCaptionFile(body.pack);

    logger.info("export", "Carousel export pack built", {
      projectId: body.projectId,
      slides: body.pack.slides.length,
      topic: body.pack.topic?.slice(0, 80),
    });

    return NextResponse.json({
      manifest,
      captionTxt,
      files: [
        { name: "caption.txt", content: captionTxt },
        { name: "manifest.json", content: JSON.stringify(manifest, null, 2) },
        {
          name: "slides.json",
          content: JSON.stringify(body.pack.slides, null, 2),
        },
      ],
    });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    const message = err instanceof Error ? err.message : "Export failed";
    logger.error("export", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export const POST = withApi(handlePOST, "POST src/app/api/export/carousel/route.ts");
