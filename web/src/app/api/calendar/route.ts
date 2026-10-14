import { prisma } from "@/lib/db";
import { fail, ok } from "@/lib/api-response";
import { AuthError, guardProjectId } from "@/lib/api-auth";
import { withApi } from "@/lib/api-route";

export const runtime = "nodejs";

async function handleGET(req: Request) {
  try {
    const url = new URL(req.url);
    const projectId = url.searchParams.get("projectId");
    if (!projectId) return fail("projectId required", 400);
    await guardProjectId(projectId);

    const [drafts, scheduled, accounts] = await Promise.all([
      prisma.post.findMany({
        where: {
          projectId,
          status: { in: ["draft", "ready"] },
          scheduledAt: null,
        },
        orderBy: { updatedAt: "desc" },
        take: 50,
      }),
      prisma.post.findMany({
        where: {
          projectId,
          scheduledAt: { not: null },
          status: { in: ["scheduled", "publishing", "published", "failed"] },
        },
        orderBy: { scheduledAt: "asc" },
        take: 200,
      }),
      prisma.connectedAccount.findMany({
        where: { projectId, status: "active" },
        select: { id: true, username: true, nickname: true, platform: true },
      }),
    ]);

    const mapPost = (p: (typeof drafts)[0]) => {
      const meta = JSON.parse(p.metaJson || "{}") as {
        visualSlides?: { backgroundUrl?: string; backgroundImageUrl?: string }[];
      };
      const visualSlides = meta.visualSlides ?? [];
      const thumb =
        (p.coverUrl && !/tiktokcdn|p16-sign/i.test(p.coverUrl) ? p.coverUrl : "") ||
        visualSlides[0]?.backgroundImageUrl ||
        visualSlides[0]?.backgroundUrl ||
        "";
      return {
        id: p.id,
        hook: p.hook,
        caption: p.caption,
        status: p.status,
        coverUrl: thumb,
        scheduledAt: p.scheduledAt?.toISOString() ?? null,
        accountId: p.accountId,
        meta: { visualSlides: visualSlides.slice(0, 3) },
      };
    };

    return ok({
      drafts: drafts.map(mapPost),
      scheduled: scheduled.map(mapPost),
      accounts,
    });
  } catch (err) {
    if (err instanceof AuthError) return fail(err.message, err.status);
    return fail(err);
  }
}

export const GET = withApi(handleGET, "GET src/app/api/calendar/route.ts");
