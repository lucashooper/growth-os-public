import "server-only";

import { prisma } from "@/lib/db";
import {
  isBillingTier,
  limitsForTier,
  type BillingTier,
  type TierLimits,
} from "@/lib/billing-plans";
import { hasActiveSubscription } from "@/lib/billing-access";

export type UsageKind = "agent" | "chat" | "ai_image" | "ai_video";

/** One billed agent unit = carousel/slideshow generation (not pack-selection helpers). */
const AGENT_ACTIONS = [
  "agent_slide_variants",
  "generate_carousel",
  "generate_carousel_retry",
];
const IMAGE_ACTIONS = ["generate_image", "ai_image"];
const VIDEO_ACTIONS = ["generate_video", "ai_video"];

export class UsageLimitError extends Error {
  status = 429;
  kind: UsageKind;
  used: number;
  limit: number;

  constructor(kind: UsageKind, used: number, limit: number) {
    super(
      `Monthly ${kind.replace("_", " ")} limit reached (${used}/${limit}). Upgrade or wait for the next billing period.`,
    );
    this.name = "UsageLimitError";
    this.kind = kind;
    this.used = used;
    this.limit = limit;
  }
}

function periodStart(workspace: {
  currentPeriodEnd: Date | null;
}): Date {
  if (workspace.currentPeriodEnd) {
    const end = new Date(workspace.currentPeriodEnd);
    const start = new Date(end);
    start.setMonth(start.getMonth() - 1);
    return start;
  }
  const start = new Date();
  start.setDate(start.getDate() - 30);
  return start;
}

function limitForKind(limits: TierLimits, kind: UsageKind): number {
  switch (kind) {
    case "agent":
      return limits.agentGenerations;
    case "chat":
      return limits.chatMessages;
    case "ai_image":
      return limits.aiImages;
    case "ai_video":
      return limits.aiVideos;
  }
}

async function projectIdsForWorkspace(workspaceId: string): Promise<string[]> {
  const projects = await prisma.project.findMany({
    where: { workspaceId },
    select: { id: true },
  });
  return projects.map((p) => p.id);
}

export async function countWorkspaceUsage(
  workspaceId: string,
  kind: UsageKind,
  since: Date,
): Promise<number> {
  if (kind === "chat") {
    return prisma.message.count({
      where: {
        role: "assistant",
        createdAt: { gte: since },
        conversation: { workspaceId },
      },
    });
  }

  const projectIds = await projectIdsForWorkspace(workspaceId);
  if (!projectIds.length) return 0;

  const actions =
    kind === "agent"
      ? AGENT_ACTIONS
      : kind === "ai_image"
        ? IMAGE_ACTIONS
        : VIDEO_ACTIONS;

  return prisma.aiLog.count({
    where: {
      ok: true,
      createdAt: { gte: since },
      action: { in: actions },
      projectId: { in: projectIds },
    },
  });
}

export async function getWorkspaceUsageSnapshot(workspaceId: string) {
  const workspace = await prisma.workspace.findUnique({
    where: { id: workspaceId },
  });
  if (!workspace) return null;

  const tier = isBillingTier(workspace.subscriptionTier)
    ? workspace.subscriptionTier
    : "free";
  const limits = limitsForTier(tier);
  const since = periodStart(workspace);
  const active = hasActiveSubscription(
    workspace.subscriptionTier,
    workspace.subscriptionStatus,
  );

  const [agent, chat, aiImages, aiVideos, channels] = await Promise.all([
    countWorkspaceUsage(workspaceId, "agent", since),
    countWorkspaceUsage(workspaceId, "chat", since),
    countWorkspaceUsage(workspaceId, "ai_image", since),
    countWorkspaceUsage(workspaceId, "ai_video", since),
    prisma.connectedAccount.count({
      where: { project: { workspaceId } },
    }),
  ]);

  return {
    tier: tier as BillingTier | "free",
    active,
    periodStart: since.toISOString(),
    periodEnd: workspace.currentPeriodEnd?.toISOString() ?? null,
    limits,
    usage: {
      agentGenerations: agent,
      chatMessages: chat,
      aiImages,
      aiVideos,
      channels,
    },
  };
}

/** Throws UsageLimitError when the workspace is over quota for this kind. */
export async function assertUsageAllowed(
  workspaceId: string,
  kind: UsageKind,
  increment = 1,
) {
  const workspace = await prisma.workspace.findUnique({
    where: { id: workspaceId },
  });
  if (!workspace) throw new Error("Workspace not found");

  const limits = limitsForTier(workspace.subscriptionTier);
  const limit = limitForKind(limits, kind);
  if (limit <= 0) {
    throw new UsageLimitError(kind, 0, limit);
  }

  const used = await countWorkspaceUsage(
    workspaceId,
    kind,
    periodStart(workspace),
  );
  if (used + increment > limit) {
    console.log("[usage] limit exceeded", {
      workspaceId,
      kind,
      used,
      limit,
      tier: workspace.subscriptionTier,
    });
    throw new UsageLimitError(kind, used, limit);
  }

  console.log("[usage] allowed", {
    workspaceId,
    kind,
    used,
    limit,
    remaining: limit - used,
  });
}

export async function workspaceIdForProject(projectId: string) {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { workspaceId: true },
  });
  return project?.workspaceId ?? null;
}
