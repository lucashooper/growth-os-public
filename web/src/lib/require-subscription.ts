import "server-only";

import { prisma } from "@/lib/db";
import { AuthError, requireUser } from "@/lib/auth";
import { hasActiveSubscription } from "@/lib/billing-access";

export class SubscriptionRequiredError extends AuthError {
  constructor() {
    super("Active subscription required", 402);
  }
}

export async function requireActiveSubscription() {
  const user = await requireUser();
  const member = await prisma.workspaceMember.findFirst({
    where: { userId: user.id },
    include: { workspace: true },
    orderBy: { createdAt: "asc" },
  });
  const workspace = member?.workspace;
  if (
    !workspace ||
    !hasActiveSubscription(
      workspace.subscriptionTier,
      workspace.subscriptionStatus,
    )
  ) {
    throw new SubscriptionRequiredError();
  }
  return { user, workspace };
}
