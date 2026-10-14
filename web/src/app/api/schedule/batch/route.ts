import { NextResponse } from "next/server";
import { AuthError, guardProjectId, isAuthError } from "@/lib/api-auth";
import { withApi } from "@/lib/api-route";
import {
  scheduleStaggerBatch,
  spacingToHours,
} from "@/services/scheduler";

export const runtime = "nodejs";

async function handlePOST(req: Request) {
  try {
    const body = (await req.json()) as {
      projectId?: string;
      postIds?: string[];
      accountIds?: string[];
      startAt?: string;
      spacing?: string;
      intervalHours?: number;
      randomJitterMinutes?: number;
      uploadAsDraft?: boolean;
      distributeEvenly?: boolean;
      generateVariantsFrom?: string;
      variantCount?: number;
      topic?: string;
    };

    if (!body.projectId) {
      return NextResponse.json({ error: "projectId required" }, { status: 400 });
    }
    await guardProjectId(body.projectId);

    let postIds = body.postIds || [];

    // Optional: generate variants from a template inside the schedule flow
    if (body.generateVariantsFrom && (body.variantCount || 0) > 0) {
      const { generateSlideVariants } = await import("@/services/agent-tools");
      const drafts = await generateSlideVariants({
        projectId: body.projectId,
        templatePostId: body.generateVariantsFrom,
        count: body.variantCount || 10,
        topic: body.topic,
      });
      postIds = [...postIds, ...drafts.map((d) => d.id)];
    }

    if (!postIds.length || !body.accountIds?.length) {
      return NextResponse.json(
        { error: "postIds and accountIds required" },
        { status: 400 },
      );
    }

    const startAt = body.startAt ? new Date(body.startAt) : new Date(Date.now() + 60_000);
    const intervalHours =
      body.intervalHours ?? spacingToHours(body.spacing || "4h");

    const result = await scheduleStaggerBatch({
      projectId: body.projectId,
      postIds,
      accountIds: body.accountIds,
      startAt,
      intervalHours,
      randomJitterMinutes: body.randomJitterMinutes ?? 20,
      uploadAsDraft: body.uploadAsDraft !== false,
      distributeEvenly: body.distributeEvenly !== false,
      source: "schedule-modal",
    });

    return NextResponse.json(result);
  } catch (err) {
    if (isAuthError(err)) {
      return NextResponse.json(
        { error: (err as AuthError).message },
        { status: (err as AuthError).status },
      );
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Schedule failed" },
      { status: 500 },
    );
  }
}

export const POST = withApi(handlePOST, "POST /api/schedule/batch");
