import { fail, ok } from "@/lib/api-response";
import { guardProjectId, isAuthError } from "@/lib/api-auth";
import { prisma } from "@/lib/db";
import { withApi } from "@/lib/api-route";

export const runtime = "nodejs";
export const maxDuration = 120;

async function handleGET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const competitor = await prisma.competitor.findUnique({
      where: { id },
      include: {
        posts: { orderBy: [{ publishedAt: "desc" }, { views: "desc" }], take: 30 },
        assets: { orderBy: { observedAt: "desc" }, take: 40 },
        snapshots: { orderBy: { date: "desc" }, take: 14 },
        observations: { orderBy: { observedAt: "desc" }, take: 20 },
        _count: { select: { posts: true, assets: true, observations: true } },
      },
    });
    if (!competitor) return fail("Competitor not found", 404);
    await guardProjectId(competitor.projectId);
    return ok({ competitor });
  } catch (err) {
    if (isAuthError(err)) return fail(err.message, err.status);
    return fail(err);
  }
}

async function handlePATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const existing = await prisma.competitor.findUnique({ where: { id } });
    if (!existing) return fail("Competitor not found", 404);
    await guardProjectId(existing.projectId);

    const body = (await req.json()) as {
      name?: string;
      handle?: string;
      niche?: string;
      websiteUrl?: string;
      appStoreUrl?: string;
      playStoreUrl?: string;
      metaPageId?: string;
    };

    const competitor = await prisma.competitor.update({
      where: { id },
      data: {
        name: body.name?.trim() ?? undefined,
        handle:
          body.handle !== undefined
            ? body.handle.replace(/^@/, "").trim()
            : undefined,
        niche: body.niche?.trim() ?? undefined,
        websiteUrl: body.websiteUrl?.trim() ?? undefined,
        appStoreUrl: body.appStoreUrl?.trim() ?? undefined,
        playStoreUrl: body.playStoreUrl?.trim() ?? undefined,
        metaPageId: body.metaPageId?.trim() ?? undefined,
        kind:
          (body.handle !== undefined
            ? body.handle.replace(/^@/, "").trim()
            : existing.handle)
            ? "tiktok"
            : "brand",
      },
    });
    return ok({ competitor });
  } catch (err) {
    if (isAuthError(err)) return fail(err.message, err.status);
    return fail(err);
  }
}

async function handleDELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const existing = await prisma.competitor.findUnique({ where: { id } });
    if (!existing) return fail("Competitor not found", 404);
    await guardProjectId(existing.projectId);
    await prisma.competitor.delete({ where: { id } });
    return ok({ deleted: true });
  } catch (err) {
    if (isAuthError(err)) return fail(err.message, err.status);
    return fail(err);
  }
}

export const GET = withApi(handleGET, "GET src/app/api/competitors/[id]/route.ts");
export const PATCH = withApi(
  handlePATCH,
  "PATCH src/app/api/competitors/[id]/route.ts",
);
export const DELETE = withApi(
  handleDELETE,
  "DELETE src/app/api/competitors/[id]/route.ts",
);
