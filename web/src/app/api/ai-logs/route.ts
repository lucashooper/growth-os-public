import { prisma } from "@/lib/db";
import { AuthError, requireUser } from "@/lib/api-auth";
import { fail, ok } from "@/lib/api-response";
import { withApi } from "@/lib/api-route";


export const runtime = "nodejs";

async function handleGET(req: Request) {
  try {
    await requireUser();
    const url = new URL(req.url);
    const limit = Math.min(Number(url.searchParams.get("limit") || 50), 200);
    const onlyErrors = url.searchParams.get("errors") === "1";
    const action = url.searchParams.get("action");

    const logs = await prisma.aiLog.findMany({
      where: {
        ...(onlyErrors ? { ok: false } : {}),
        ...(action ? { action } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: limit,
    });

    return ok({
      logs: logs.map((l) => ({
        ...l,
        meta: JSON.parse(l.metaJson || "{}"),
        prompt: JSON.parse(l.promptJson || "[]"),
      })),
    });
  } catch (err) {
    if (err instanceof AuthError) return fail(err.message, err.status);
    return fail(err);
  }
}

export const GET = withApi(handleGET, "GET src/app/api/ai-logs/route.ts");
