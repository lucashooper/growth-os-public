import { fail, ok } from "@/lib/api-response";
import { guardProjectId, isAuthError } from "@/lib/api-auth";
import { prisma } from "@/lib/db";
import { withApi } from "@/lib/api-route";

export const runtime = "nodejs";

async function handleGET(req: Request) {
  try {
    const url = new URL(req.url);
    const projectId = url.searchParams.get("projectId");
    if (!projectId) return fail("projectId required", 400);
    await guardProjectId(projectId);

    const topic = url.searchParams.get("topic") || undefined;
    const emotion = url.searchParams.get("emotion") || undefined;
    const q = url.searchParams.get("q")?.trim();
    const minViews = Number(url.searchParams.get("minViews") || 0) || 0;
    const colour = url.searchParams.get("colour") || undefined;

    const hooks = await prisma.hookRecord.findMany({
      where: {
        projectId,
        ...(topic ? { topic } : {}),
        ...(emotion ? { emotion } : {}),
        ...(colour ? { colourPalette: { contains: colour } } : {}),
        ...(minViews ? { views: { gte: minViews } } : {}),
        ...(q
          ? {
              OR: [
                { hook: { contains: q } },
                { topic: { contains: q } },
                { openingSentence: { contains: q } },
              ],
            }
          : {}),
      },
      orderBy: [{ views: "desc" }, { estimatedEngagement: "desc" }],
      take: 100,
      include: {
        competitor: { select: { id: true, name: true, handle: true } },
      },
    });

    return ok({ hooks });
  } catch (err) {
    if (isAuthError(err)) return fail(err.message, err.status);
    return fail(err);
  }
}

export const GET = withApi(handleGET, "GET src/app/api/hooks/route.ts");
