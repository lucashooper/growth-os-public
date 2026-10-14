import "server-only";
import { createClient } from "@supabase/supabase-js";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import { cancelStripeSubscriptionForWorkspace } from "@/lib/stripe-billing-sync";

function supabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/**
 * Cancel Stripe billing and delete workspaces owned solely by this user.
 * Shared workspaces (other members) are left intact — membership is removed via user delete.
 */
export async function deleteUserAccount(userId: string) {
  console.log("[account/delete] starting", { userId });

  const memberships = await prisma.workspaceMember.findMany({
    where: { userId },
    include: { workspace: true },
  });

  for (const membership of memberships) {
    const memberCount = await prisma.workspaceMember.count({
      where: { workspaceId: membership.workspaceId },
    });
    const soleMember = memberCount === 1;
    const isOwner = membership.role === "Owner";

    if (soleMember || isOwner) {
      await cancelStripeSubscriptionForWorkspace(membership.workspace);
    }

    if (soleMember) {
      console.log("[account/delete] deleting sole-member workspace", {
        workspaceId: membership.workspaceId,
      });
      await prisma.workspace.delete({ where: { id: membership.workspaceId } });
    }
  }

  await prisma.user.delete({ where: { id: userId } });
  console.log("[account/delete] prisma user removed", { userId });

  const admin = supabaseAdmin();
  if (admin) {
    const { error } = await admin.auth.admin.deleteUser(userId);
    if (error) {
      console.warn("[account/delete] Supabase auth delete failed", {
        userId,
        message: error.message,
      });
      logger.warn("api", "Supabase auth user delete failed", {
        userId,
        message: error.message,
      });
    } else {
      console.log("[account/delete] Supabase auth user removed", { userId });
    }
  } else {
    console.log("[account/delete] skipping Supabase auth delete (no service role key)");
  }

  logger.info("api", "Account deleted", { userId });
}

export async function deleteWorkspaceForUser(workspaceId: string, userId: string) {
  console.log("[workspace/delete] starting", { workspaceId, userId });

  const membership = await prisma.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId, userId } },
    include: { workspace: true },
  });
  if (!membership) {
    throw new Error("Workspace not found");
  }
  if (membership.role !== "Owner") {
    throw new Error("Only workspace owners can delete a workspace");
  }

  await cancelStripeSubscriptionForWorkspace(membership.workspace);
  await prisma.workspace.delete({ where: { id: workspaceId } });

  console.log("[workspace/delete] workspace removed", { workspaceId, userId });
  logger.info("api", "Workspace deleted", { workspaceId, userId });
}
