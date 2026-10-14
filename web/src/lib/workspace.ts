import "server-only";

import { prisma } from "@/lib/db";
import { requireUser, listUserWorkspaceIds } from "@/lib/auth";

/** Return the caller's primary workspace (first membership). */
export async function ensureWorkspace() {
  const user = await requireUser();
  const workspaceIds = await listUserWorkspaceIds(user.id);
  if (!workspaceIds.length) {
    throw new Error("No workspace for user");
  }

  const workspace = await prisma.workspace.findFirst({
    where: { id: { in: workspaceIds } },
    include: { projects: { orderBy: { createdAt: "asc" } } },
    orderBy: { createdAt: "asc" },
  });

  if (!workspace) throw new Error("Workspace not found");
  return workspace;
}
