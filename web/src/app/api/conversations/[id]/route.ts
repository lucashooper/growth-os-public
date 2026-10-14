import { prisma } from "@/lib/db";
import { fail, ok } from "@/lib/api-response";
import { withApi } from "@/lib/api-route";

import {
  AuthError,
  requireProjectAccess,
  requireWorkspaceAccess,
} from "@/lib/api-auth";

export const runtime = "nodejs";

async function assertConversationAccess(id: string) {
  const conversation = await prisma.conversation.findUnique({
    where: { id },
    include: {
      messages: { orderBy: { createdAt: "asc" } },
      project: true,
    },
  });
  if (!conversation) return null;
  await requireWorkspaceAccess(conversation.workspaceId);
  if (conversation.projectId) {
    await requireProjectAccess(conversation.projectId);
  }
  return conversation;
}

async function handleGET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const conversation = await assertConversationAccess(id);
    if (!conversation) return fail("Conversation not found", 404);
    return ok({
      conversation: {
        ...conversation,
        messages: conversation.messages.map((m) => {
          let meta: {
            citedPosts?: unknown[];
            competitorCards?: unknown[];
          } = {};
          try {
            meta = JSON.parse(m.metaJson || "{}");
          } catch {
            meta = {};
          }
          return {
            ...m,
            attachments: JSON.parse(m.attachmentsJson || "[]"),
            citedPosts: meta.citedPosts || [],
            competitorCards: meta.competitorCards || [],
          };
        }),
      },
    });
  } catch (err) {
    if (err instanceof AuthError) return fail(err.message, err.status);
    return fail(err);
  }
}

async function handleDELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const conversation = await assertConversationAccess(id);
    if (!conversation) return fail("Conversation not found", 404);
    await prisma.conversation.delete({ where: { id } });
    return ok({ deleted: true });
  } catch (err) {
    if (err instanceof AuthError) return fail(err.message, err.status);
    return fail(err);
  }
}

export const GET = withApi(handleGET, "GET src/app/api/conversations/[id]/route.ts");

export const DELETE = withApi(handleDELETE, "DELETE src/app/api/conversations/[id]/route.ts");
