import "server-only";
import type Stripe from "stripe";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import {
  getStripe,
  isBillingTier,
  periodEndFromSubscription,
  tierFromProductId,
  type BillingTier,
} from "@/lib/stripe";

const LIVE_STATUSES = new Set(["active", "trialing", "past_due"]);

function productIdFromSubscription(sub: Stripe.Subscription) {
  const product = sub.items.data[0]?.price?.product;
  if (!product) return null;
  return typeof product === "string" ? product : product.id;
}

function resolveTier(
  sub: Stripe.Subscription,
  deleted: boolean,
): BillingTier | "free" {
  if (deleted) return "free";
  const metaTier = sub.metadata?.tier;
  const productTier = tierFromProductId(productIdFromSubscription(sub));
  if (isBillingTier(metaTier || "")) return metaTier as BillingTier;
  return productTier || "creator";
}

export async function applySubscriptionToWorkspace(
  sub: Stripe.Subscription,
  deleted = false,
) {
  const workspaceId =
    sub.metadata?.workspaceId ||
    (await prisma.workspace.findFirst({
      where: { stripeCustomerId: String(sub.customer) },
      select: { id: true },
    }))?.id;

  if (!workspaceId) {
    logger.warn("api", "Subscription sync had no workspace", {
      subscriptionId: sub.id,
    });
    return null;
  }

  const tier = resolveTier(sub, deleted);

  await prisma.workspace.update({
    where: { id: workspaceId },
    data: {
      stripeSubscriptionId: deleted ? null : sub.id,
      subscriptionTier: deleted ? "free" : tier,
      subscriptionStatus: deleted ? "canceled" : sub.status,
      currentPeriodEnd: deleted ? null : periodEndFromSubscription(sub),
      ...(deleted ? {} : { stripeCustomerId: String(sub.customer) }),
    },
  });

  console.log("[stripe/billing-sync] applySubscription", {
    workspaceId,
    subscriptionId: sub.id,
    deleted,
    tier,
    status: deleted ? "canceled" : sub.status,
  });

  return workspaceId;
}

export async function syncCheckoutSession(
  sessionId: string,
  expectedWorkspaceId: string,
) {
  const stripe = getStripe();
  const session = await stripe.checkout.sessions.retrieve(sessionId, {
    expand: ["subscription", "subscription.items.data.price.product"],
  });

  const sessionWorkspaceId =
    session.metadata?.workspaceId || session.client_reference_id || "";
  if (sessionWorkspaceId !== expectedWorkspaceId) {
    throw new Error("Checkout session does not belong to this workspace");
  }

  if (session.status !== "complete") {
    console.log("[stripe/billing-sync] checkout session not complete", {
      sessionId,
      status: session.status,
    });
    return null;
  }

  const rawSub = session.subscription;
  if (!rawSub) {
    console.log("[stripe/billing-sync] checkout session has no subscription", {
      sessionId,
    });
    return null;
  }

  let sub: Stripe.Subscription;
  if (typeof rawSub === "string") {
    sub = await stripe.subscriptions.retrieve(rawSub, {
      expand: ["items.data.price.product"],
    });
  } else {
    sub = rawSub;
  }

  const tier = session.metadata?.tier || sub.metadata?.tier || "creator";
  const trialWasOffered = session.metadata?.trialOffered === "1";
  const userId =
    session.metadata?.userId ||
    (await (
      await import("@/services/trial-fingerprints")
    ).userIdForWorkspace(expectedWorkspaceId)) ||
    "";

  if (!sub.metadata?.workspaceId) {
    await stripe.subscriptions.update(sub.id, {
      metadata: {
        ...sub.metadata,
        workspaceId: expectedWorkspaceId,
        tier,
        userId,
        trialOffered: trialWasOffered ? "1" : "0",
      },
    });
  }

  if (userId) {
    const { enforceTrialFingerprintOnSubscription } = await import(
      "@/services/trial-fingerprints"
    );
    await enforceTrialFingerprintOnSubscription({
      subscription: sub,
      userId,
      workspaceId: expectedWorkspaceId,
      trialWasOffered,
    });
    sub = await stripe.subscriptions.retrieve(sub.id, {
      expand: ["items.data.price.product", "default_payment_method"],
    });
  }

  await applySubscriptionToWorkspace({
    ...sub,
    metadata: {
      ...sub.metadata,
      workspaceId: expectedWorkspaceId,
      tier,
    },
  });

  console.log("[stripe/billing-sync] checkout session synced", {
    sessionId,
    workspaceId: expectedWorkspaceId,
    subscriptionId: sub.id,
    status: sub.status,
    tier,
    trialWasOffered,
  });

  return sub;
}

