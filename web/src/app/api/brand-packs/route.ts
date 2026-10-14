import { fail, ok } from "@/lib/api-response";
import { AuthError, guardProjectId } from "@/lib/api-auth";
import { ensureBrandPacks } from "@/services/brand-packs";
import { withApi } from "@/lib/api-route";


export const runtime = "nodejs";

async function handleGET(req: Request) {
  try {
    const projectId = new URL(req.url).searchParams.get("projectId");
    if (!projectId) return fail("projectId required", 400);
    await guardProjectId(projectId);
    const packs = await ensureBrandPacks(projectId);
    return ok({
      packs: packs.map((p) => ({
        ...p,
        colors: JSON.parse(p.colorsJson || "{}"),
        fonts: JSON.parse(p.fontsJson || "{}"),
        assets: JSON.parse(p.assetsJson || "[]"),
      })),
    });
  } catch (err) {
    if (err instanceof AuthError) return fail(err.message, err.status);
    return fail(err);
  }
}

export const GET = withApi(handleGET, "GET src/app/api/brand-packs/route.ts");
