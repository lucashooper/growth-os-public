import { prisma } from "@/lib/db";
import { fail, ok } from "@/lib/api-response";
import { AuthError, guardProjectId } from "@/lib/api-auth";
import { computeExperiments } from "@/services/experiments";
import { withApi } from "@/lib/api-route";


export const runtime = "nodejs";

async function handleGET(req: Request) {
  try {
    const url = new URL(req.url);
    const projectId = url.searchParams.get("projectId");
    if (!projectId) return fail("projectId required", 400);
    await guardProjectId(projectId);
    const recompute = url.searchParams.get("recompute") === "1";
    if (recompute) await computeExperiments(projectId);

    const experiments = await prisma.experiment.findMany({
      where: { projectId },
      orderBy: [{ status: "asc" }, { confidence: "desc" }],
    });

    const withArms = await Promise.all(
      experiments.map(async (e) => {
        let arms: { postIds?: string[] }[] = [];
        try {
          arms = JSON.parse(e.armsJson || "[]");
        } catch {
          arms = [];
        }
        const postIds = arms.flatMap((a) => a.postIds || []).slice(0, 12);
        const posts = postIds.length
          ? await prisma.post.findMany({ where: { id: { in: postIds } } })
          : [];
        return {
          ...e,
          arms,
          samplePosts: posts,
        };
      }),
    );

    return ok({ experiments: withArms });
  } catch (err) {
    if (err instanceof AuthError) return fail(err.message, err.status);
    return fail(err);
  }
}

async function handlePOST(req: Request) {
  try {
    const body = (await req.json()) as {
      projectId?: string;
      name?: string;
      hypothesis?: string;
      recompute?: boolean;
    };
    if (!body.projectId) return fail("projectId required", 400);
    await guardProjectId(body.projectId);

    if (body.recompute) {
      const result = await computeExperiments(body.projectId);
      return ok(result);
    }

    if (!body.name) return fail("name required", 400);
    const experiment = await prisma.experiment.create({
      data: {
        projectId: body.projectId,
        name: body.name,
        hypothesis: body.hypothesis ?? "",
        kind: "manual",
        status: "running",
      },
    });
    return ok({ experiment }, 201);
  } catch (err) {
    if (err instanceof AuthError) return fail(err.message, err.status);
    return fail(err);
  }
}

export const GET = withApi(handleGET, "GET src/app/api/experiments/route.ts");

export const POST = withApi(handlePOST, "POST src/app/api/experiments/route.ts");
