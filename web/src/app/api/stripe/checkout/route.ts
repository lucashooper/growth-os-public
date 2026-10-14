import { prisma } from "@/lib/db";
import { fail, ok } from "@/lib/api-response";
import { AuthError, requireUser } from "@/lib/auth";
import { withApi } from "@/lib/api-route";
import {
  BILLING_TIERS,
  getStripe,
  isBillingTier,
  originFromRequest,
  priceIdForTier,
} from "@/lib/stripe";
import { evaluateTrialEligibility } from "@/services/trial-fingerprints";

export const runtime = "nodejs";

async function workspaceForUser(userId: string) {
  const member = await prisma.workspaceMember.findFirst({
    where: { userId },
    include: { workspace: true },
    orderBy: { createdAt: "asc" },
  });
  return member?.workspace ?? null;
}

async function handlePOST(req: Request) {
  try {
    const user = await requireUser();
    const body = (await req.json().catch(() => ({}))) as { tier?: string };
    const requested = body.tier || "";
    const tier = isBillingTier(requested) ? requested : "creator";
    const workspace = await workspaceForUser(user.id);
    if (!workspace) return fail("No workspace found", 400);

    const stripe = getStripe();
    let customerId = workspace.stripeCustomerId;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email,
        name: user.name || undefined,
        metadata: { workspaceId: workspace.id, userId: user.id },
      });
      customerId = customer.id;
      await prisma.workspace.update({
        where: { id: workspace.id },
        data: { stripeCustomerId: customerId },
      });
    }

    const price = await priceIdForTier(tier);
    const origin = originFromRequest(req);

    const liveStatuses = new Set(["active", "trialing", "past_due"]);
    if (
      workspace.stripeSubscriptionId &&
      liveStatuses.has(workspace.subscriptionStatus || "")
    ) {
      try {
        const existing = await stripe.subscriptions.retrieve(
          workspace.stripeSubscriptionId,
        );
        const itemId = existing.items.data[0]?.id;
        if (itemId && !existing.canceled_at) {
          // Plan switches for paying / trialing subscribers — never re-offer a trial.
          await stripe.subscriptions.update(existing.id, {
            items: [{ id: itemId, price }],
            metadata: { workspaceId: workspace.id, tier },
            proration_behavior: "create_prorations",
          });
          console.log("[stripe/checkout] plan switch (no trial)", {
            workspaceId: workspace.id,
            subscriptionId: existing.id,
            tier,
          });
          return ok({ url: `${origin}/billing?updated=true` });
        }
      } catch {
        /* Subscription missing in Stripe — start a fresh Checkout session. */
      }
    }

    const trial = await evaluateTrialEligibility({
      userId: user.id,
      workspaceId: workspace.id,
      stripeCustomerId: customerId,
      subscriptionStatus: workspace.subscriptionStatus,
      stripeSubscriptionId: workspace.stripeSubscriptionId,
    });

    // Known reused card before checkout → refuse promotional trial with a clear error.
    // (User can still subscribe without trial via a no-trial session below when reason
    // is workspace/user claim; for cross-account card reuse we return the clean error.)
    if (trial.reason === "card_fingerprint_used") {
      console.warn("[stripe/checkout] blocked trial — card fingerprint reused", {
        userId: user.id,
        workspaceId: workspace.id,
        fingerprint: trial.matchingFingerprint,
      });
      return fail(
        "This payment method has already been used for a promotional trial.",
        400,
      );
    }

    const offerTrial = trial.eligible;
    console.log("[stripe/checkout] creating session", {
      workspaceId: workspace.id,
      userId: user.id,
      tier,
      offerTrial,
      trialReason: trial.reason,
    });

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      payment_method_types: ["card"],
      line_items: [{ price, quantity: 1 }],
      mode: "subscription",
      allow_promotion_codes: true,
      success_url: `${origin}/billing?success=true&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/billing?canceled=true`,
      subscription_data: {
        ...(offerTrial ? { trial_period_days: 7 } : {}),
        metadata: {
          workspaceId: workspace.id,
          tier,
          userId: user.id,
          trialOffered: offerTrial ? "1" : "0",
          trialEligibilityReason: trial.reason,
        },
      },
      metadata: {
        workspaceId: workspace.id,
        tier,
        userId: user.id,
        trialOffered: offerTrial ? "1" : "0",
        trialEligibilityReason: trial.reason,
      },
      client_reference_id: workspace.id,
    });

    if (!session.url) return fail("Stripe did not return a checkout URL", 502);
    return ok({
      url: session.url,
      tier: BILLING_TIERS[tier].name,
      trialOffered: offerTrial,
      trialReason: trial.reason,
    });
  } catch (err) {
    if (err instanceof AuthError) return fail(err.message, err.status);
    return fail(err);
  }
}

export const POST = withApi(handlePOST, "POST src/app/api/stripe/checkout/route.ts");
