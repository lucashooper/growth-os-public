import { NextResponse } from "next/server";
import { AuthError, guardProjectId, requireWorkspaceAccess } from "@/lib/api-auth";
import { fail, ok } from "@/lib/api-response";
import { withApi } from "@/lib/api-route";
import { prisma } from "@/lib/db";
import {
  SubscriptionRequiredError,
  requireActiveSubscription,
} from "@/lib/require-subscription";
import { runAgentTurn } from "@/services/agent-tools";
import {
  assertUsageAllowed,
  UsageLimitError,
  workspaceIdForProject,
} from "@/services/usage";

export const runtime = "nodejs";
export const maxDuration = 60;

function titleFromTranscript(transcript: string) {
  const cleaned = transcript.replace(/\s+/g, " ").trim();
  if (!cleaned) return "Voice session";
  return cleaned.length > 56 ? `${cleaned.slice(0, 53)}…` : cleaned;
}

async function handlePOST(req: Request) {
  try {
    const body = (await req.json()) as {
      projectId?: string;
      transcript?: string;
      slideCount?: number;
      imagePackSlug?: string;
      conversationId?: string | null;
    };
    if (!body.projectId?.trim()) {
      return fail("projectId required", 400);
    }
    if (!body.transcript?.trim()) {
      return fail("transcript required", 400);
    }
    await guardProjectId(body.projectId);
    await requireActiveSubscription();

    const workspaceId = await workspaceIdForProject(body.projectId);
    if (!workspaceId) return fail("No workspace found", 404);
    await requireWorkspaceAccess(workspaceId);
    await assertUsageAllowed(workspaceId, "agent");

    let conversationId = body.conversationId?.trim() || null;
    if (conversationId) {
      const existing = await prisma.conversation.findFirst({
        where: {
          id: conversationId,
          workspaceId,
          kind: "voice",
        },
      });
      if (!existing) conversationId = null;
    }

    if (!conversationId) {
      const created = await prisma.conversation.create({
        data: {
          workspaceId,
          projectId: body.projectId,
          title: titleFromTranscript(body.transcript),
          kind: "voice",
        },
      });
      conversationId = created.id;
      console.log("[agent/voice] created conversation", { conversationId });
    }

    const transcript = body.transcript.trim();
    await prisma.message.create({
      data: {
        conversationId,
        role: "user",
        content: transcript,
      },
    });

    const result = await runAgentTurn({
      projectId: body.projectId,
      transcript,
      slideCount:
        typeof body.slideCount === "number" ? body.slideCount : undefined,
      imagePackSlug: body.imagePackSlug,
    });

    await prisma.message.create({
      data: {
        conversationId,
        role: "assistant",
        content: result.reply || "Done.",
        metaJson: JSON.stringify({
          drafts: result.drafts || [],
          draftIds: result.draftIds || [],
          toolsUsed: result.toolsUsed || [],
          statusHint: result.statusHint || null,
        }),
      },
    });

    // Keep title fresh for the first turn; bump updatedAt for history sorting.
    const msgCount = await prisma.message.count({ where: { conversationId } });
    await prisma.conversation.update({
      where: { id: conversationId },
      data: {
        ...(msgCount <= 2
          ? { title: titleFromTranscript(transcript) }
          : {}),
        updatedAt: new Date(),
      },
    });

    return ok({
      ...result,
      conversationId,
    });
  } catch (err) {
    if (err instanceof UsageLimitError) {
      return fail(err.message, 429);
    }
    if (err instanceof SubscriptionRequiredError) {
      return fail(err.message, 402);
    }
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return fail(err instanceof Error ? err.message : "Agent failed", 500);
  }
}

export const POST = withApi(handlePOST, "POST /api/agent/voice");
