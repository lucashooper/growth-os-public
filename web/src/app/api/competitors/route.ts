import { prisma } from "@/lib/db";
import { fail, ok } from "@/lib/api-response";
import { isAuthError, guardProjectId } from "@/lib/api-auth";
import { logger } from "@/lib/logger";
import { withApi } from "@/lib/api-route";
import { slugifyCompetitor } from "@/services/intel/providers/types";

export const runtime = "nodejs";
export const maxDuration = 120;

async function handleGET(req: Request) {
  try {
    const projectId = new URL(req.url).searchParams.get("projectId");
    if (!projectId) return fail("projectId required", 400);
    await guardProjectId(projectId);
    const competitors = await prisma.competitor.findMany({
      where: { projectId },
      orderBy: { createdAt: "asc" },
      include: {
        posts: { orderBy: { views: "desc" }, take: 8 },
        assets: { orderBy: { observedAt: "desc" }, take: 6 },
        _count: { select: { posts: true, assets: true } },
      },
    });
    return ok({ competitors });
  } catch (err) {
    if (isAuthError(err)) return fail(err.message, err.status);
    logger.error("api", "GET /api/competitors failed", {
      message: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined,
    });
    return fail(err);
  }
}

async function handlePOST(req: Request) {
  try {
    const body = (await req.json()) as {
      projectId?: string;
      name?: string;
      handle?: string;
      niche?: string;
      websiteUrl?: string;
      appStoreUrl?: string;
      playStoreUrl?: string;
      metaPageId?: string;
      instagram?: string;
      facebookPage?: string;
      twitter?: string;
      youtube?: string;
      syncCadence?: string;
      sync?: boolean;
    };
    if (!body.projectId) return fail("projectId required", 400);
    await guardProjectId(body.projectId);

    const handle = body.handle?.replace(/^@/, "").trim() || "";
    const websiteUrl = body.websiteUrl?.trim() || "";
    const appStoreUrl = body.appStoreUrl?.trim() || "";
    const playStoreUrl = body.playStoreUrl?.trim() || "";
    const name = body.name?.trim() || "";

    if (!handle && !websiteUrl && !appStoreUrl && !playStoreUrl && !name) {
      return fail(
        "Provide at least a name, TikTok handle, website, or app store link",
        400,
      );
    }

    let slug = slugifyCompetitor({ handle, name, websiteUrl });
    const existing = await prisma.competitor.findUnique({
      where: { projectId_slug: { projectId: body.projectId, slug } },
    });
    if (existing) {
      slug = `${slug}-${Date.now().toString(36).slice(-4)}`;
    }

    const kind = handle ? "tiktok" : "brand";
    const competitor = await prisma.competitor.create({
      data: {
        projectId: body.projectId,
        slug,
        name: name || handle || slug,
        kind,
        handle,
        niche: body.niche?.trim() || "",
        websiteUrl,
        appStoreUrl,
        playStoreUrl,
        metaPageId: body.metaPageId?.trim() || "",
        instagram: body.instagram?.replace(/^@/, "").trim() || "",
        facebookPage: body.facebookPage?.trim() || "",
        twitter: body.twitter?.replace(/^@/, "").trim() || "",
        youtube: body.youtube?.trim() || "",
        syncCadence: body.syncCadence || "manual",
      },
    });
    logger.info("db", "Created competitor", {
      id: competitor.id,
      slug,
      handle,
    });

    let sync = null;
    if (body.sync !== false) {
      const { ingestCompetitor } = await import("@/services/intel/ingest");
      sync = await ingestCompetitor(competitor.id);
      try {
        const { generateCompetitorSummary, refreshCompetitorFindings } =
          await import("@/services/intel/competitor-insights");
        await generateCompetitorSummary(competitor.id);
        await refreshCompetitorFindings(body.projectId);
      } catch {
        /* AI optional */
      }
    }

    const fresh = await prisma.competitor.findUnique({
      where: { id: competitor.id },
      include: {
        posts: { orderBy: { views: "desc" }, take: 8 },
        assets: { orderBy: { observedAt: "desc" }, take: 6 },
        _count: { select: { posts: true, assets: true } },
      },
    });

    return ok({ competitor: fresh, sync }, 201);
  } catch (err) {
    if (isAuthError(err)) return fail(err.message, err.status);
    logger.error("api", "POST /api/competitors failed", {
      message: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined,
    });
    return fail(err);
  }
}

export const GET = withApi(handleGET, "GET src/app/api/competitors/route.ts");

export const POST = withApi(handlePOST, "POST src/app/api/competitors/route.ts");
