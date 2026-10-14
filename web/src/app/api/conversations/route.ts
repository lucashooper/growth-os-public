import { prisma } from "@/lib/db";
import { fail, ok } from "@/lib/api-response";
import { AuthError, guardProjectId, requireWorkspaceAccess } from "@/lib/api-auth";
import { ensureWorkspace } from "@/lib/workspace";
import { logger } from "@/lib/logger";
import { withApi } from "@/lib/api-route";

export const runtime = "nodejs";

const ALLOWED_KINDS = new Set(["chat", "voice"]);

async function handleGET(req: Request) {
  try {
    const workspace = await ensureWorkspace();
    await requireWorkspaceAccess(workspace.id);
    const url = new URL(req.url);
    const projectId = url.searchParams.get("projectId");
    const kindParam = url.searchParams.get("kind") || "chat";
    const kind = ALLOWED_KINDS.has(kindParam) ? kindParam : "chat";
    if (projectId) await guardProjectId(projectId);
    const conversations = await prisma.conversation.findMany({
      where: {
        workspaceId: workspace.id,
        kind,
        ...(projectId ? { projectId } : {}),
      },
      orderBy: { updatedAt: "desc" },
      include: {
        messages: { orderBy: { createdAt: "desc" }, take: 1 },
        _count: { select: { messages: true } },
      },
      take: 50,
    });
    return ok({ conversations });
  } catch (err) {
    if (err instanceof AuthError) return fail(err.message, err.status);
    return fail(err);
  }
}

async function handlePOST(req: Request) {
  try {
    const workspace = await ensureWorkspace();
    await requireWorkspaceAccess(workspace.id);
    const body = (await req.json()) as {
      projectId?: string;
      title?: string;
      kind?: string;
    };
    if (body.projectId) await guardProjectId(body.projectId);
    const kind =
      body.kind && ALLOWED_KINDS.has(body.kind) ? body.kind : "chat";
    const conversation = await prisma.conversation.create({
      data: {
        workspaceId: workspace.id,
        projectId: body.projectId ?? null,
        title: body.title?.trim() || (kind === "voice" ? "Voice session" : "New chat"),
        kind,
      },
    });
    logger.info("db", "Created conversation", { id: conversation.id, kind });
    return ok({ conversation }, 201);
  } catch (err) {
    if (err instanceof AuthError) return fail(err.message, err.status);
    return fail(err);
  }
}

export const GET = withApi(handleGET, "GET src/app/api/conversations/route.ts");

export const POST = withApi(handlePOST, "POST src/app/api/conversations/route.ts");
