import { prisma } from "@/lib/db";
import { fail, ok } from "@/lib/api-response";
import { ensureWorkspace } from "@/lib/workspace";
import { AuthError, listUserProjectIds, requireUser } from "@/lib/auth";
import { logger } from "@/lib/logger";
import { withApi } from "@/lib/api-route";


export const runtime = "nodejs";

async function handleGET() {
  try {
    const user = await requireUser();
    const projectIds = await listUserProjectIds(user.id);
    const workspace = await ensureWorkspace();
    const projects = await prisma.project.findMany({
      where: { id: { in: projectIds } },
      orderBy: { createdAt: "asc" },
      include: {
        _count: { select: { accounts: true, posts: true, experiments: true } },
      },
    });
    logger.info("api", "GET /api/projects", { userId: user.id, count: projects.length });
    return ok({ workspace, projects, user });
  } catch (err) {
    if (err instanceof AuthError) {
      return fail(err.message, err.status);
    }
    return fail(err);
  }
}

async function handlePOST(req: Request) {
  try {
    const user = await requireUser();
    const workspace = await ensureWorkspace();
    const body = (await req.json()) as {
      name?: string;
      slug?: string;
      description?: string;
      color?: string;
    };
    if (!body.name?.trim()) return fail("name is required", 400);

    const slug =
      body.slug?.trim() ||
      body.name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/(^-|-$)/g, "");

    const project = await prisma.project.create({
      data: {
        workspaceId: workspace.id,
        name: body.name.trim(),
        slug,
        description: body.description?.trim() ?? "",
        color: body.color ?? "oklch(0.72 0.12 160)",
      },
    });
    logger.info("db", "Created project", { id: project.id, slug, userId: user.id });
    return ok({ project }, 201);
  } catch (err) {
    if (err instanceof AuthError) {
      return fail(err.message, err.status);
    }
    return fail(err);
  }
}

export const GET = withApi(handleGET, "GET src/app/api/projects/route.ts");

export const POST = withApi(handlePOST, "POST src/app/api/projects/route.ts");
