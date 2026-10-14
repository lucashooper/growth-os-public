import { prisma } from "@/lib/db";
import { fail, ok } from "@/lib/api-response";
import { AuthError, requireUser } from "@/lib/auth";
import { withApi } from "@/lib/api-route";
import { BILLING_TIERS, isPaidTier, TIER_LIMITS } from "@/lib/billing-plans";
import { hasActiveSubscription } from "@/lib/billing-access";
import { syncCheckoutSession } from "@/lib/stripe-billing-sync";
import { getWorkspaceUsageSnapshot } from "@/services/usage";

export const runtime = "nodejs";

async function handleGET(req: Request) {
  try {
    const user = await requireUser();
    const sessionId = new URL(req.url).searchParams.get("session_id")?.trim();

    if (sessionId) {
      const member = await prisma.workspaceMember.findFirst({
        where: { userId: user.id },
        include: { workspace: true },
        orderBy: { createdAt: "asc" },
      });
      const syncWorkspace = member?.workspace;
      if (!syncWorkspace) return fail("No workspace found", 404);

      console.log("[api/billing] syncing checkout session", {
        sessionId,
        workspaceId: syncWorkspace.id,
      });
      try {
        await syncCheckoutSession(sessionId, syncWorkspace.id);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.warn("[api/billing] session sync failed", {
          sessionId,
          workspaceId: syncWorkspace.id,
          message,
        });
      }
    }

    const member = await prisma.workspaceMember.findFirst({
      where: { userId: user.id },
      include: { workspace: true },
      orderBy: { createdAt: "asc" },
    });
    const workspace = member?.workspace;
    if (!workspace) return fail("No workspace found", 404);

    const billing = {
      tier: workspace.subscriptionTier || "free",
      status: workspace.subscriptionStatus || "inactive",
      currentPeriodEnd: workspace.currentPeriodEnd,
      hasCustomer: Boolean(workspace.stripeCustomerId),
      paid: isPaidTier(workspace.subscriptionTier),
      active: hasActiveSubscription(
        workspace.subscriptionTier,
        workspace.subscriptionStatus,
      ),
    };

    const usage = await getWorkspaceUsageSnapshot(workspace.id);

    console.log("[api/billing] status", {
      workspaceId: workspace.id,
      tier: billing.tier,
      status: billing.status,
      active: billing.active,
      stripeSubscriptionId: workspace.stripeSubscriptionId,
      sessionSync: Boolean(sessionId),
      usage: usage?.usage,
    });

    return ok({
      billing,
      usage,
      limits: TIER_LIMITS,
      plans: Object.entries(BILLING_TIERS).map(([id, plan]) => ({
        id,
        name: plan.name,
        priceLabel: plan.priceLabel,
        blurb: plan.blurb,
      })),
    });
  } catch (err) {
    if (err instanceof AuthError) return fail(err.message, err.status);
    return fail(err);
  }
}

export const GET = withApi(handleGET, "GET src/app/api/billing/route.ts");
