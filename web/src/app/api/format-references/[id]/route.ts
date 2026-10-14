import { NextResponse } from "next/server";
import { AuthError, guardProjectId } from "@/lib/api-auth";
import { logger } from "@/lib/logger";
import { withApi } from "@/lib/api-route";
import { prisma } from "@/lib/db";
import {
  deleteFormatReference,
  ensureFormatReferenceTable,
} from "@/services/format-references";

export const runtime = "nodejs";

async function handleDELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    await ensureFormatReferenceTable();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const row = await (prisma as any).formatReference.findUnique({
      where: { id },
      select: { projectId: true },
    });
    if (!row) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    await guardProjectId(row.projectId);
    await deleteFormatReference(id);
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

export const DELETE = withApi(
  handleDELETE,
  "DELETE src/app/api/format-references/[id]/route.ts",
);
