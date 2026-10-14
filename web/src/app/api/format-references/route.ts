import { NextResponse } from "next/server";
import { AuthError, guardProjectId } from "@/lib/api-auth";
import { logger } from "@/lib/logger";
import { withApi } from "@/lib/api-route";
import {
  createFormatReference,
  listFormatReferences,
  type FormatKind,
} from "@/services/format-references";

export const runtime = "nodejs";

async function handleGET(req: Request) {
  try {
    const url = new URL(req.url);
    const projectId = url.searchParams.get("projectId");
    const format = url.searchParams.get("format") as FormatKind | null;
    if (!projectId) {
      return NextResponse.json({ error: "projectId required" }, { status: 400 });
    }
    await guardProjectId(projectId);
    const references = await listFormatReferences(
      projectId,
      format === "storytelling" || format === "informational" ? format : undefined,
    );
    return NextResponse.json({ references });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    const message = err instanceof Error ? err.message : "Failed to load";
    logger.error("api", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

async function handlePOST(req: Request) {
  try {
    const body = (await req.json()) as {
      projectId?: string;
      format?: FormatKind;
      title?: string;
      sourceUrl?: string;
      hook?: string;
      slides?: string[];
      structureNotes?: string;
      coverUrl?: string;
    };
    if (!body.projectId) {
      return NextResponse.json({ error: "projectId required" }, { status: 400 });
    }
    await guardProjectId(body.projectId);
    const format =
      body.format === "storytelling" ? "storytelling" : "informational";
    const reference = await createFormatReference({
      projectId: body.projectId,
      format,
      title: (body.title || body.hook || "Reference").slice(0, 160),
      sourceUrl: body.sourceUrl || "",
      hook: body.hook || "",
      slides: body.slides || [],
      structureNotes: body.structureNotes || "",
      coverUrl: body.coverUrl || "",
    });
    logger.info("api", "Format reference created", {
      id: reference.id,
      format,
      projectId: body.projectId,
    });
    return NextResponse.json({ reference });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    const message = err instanceof Error ? err.message : "Create failed";
    logger.error("api", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export const GET = withApi(handleGET, "GET src/app/api/format-references/route.ts");
export const POST = withApi(handlePOST, "POST src/app/api/format-references/route.ts");
