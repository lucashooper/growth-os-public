import { NextResponse } from "next/server";
import { AuthError, guardProjectId } from "@/lib/api-auth";
import { fail, ok } from "@/lib/api-response";
import { withApi } from "@/lib/api-route";
import { prisma } from "@/lib/db";
import { canSendOutreachEmail, sendOutreachEmail } from "@/lib/outreach-email";
import { resolveWorkspaceIdForProject } from "@/services/creator-outreach";
import { ensureCreatorOutreachTables } from "@/services/ensure-creator-outreach";

export const runtime = "nodejs";
export const maxDuration = 60;

async function handlePOST(req: Request) {
  try {
    const body = (await req.json()) as {
      projectId?: string;
      leadIds?: string[];
    };
    if (!body.projectId?.trim()) return fail("projectId required", 400);
    if (!body.leadIds?.length) return fail("leadIds required", 400);
    await guardProjectId(body.projectId);
    await ensureCreatorOutreachTables();

    if (!canSendOutreachEmail()) {
      return fail("Missing RESEND_API_KEY in environment", 503);
    }

    const project = await resolveWorkspaceIdForProject(body.projectId);
    const workspace = await prisma.workspace.findUnique({
      where: { id: project.workspaceId },
      select: { name: true },
    });

    const leads = await prisma.creatorLead.findMany({
      where: {
        id: { in: body.leadIds },
        workspaceId: project.workspaceId,
      },
    });

    const results: Array<{
      id: string;
      username: string;
      ok: boolean;
      error?: string;
    }> = [];

    for (const lead of leads) {
      if (!lead.email) {
        results.push({
          id: lead.id,
          username: lead.username,
          ok: false,
          error: "No email on lead",
        });
        continue;
      }
      if (!lead.suggestedPitch || !lead.emailSubject) {
        results.push({
          id: lead.id,
          username: lead.username,
          ok: false,
          error: "Generate a pitch first",
        });
        continue;
      }

      const send = await sendOutreachEmail({
        fromName: workspace?.name || project.name || "Growth OS",
        to: lead.email,
        subject: lead.emailSubject,
        text: lead.suggestedPitch,
      });

      if (send.ok) {
        await prisma.creatorLead.update({
          where: { id: lead.id },
          data: { status: "contacted", sentAt: new Date() },
        });
        results.push({ id: lead.id, username: lead.username, ok: true });
      } else {
        results.push({
          id: lead.id,
          username: lead.username,
          ok: false,
          error: send.error || "Send failed",
        });
      }
    }

    const sent = results.filter((r) => r.ok).length;
    await prisma.outreachCampaign.create({
      data: {
        workspaceId: project.workspaceId,
        projectId: body.projectId,
        name: `Batch send ${new Date().toISOString().slice(0, 10)}`,
        status: sent > 0 ? "sent" : "failed",
        leadIdsJson: JSON.stringify(body.leadIds),
        sentCount: sent,
      },
    });

    return ok({
      results,
      sent,
      failed: results.length - sent,
      total: results.length,
    });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return fail(err instanceof Error ? err.message : "Send failed", 500);
  }
}

export const POST = withApi(handlePOST, "POST /api/outreach/send");
