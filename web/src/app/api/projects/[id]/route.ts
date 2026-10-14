import { prisma } from "@/lib/db";
import { fail, ok } from "@/lib/api-response";
import { AuthError, guardProjectId } from "@/lib/api-auth";
import { withApi } from "@/lib/api-route";


export const runtime = "nodejs";

async function handleGET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const project = await prisma.project.findUnique({
      where: { id },
      include: {
        accounts: { orderBy: { createdAt: "asc" } },
        findings: { orderBy: { createdAt: "desc" }, take: 20 },
        _count: { select: { posts: true, experiments: true, accounts: true } },
      },
    });
    if (!project) return fail("Project not found", 404);
    await guardProjectId(id);
    return ok({ project });
  } catch (err) {
    if (err instanceof AuthError) return fail(err.message, err.status);
    return fail(err);
  }
}

async function handlePATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    await guardProjectId(id);
    
    const body = (await req.json()) as {
      name?: string;
      description?: string;
      color?: string;
    };

    const project = await prisma.project.update({
      where: { id },
      data: {
        ...(body.name && { name: body.name }),
        ...(body.description !== undefined && { description: body.description }),
        ...(body.color && { color: body.color }),
      },
    });

    return ok({ project });
  } catch (err) {
    if (err instanceof AuthError) return fail(err.message, err.status);
    return fail(err);
  }
}

export const GET = withApi(handleGET, "GET src/app/api/projects/[id]/route.ts");
export const PATCH = withApi(handlePATCH, "PATCH src/app/api/projects/[id]/route.ts");