export async function cancelStripeSubscriptionForWorkspace(workspace: {
  id: string;
  stripeSubscriptionId: string | null;
  subscriptionStatus: string | null;
}) {
  const subId = workspace.stripeSubscriptionId;
  if (!subId) {
    console.log("[stripe/cancel] no subscription on workspace", {
      workspaceId: workspace.id,
    });
    return { canceled: false, reason: "no_subscription" as const };
  }

  if (!LIVE_STATUSES.has(workspace.subscriptionStatus || "")) {
    console.log("[stripe/cancel] subscription not billable — skipping API cancel", {
      workspaceId: workspace.id,
      subscriptionId: subId,
      status: workspace.subscriptionStatus,
    });
    return { canceled: false, reason: "not_live" as const };
  }

  try {
    await getStripe().subscriptions.cancel(subId);
    console.log("[stripe/cancel] subscription canceled", {
      workspaceId: workspace.id,
      subscriptionId: subId,
    });
    return { canceled: true as const };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const benign =
      message.includes("No such subscription") ||
      message.includes("already been canceled") ||
      message.includes("canceled subscription");

    if (benign) {
      console.log("[stripe/cancel] subscription already canceled or missing", {
        workspaceId: workspace.id,
        subscriptionId: subId,
        message,
      });
      return { canceled: false, reason: "already_canceled" as const };
    }

    console.warn("[stripe/cancel] Stripe cancel failed (continuing deletion)", {
      workspaceId: workspace.id,
      subscriptionId: subId,
      message,
    });
    return { canceled: false, reason: "error" as const, message };
  }
}

export async function handleStripeWebhookEvent(event: Stripe.Event) {
  console.log("[stripe/webhook] event", { type: event.type, id: event.id });

  switch (event.type) {
    case "customer.subscription.created":
    case "customer.subscription.updated":
      await applySubscriptionToWorkspace(event.data.object as Stripe.Subscription);
      break;
    case "customer.subscription.deleted":
      await applySubscriptionToWorkspace(
        event.data.object as Stripe.Subscription,
        true,
      );
      break;
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      if (session.subscription && session.metadata?.workspaceId) {
        const workspaceId = session.metadata.workspaceId;
        const tier = session.metadata.tier || "creator";
        const trialWasOffered = session.metadata.trialOffered === "1";
        const userId =
          session.metadata.userId ||
          (await (
            await import("@/services/trial-fingerprints")
          ).userIdForWorkspace(workspaceId)) ||
          "";

        const sub = await getStripe().subscriptions.retrieve(
          String(session.subscription),
          { expand: ["items.data.price.product", "default_payment_method"] },
        );
        if (!sub.metadata?.workspaceId) {
          await getStripe().subscriptions.update(sub.id, {
            metadata: {
              ...sub.metadata,
              workspaceId,
              tier,
              userId,
              trialOffered: trialWasOffered ? "1" : "0",
            },
          });
        }

        if (userId) {
          const { enforceTrialFingerprintOnSubscription } = await import(
            "@/services/trial-fingerprints"
          );
          await enforceTrialFingerprintOnSubscription({
            subscription: sub,
            userId,
            workspaceId,
            trialWasOffered,
          });
          // Re-fetch after possible trial_end mutation
          const refreshed = await getStripe().subscriptions.retrieve(sub.id, {
            expand: ["items.data.price.product"],
          });
          await applySubscriptionToWorkspace({
            ...refreshed,
            metadata: {
              ...refreshed.metadata,
              workspaceId,
              tier: tier || refreshed.metadata?.tier || "creator",
            },
          });
        } else {
          await applySubscriptionToWorkspace({
            ...sub,
            metadata: {
              ...sub.metadata,
              workspaceId,
              tier: tier || sub.metadata?.tier || "creator",
            },
          });
        }
      }
      break;
    }
    case "customer.subscription.trial_will_end":
      // Informational — no fingerprint action required
      break;
    default:
      break;
  }
}
