import { NextResponse } from "next/server";
import { AuthError, guardProjectId } from "@/lib/api-auth";
import { fail, ok } from "@/lib/api-response";
import { withApi } from "@/lib/api-route";
import { prisma } from "@/lib/db";
import {
  discoverCreators,
  MissingSearchKeyError,
  MissingSerperKeyError,
  resolveWorkspaceIdForProject,
  SearchRequestError,
  SerperRequestError,
  upsertCreatorLeads,
} from "@/services/creator-outreach";
import { ensureCreatorOutreachTables } from "@/services/ensure-creator-outreach";

export const runtime = "nodejs";
export const maxDuration = 26;

const MAX_LIMIT = 20;

async function handlePOST(req: Request) {
  const started = Date.now();

  try {
    const body = (await req.json()) as {
      projectId?: string;
      query?: string;
      platform?: "tiktok" | "instagram";
      limit?: number;
      followerRange?: string;
      requireEmail?: boolean;
    };

    if (!body.projectId?.trim()) return fail("projectId required", 400);

    const hasTavily = Boolean(process.env.TAVILY_API_KEY?.trim());
    const hasSerper = Boolean(
      process.env.SERPER_API_KEY?.trim() || process.env.SERPER_KEY?.trim(),
    );
    const query = (body.query || "wellness").trim() || "wellness";
    const isDirectHandles = /@[a-zA-Z0-9._]{2,}/.test(query) && !query.includes("#");
    if (!hasTavily && !hasSerper && !isDirectHandles) {
      return NextResponse.json(
        { error: "Missing TAVILY_API_KEY or SERPER_API_KEY" },
        { status: 400 },
      );
    }

    await guardProjectId(body.projectId);
    await ensureCreatorOutreachTables();

    const platform = body.platform === "instagram" ? "instagram" : "tiktok";
    console.log(`[Discovery] Initiating search for: "${query}"`);

    const project = await resolveWorkspaceIdForProject(body.projectId);
    const existing = await prisma.creatorLead.findMany({
      where: { workspaceId: project.workspaceId },
      select: { username: true },
    });

    const limit = Math.min(Math.max(body.limit ?? 12, 1), MAX_LIMIT);
    const requireEmail = Boolean(body.requireEmail);

    let creators: Awaited<ReturnType<typeof discoverCreators>>["creators"] = [];
    let profilesFound: Awaited<
      ReturnType<typeof discoverCreators>
    >["profilesFound"] = [];
    let withEmailCount = 0;
    let source = "none";

    try {
      const result = await discoverCreators({
        query,
        platform,
        limit,
        followerRange: body.followerRange || "all-3k",
        niche: query.replace(/#/g, " ").trim().slice(0, 60),
        requireEmail,
        excludeUsernames: existing.map((e) => e.username),
      });
      creators = result.creators;
      profilesFound = result.profilesFound;
      withEmailCount = result.withEmail;
      source = result.source || "none";
      console.log(
        `[Discovery] profiles=${profilesFound.length} withEmail=${withEmailCount} source=${source}`,
      );
    } catch (err) {
      if (
        err instanceof MissingSearchKeyError ||
        err instanceof MissingSerperKeyError
      ) {
        return NextResponse.json({ error: err.message }, { status: 400 });
      }
      if (
        err instanceof SearchRequestError ||
        err instanceof SerperRequestError
      ) {
        return NextResponse.json(
          { error: err.message },
          { status: err.status >= 400 && err.status < 600 ? err.status : 502 },
        );
      }
      const msg = err instanceof Error ? err.message : String(err);
      if (/abort|timeout|timed out/i.test(msg)) {
        return ok({
          success: true,
          count: 0,
          leads: [],
          discovered: 0,
          withEmail: 0,
          source,
          elapsedMs: Date.now() - started,
          message:
            "No profiles found with emails for this query — try another hashtag",
        });
      }
      return fail(msg || "Discover failed", 500);
    }

    // Always upsert discovered profiles (with or without email)
    const toSave = creators.length ? creators : profilesFound;

    if (!toSave.length) {
      return ok({
        success: true,
        count: 0,
        leads: [],
        discovered: 0,
        withEmail: 0,
        profilesFound: 0,
        source,
        elapsedMs: Date.now() - started,
        message:
          "No creator profiles found for this query — try another hashtag or paste @handles",
      });
    }

    const savedLeads = await upsertCreatorLeads({
      workspaceId: project.workspaceId,
      projectId: body.projectId,
      creators: toSave,
      skipExisting: true,
    });

    const savedWithEmail = savedLeads.filter((l) => l.email).length;

    console.log(
      `[Discovery] Upserted ${savedLeads.length} leads (withEmail=${savedWithEmail}) in ${Date.now() - started}ms via ${source}`,
    );

    return ok({
      success: true,
      count: savedLeads.length,
      leads: savedLeads,
      discovered: toSave.length,
      withEmail: savedWithEmail,
      profilesFound: profilesFound.length,
      skippedExisting: existing.length,
      source,
      elapsedMs: Date.now() - started,
    });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return fail(err instanceof Error ? err.message : "Discover failed", 500);
  }
}

export const POST = withApi(handlePOST, "POST /api/outreach/discover");
