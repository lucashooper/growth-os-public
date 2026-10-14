import { NextResponse } from "next/server";
import { AuthError, guardProjectId } from "@/lib/api-auth";
import { fail, ok } from "@/lib/api-response";
import { withApi } from "@/lib/api-route";
import { prisma } from "@/lib/db";
import { resolveWorkspaceIdForProject } from "@/services/creator-outreach";
import { ensureCreatorOutreachTables } from "@/services/ensure-creator-outreach";

export const runtime = "nodejs";

async function handleGET(req: Request) {
  try {
    const url = new URL(req.url);
    const projectId = url.searchParams.get("projectId");
    const status = url.searchParams.get("status");
    if (!projectId) return fail("projectId required", 400);
    await guardProjectId(projectId);
    await ensureCreatorOutreachTables();

    const project = await resolveWorkspaceIdForProject(projectId);
    const leads = await prisma.creatorLead.findMany({
      where: {
        workspaceId: project.workspaceId,
        ...(status ? { status } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: 200,
    });

    const stats = {
      total: leads.length,
      withEmail: leads.filter((l) => Boolean(l.email)).length,
      pitched: leads.filter((l) =>
        ["pitched", "contacted", "replied", "onboarded"].includes(l.status),
      ).length,
      contacted: leads.filter((l) =>
        ["contacted", "replied", "onboarded"].includes(l.status),
      ).length,
    };

    return ok({ leads, stats });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return fail(err instanceof Error ? err.message : "Failed to list leads", 500);
  }
}

async function handlePATCH(req: Request) {
  try {
    const body = (await req.json()) as {
      projectId?: string;
      id?: string;
      emailSubject?: string;
      suggestedPitch?: string;
      status?: string;
      email?: string;
    };
    if (!body.projectId || !body.id) return fail("projectId and id required", 400);
    await guardProjectId(body.projectId);
    await ensureCreatorOutreachTables();
    const project = await resolveWorkspaceIdForProject(body.projectId);

    const lead = await prisma.creatorLead.findFirst({
      where: { id: body.id, workspaceId: project.workspaceId },
    });
    if (!lead) return fail("Lead not found", 404);

    const updated = await prisma.creatorLead.update({
      where: { id: lead.id },
      data: {
        ...(body.emailSubject !== undefined
          ? { emailSubject: body.emailSubject.slice(0, 200) }
          : {}),
        ...(body.suggestedPitch !== undefined
          ? { suggestedPitch: body.suggestedPitch.slice(0, 4000) }
          : {}),
        ...(body.status !== undefined ? { status: body.status } : {}),
        ...(body.email !== undefined ? { email: body.email.slice(0, 200) } : {}),
      },
    });
    return ok({ lead: updated });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return fail(err instanceof Error ? err.message : "Update failed", 500);
  }
}

async function handleDELETE(req: Request) {
  try {
    const url = new URL(req.url);
    const projectId = url.searchParams.get("projectId");
    const id = url.searchParams.get("id");
    if (!projectId || !id) return fail("projectId and id required", 400);
    await guardProjectId(projectId);
    await ensureCreatorOutreachTables();
    const project = await resolveWorkspaceIdForProject(projectId);

    const lead = await prisma.creatorLead.findFirst({
      where: { id, workspaceId: project.workspaceId },
    });
    if (!lead) return fail("Lead not found", 404);
    await prisma.creatorLead.delete({ where: { id } });
    return ok({ deleted: true });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return fail(err instanceof Error ? err.message : "Delete failed", 500);
  }
}

export const GET = withApi(handleGET, "GET /api/outreach/leads");
export const PATCH = withApi(handlePATCH, "PATCH /api/outreach/leads");
export const DELETE = withApi(handleDELETE, "DELETE /api/outreach/leads");
