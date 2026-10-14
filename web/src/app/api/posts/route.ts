import { prisma } from "@/lib/db";
import { fail, ok } from "@/lib/api-response";
import { AuthError, guardProjectId, requireProjectAccess, requireUser } from "@/lib/api-auth";
import { logger } from "@/lib/logger";
import { withApi } from "@/lib/api-route";


export const runtime = "nodejs";

async function handleGET(req: Request) {
  try {
    const url = new URL(req.url);
    const projectId = url.searchParams.get("projectId");
    const ids = url.searchParams.get("ids");
    const status = url.searchParams.get("status");
    const accountId = url.searchParams.get("accountId");

    if (ids) {
      const list = ids.split(",").filter(Boolean);
      const posts = await prisma.post.findMany({ where: { id: { in: list } } });
      const projectIds = [...new Set(posts.map((p) => p.projectId))];
      if (!projectIds.length) await requireUser();
      else {
        for (const pid of projectIds) await requireProjectAccess(pid);
      }
      return ok({
        posts: posts.map((p) => ({
          ...p,
          slides: JSON.parse(p.slidesJson || "[]"),
          meta: JSON.parse(p.metaJson || "{}"),
        })),
      });
    }

    if (!projectId) return fail("projectId required", 400);
    await guardProjectId(projectId);
    const limitRaw = url.searchParams.get("limit");
    const limit = limitRaw ? Math.min(Math.max(Number(limitRaw) || 24, 1), 100) : undefined;
    const lite = url.searchParams.get("lite") === "1";

    const posts = await prisma.post.findMany({
      where: {
        projectId,
        ...(status ? { status } : {}),
        ...(accountId ? { accountId } : {}),
      },
      orderBy: [{ createdAt: "desc" }, { publishedAt: "desc" }],
      ...(limit ? { take: limit } : {}),
      ...(lite
        ? {
            select: {
              id: true,
              projectId: true,
              hook: true,
              status: true,
              coverUrl: true,
              createdAt: true,
              publishedAt: true,
              metaJson: true,
              slidesJson: true,
              caption: true,
              theme: true,
            },
          }
        : {}),
    });

    return ok({
      posts: posts.map((p) => {
        const meta = JSON.parse(
          ("metaJson" in p ? p.metaJson : "{}") || "{}",
        ) as Record<string, unknown>;
        const slides = JSON.parse(
          ("slidesJson" in p ? p.slidesJson : "[]") || "[]",
        ) as string[];
        const visualSlides = Array.isArray(meta.visualSlides)
          ? (meta.visualSlides as { backgroundUrl?: string; backgroundImageUrl?: string }[])
          : [];
        const thumb =
          (typeof p.coverUrl === "string" &&
          p.coverUrl &&
          !/tiktokcdn|p16-sign/i.test(p.coverUrl)
            ? p.coverUrl
            : "") ||
          visualSlides[0]?.backgroundImageUrl ||
          visualSlides[0]?.backgroundUrl ||
          "";
        if (lite) {
          return {
            id: p.id,
            hook: p.hook,
            status: p.status,
            coverUrl: thumb,
            createdAt: p.createdAt,
            theme: "theme" in p ? p.theme : "",
            meta: { visualSlides: visualSlides.slice(0, 1) },
          };
        }
        return {
          ...p,
          slides,
          meta,
          coverUrl: thumb || p.coverUrl,
        };
      }),
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
      accountId?: string;
      hook?: string;
      caption?: string;
      slides?: string[];
      status?: string;
      theme?: string;
      coverUrl?: string;
      meta?: Record<string, unknown>;
      saveToLibrary?: boolean;
    };
    if (!body.projectId || !body.hook) {
      return fail("projectId and hook required", 400);
    }
    await guardProjectId(body.projectId);
    
    // Try multiple sources for cover image, in order of preference:
    // 1. Explicit coverUrl from request
    // 2. First slide if it's a URL
    // 3. First visualSlide backgroundUrl from meta
    // 4. Empty string (will show placeholder)
    const coverFromMeta =
      body.coverUrl ||
      (Array.isArray(body.slides) && body.slides[0]?.startsWith('http')
        ? body.slides[0]
        : "") ||
      (Array.isArray((body.meta as { visualSlides?: { backgroundUrl?: string }[] })?.visualSlides)
        ? (body.meta as { visualSlides: { backgroundUrl?: string }[] }).visualSlides.find(
            (v) => v.backgroundUrl,
          )?.backgroundUrl
        : "") ||
      "";
    
    console.log("[posts API] Creating post with cover:", {
      hook: body.hook?.substring(0, 30),
      hasCoverUrl: Boolean(body.coverUrl),
      hasSlides: Boolean(body.slides?.length),
      firstSlide: body.slides?.[0]?.substring(0, 50),
      coverFromMeta: coverFromMeta?.substring(0, 50),
      finalCover: Boolean(coverFromMeta),
    });
    
    const post = await prisma.post.create({
      data: {
        projectId: body.projectId,
        accountId: body.accountId,
        hook: body.hook,
        caption: body.caption ?? "",
        slidesJson: JSON.stringify(body.slides ?? [body.hook]),
        metaJson: JSON.stringify(body.meta ?? {}),
        status: body.status ?? "draft",
        theme: body.theme ?? "",
        coverUrl: coverFromMeta || "",
      },
    });

    if (body.saveToLibrary !== false) {
      await prisma.libraryAsset.create({
        data: {
          projectId: body.projectId,
          name: body.hook.slice(0, 80),
          kind: "generated",
          folder: "generated",
          theme: body.theme ?? "",
          source: "generate",
          postId: post.id,
          url: coverFromMeta || "",
          tagsJson: JSON.stringify(["generated", body.theme ?? "draft"].filter(Boolean)),
        },
      });
    }

    logger.info("db", "Created post", { id: post.id, projectId: body.projectId });
    return ok({ post }, 201);
  } catch (err) {
    if (err instanceof AuthError) return fail(err.message, err.status);
    return fail(err);
  }
}

export const GET = withApi(handleGET, "GET src/app/api/posts/route.ts");

export const POST = withApi(handlePOST, "POST src/app/api/posts/route.ts");
