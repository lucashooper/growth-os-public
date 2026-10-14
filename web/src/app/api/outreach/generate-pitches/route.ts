import { NextResponse } from "next/server";
import { AuthError, guardProjectId } from "@/lib/api-auth";
import { fail, ok } from "@/lib/api-response";
import { withApi } from "@/lib/api-route";
import { prisma } from "@/lib/db";
import { completeLogged } from "@/lib/ai/logged";
import { resolveWorkspaceIdForProject } from "@/services/creator-outreach";
import { ensureCreatorOutreachTables } from "@/services/ensure-creator-outreach";

export const runtime = "nodejs";
export const maxDuration = 60;

function fallbackPitch(
  appName: string,
  username: string,
  niche: string,
  valueProp: string,
) {
  const subject = `Collab with ${appName} (rev-share + VIP access)`;
  const body = `Hey @${username} — I've been loving your ${niche || "content"} and think your audience would vibe with ${appName} (${valueProp.slice(0, 80)}). We'd love to gift you lifetime Pro access and a 40% recurring rev-share on every subscriber you refer. If you're open to a soft collab, reply and I'll send the partner link.`;
  return { subject, body };
}

function parsePitchJson(raw: string): { subject?: string; body?: string } | null {
  const cleaned = raw
    .trim()
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "");
  try {
    return JSON.parse(cleaned) as { subject?: string; body?: string };
  } catch {
    const m = cleaned.match(/\{[\s\S]*\}/);
    if (!m) return null;
    try {
      return JSON.parse(m[0]) as { subject?: string; body?: string };
    } catch {
      return null;
    }
  }
}

async function handlePOST(req: Request) {
  try {
    const body = (await req.json()) as {
      projectId?: string;
      leadIds?: string[];
      appName?: string;
      valueProp?: string;
    };
    if (!body.projectId?.trim()) return fail("projectId required", 400);
    if (!body.leadIds?.length) return fail("leadIds required", 400);
    await guardProjectId(body.projectId);
    await ensureCreatorOutreachTables();

    const project = await resolveWorkspaceIdForProject(body.projectId);
    const appName = (body.appName?.trim() || project.name || "Insight").slice(
      0,
      40,
    );
    const valueProp = (
      body.valueProp?.trim() ||
      project.description?.slice(0, 180) ||
      "an AI mentor and journal for mood, habits, and patterns"
    ).replace(/["\n\r]/g, " ");

    const leads = await prisma.creatorLead.findMany({
      where: {
        id: { in: body.leadIds },
        workspaceId: project.workspaceId,
      },
    });

    const updated = [];
    const errors: string[] = [];

    for (const lead of leads) {
      const fb = fallbackPitch(
        appName,
        lead.username,
        lead.niche || "content",
        valueProp,
      );
      let subject = fb.subject;
      let pitch = fb.body;

      try {
        // Avoid Groq json_validate_failed: no emoji, plain ASCII JSON, soft mode
        const ai = await completeLogged(
          {
            messages: [
              {
                role: "system",
                content: `You write short creator collab emails. Reply with ONLY valid JSON (no markdown, no emoji): {"subject":"string","body":"string"}.
Rules: subject under 80 chars; body exactly 3 sentences; warm and specific; offer free lifetime Pro access to ${appName} and 40% recurring rev-share; no hard sell.`,
              },
              {
                role: "user",
                content: `Creator @${lead.username}. Followers ${lead.followerCount}. Niche: ${(lead.niche || "lifestyle").slice(0, 40)}. Bio: ${(lead.bio || "n/a").slice(0, 160)}. App: ${appName} - ${valueProp.slice(0, 100)}.`,
              },
            ],
            temperature: 0.4,
            maxTokens: 400,
            // Groq structured JSON often returns empty failed_generation; parse soft instead
            json: false,
          },
          {
            action: "outreach_generate_pitch",
            projectId: body.projectId,
          },
        );

        const parsed = parsePitchJson(ai.content);
        if (parsed?.subject?.trim()) {
          subject = parsed.subject
            .trim()
            .replace(/[^\x20-\x7E]/g, "")
            .slice(0, 160);
        }
        if (parsed?.body?.trim()) {
          pitch = parsed.body.trim().slice(0, 2000);
        }
      } catch (err) {
        errors.push(
          `@${lead.username}: ${err instanceof Error ? err.message.slice(0, 120) : "AI failed"} (used fallback)`,
        );
      }

      if (!subject) subject = fb.subject;
      if (!pitch) pitch = fb.body;

      const row = await prisma.creatorLead.update({
        where: { id: lead.id },
        data: {
          emailSubject: subject,
          suggestedPitch: pitch,
          status:
            lead.status === "discovered" || lead.status === "pitched"
              ? "pitched"
              : lead.status,
        },
      });
      updated.push(row);
    }

    return ok({
      leads: updated,
      count: updated.length,
      warnings: errors.length ? errors : undefined,
    });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return fail(
      err instanceof Error ? err.message : "Pitch generation failed",
      500,
    );
  }
}

export const POST = withApi(handlePOST, "POST /api/outreach/generate-pitches");
