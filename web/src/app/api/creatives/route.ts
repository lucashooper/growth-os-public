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

    const source = url.searchParams.get("source") || undefined;
    const q = url.searchParams.get("q")?.trim();
    const colour = url.searchParams.get("colour") || undefined;
    const cta = url.searchParams.get("cta") || undefined;

    const creatives = await prisma.creativeRecord.findMany({
      where: {
        projectId,
        ...(source ? { source } : {}),
        ...(colour ? { colourPalette: { contains: colour } } : {}),
        ...(cta ? { cta: { contains: cta } } : {}),
        ...(q
          ? {
              OR: [
                { hook: { contains: q } },
                { title: { contains: q } },
                { copy: { contains: q } },
                { cta: { contains: q } },
              ],
            }
          : {}),
      },
      orderBy: { lastSeenAt: "desc" },
      take: 120,
      include: {
        competitor: { select: { id: true, name: true, handle: true } },
      },
    });

    return ok({ creatives });
  } catch (err) {
    if (isAuthError(err)) return fail(err.message, err.status);
    return fail(err);
  }
}

export const GET = withApi(handleGET, "GET src/app/api/creatives/route.ts");
