import { prisma } from "@/lib/db";
import { AuthError, requireUser } from "@/lib/api-auth";
import { fail, ok } from "@/lib/api-response";
import { withApi } from "@/lib/api-route";


export const runtime = "nodejs";

async function handleGET(req: Request) {
  try {
    await requireUser();
    const { searchParams } = new URL(req.url);
    const category = searchParams.get("category");
    const level = searchParams.get("level");
    const limit = Math.min(Number(searchParams.get("limit") ?? 100), 500);

    const logs = await prisma.devLog.findMany({
      where: {
        ...(category ? { category } : {}),
        ...(level ? { level } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: limit,
    });

    return ok({
      logs: logs.map((l) => ({
        ...l,
        meta: JSON.parse(l.metaJson || "{}"),
      })),
    });
  } catch (err) {
    if (err instanceof AuthError) return fail(err.message, err.status);
    return fail(err);
  }
}

export const GET = withApi(handleGET, "GET src/app/api/logs/route.ts");
