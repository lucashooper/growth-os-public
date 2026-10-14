import "server-only";

import type Stripe from "stripe";
import { prisma } from "@/lib/db";
import { getStripe } from "@/lib/stripe";

const PAID_LIVE = new Set(["active", "past_due"]);

/** Prisma P2021: the UsedTrialFingerprint table hasn't been created in this DB yet. */
function isMissingTableError(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    (err as { code?: unknown }).code === "P2021"
  );
}

function warnMissingTable(where: string) {
  console.error(
    `[trial-fingerprint] UsedTrialFingerprint table missing (${where}) — run prisma/migrations/20260831200000_used_trial_fingerprints/migration.sql against the database`,
  );
}

export type TrialEligibility = {
  eligible: boolean;
  reason:
    | "eligible"
    | "user_already_claimed"
    | "card_fingerprint_used"
    | "workspace_already_subscribed"
    | "no_fingerprint_yet";
  matchingFingerprint?: string;
};

/**
 * Decide whether a new Checkout session may include trial_period_days.
 * Existing live paid subscribers are never evaluated here (checkout upgrades
 * go through subscription.update without a trial).
 */
export async function evaluateTrialEligibility(opts: {
  userId: string;
  workspaceId: string;
  stripeCustomerId: string | null;
  subscriptionStatus: string | null;
  stripeSubscriptionId: string | null;
}): Promise<TrialEligibility> {
  const status = opts.subscriptionStatus || "inactive";

  // Already on a live paid plan — upgrades shouldn't offer a fresh trial.
  if (PAID_LIVE.has(status) || status === "trialing") {
    console.log("[trial-fingerprint] workspace already subscribed — no trial", {
      workspaceId: opts.workspaceId,
      status,
    });
    return { eligible: false, reason: "workspace_already_subscribed" };
  }

  let userClaim: { cardFingerprint: string } | null;
  try {
    userClaim = await prisma.usedTrialFingerprint.findFirst({
      where: { userId: opts.userId },
      select: { cardFingerprint: true },
    });
  } catch (err) {
    if (!isMissingTableError(err)) throw err;
    // Don't block checkout on missing anti-abuse storage; just skip the trial.
    warnMissingTable("evaluateTrialEligibility");
    return { eligible: false, reason: "user_already_claimed" };
  }
  if (userClaim) {
    console.log("[trial-fingerprint] user already claimed a trial", {
      userId: opts.userId,
      fingerprint: userClaim.cardFingerprint,
    });
    return {
      eligible: false,
      reason: "user_already_claimed",
      matchingFingerprint: userClaim.cardFingerprint,
    };
  }

  if (!opts.stripeCustomerId) {
    return { eligible: true, reason: "no_fingerprint_yet" };
  }

  try {
    const stripe = getStripe();
    const methods = await stripe.paymentMethods.list({
      customer: opts.stripeCustomerId,
      type: "card",
      limit: 20,
    });

    for (const pm of methods.data) {
      const fingerprint = pm.card?.fingerprint;
      if (!fingerprint) continue;

      const existing = await prisma.usedTrialFingerprint.findUnique({
        where: { cardFingerprint: fingerprint },
      });
      if (existing && existing.userId !== opts.userId) {
        console.log("[trial-fingerprint] card already used for trial on another account", {
          fingerprint,
          priorUserId: existing.userId,
          currentUserId: opts.userId,
        });
        return {
          eligible: false,
          reason: "card_fingerprint_used",
          matchingFingerprint: fingerprint,
        };
      }
    }
  } catch (err) {
    console.warn("[trial-fingerprint] payment method lookup failed (allowing trial)", {
      message: err instanceof Error ? err.message : String(err),
      customerId: opts.stripeCustomerId,
    });
  }

  return { eligible: true, reason: "eligible" };
}

export async function fingerprintFromPaymentMethodId(
  paymentMethodId: string | null | undefined,
): Promise<string | null> {
  if (!paymentMethodId) return null;
  try {
    const pm = await getStripe().paymentMethods.retrieve(paymentMethodId);
    return pm.card?.fingerprint || null;
  } catch (err) {
    console.warn("[trial-fingerprint] failed to retrieve payment method", {
      paymentMethodId,
      message: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

export async function fingerprintFromSubscription(
  sub: Stripe.Subscription,
): Promise<string | null> {
  const pmRef = sub.default_payment_method;
  const pmId = typeof pmRef === "string" ? pmRef : pmRef?.id;
  if (pmId) return fingerprintFromPaymentMethodId(pmId);

  // Fallback: customer's invoice settings / default source is less reliable;
  // list recent card PMs on the customer.
  const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer?.id;
  if (!customerId) return null;
  try {
    const methods = await getStripe().paymentMethods.list({
      customer: customerId,
      type: "card",
      limit: 5,
    });
    return methods.data[0]?.card?.fingerprint || null;
  } catch {
    return null;
  }
}

export async function fingerprintFromCheckoutSession(
  session: Stripe.Checkout.Session,
): Promise<string | null> {
  const stripe = getStripe();

  // Subscription Checkout usually stores the PM on the subscription / setup_intent.
  if (session.setup_intent) {
    const siId =
      typeof session.setup_intent === "string"
        ? session.setup_intent
        : session.setup_intent.id;
    try {
      const si = await stripe.setupIntents.retrieve(siId);
      const pmId =
        typeof si.payment_method === "string"
          ? si.payment_method
          : si.payment_method?.id;
      const fp = await fingerprintFromPaymentMethodId(pmId);
      if (fp) return fp;
    } catch (err) {
      console.warn("[trial-fingerprint] setup_intent lookup failed", {
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  if (session.payment_intent) {
    const piId =
      typeof session.payment_intent === "string"
        ? session.payment_intent
        : session.payment_intent.id;
    try {
      const pi = await stripe.paymentIntents.retrieve(piId);
      const pmId =
        typeof pi.payment_method === "string"
          ? pi.payment_method
          : pi.payment_method?.id;
      const fp = await fingerprintFromPaymentMethodId(pmId);
      if (fp) return fp;
    } catch (err) {
      console.warn("[trial-fingerprint] payment_intent lookup failed", {
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  if (session.subscription) {
    const subId =
      typeof session.subscription === "string"
        ? session.subscription
        : session.subscription.id;
    try {
      const sub = await stripe.subscriptions.retrieve(subId, {
        expand: ["default_payment_method"],
      });
      return fingerprintFromSubscription(sub);
    } catch {
      return null;
    }
  }

  return null;
}

/**
 * Record a trial claim for this card. Idempotent per fingerprint.
 * Same user refreshing lastUsedAt is fine; different user is blocked upstream.
 */
export async function recordTrialFingerprint(opts: {
  fingerprint: string;
  userId: string;
  workspaceId: string;
  stripeCustomerId?: string;
}) {
  const existing = await prisma.usedTrialFingerprint.findUnique({
    where: { cardFingerprint: opts.fingerprint },
  });

  if (existing) {
    if (existing.userId !== opts.userId) {
      console.warn("[trial-fingerprint] record skipped — fingerprint owned by another user", {
        fingerprint: opts.fingerprint,
        ownerUserId: existing.userId,
        attemptedUserId: opts.userId,
      });
      return { recorded: false as const, conflict: true as const, existing };
    }
    await prisma.usedTrialFingerprint.update({
      where: { cardFingerprint: opts.fingerprint },
      data: {
        lastUsedAt: new Date(),
        workspaceId: opts.workspaceId || existing.workspaceId,
        stripeCustomerId: opts.stripeCustomerId || existing.stripeCustomerId,
      },
    });
    console.log("[trial-fingerprint] refreshed claim", {
      fingerprint: opts.fingerprint,
      userId: opts.userId,
    });
    return { recorded: true as const, conflict: false as const, existing };
  }

  await prisma.usedTrialFingerprint.create({
    data: {
      cardFingerprint: opts.fingerprint,
      userId: opts.userId,
      workspaceId: opts.workspaceId,
      stripeCustomerId: opts.stripeCustomerId || "",
    },
  });
  console.log("[trial-fingerprint] recorded new trial claim", {
    fingerprint: opts.fingerprint,
    userId: opts.userId,
    workspaceId: opts.workspaceId,
  });
  return { recorded: true as const, conflict: false as const };
}

/**
 * After checkout: if the subscription is trialing on a reused card, end the trial
 * immediately so the first month bills now. Never cancels active paying subs that
 * are only updating payment methods (those aren't trialing + new claims).
 */
export async function enforceTrialFingerprintOnSubscription(opts: {
  subscription: Stripe.Subscription;
  userId: string;
  workspaceId: string;
  trialWasOffered: boolean;
}) {
  try {
    return await enforceTrialFingerprint(opts);
  } catch (err) {
    if (!isMissingTableError(err)) throw err;
    // Billing sync must still complete when the anti-abuse table is missing.
    warnMissingTable("enforceTrialFingerprintOnSubscription");
    return { action: "table_missing" as const };
  }
}

async function enforceTrialFingerprint(opts: {
  subscription: Stripe.Subscription;
  userId: string;
  workspaceId: string;
  trialWasOffered: boolean;
}) {
  const sub = opts.subscription;
  const fingerprint = await fingerprintFromSubscription(sub);
  const customerId =
    typeof sub.customer === "string" ? sub.customer : sub.customer?.id || "";

  console.log("[trial-fingerprint] post-checkout check", {
    subscriptionId: sub.id,
    status: sub.status,
    fingerprint,
    trialWasOffered: opts.trialWasOffered,
    userId: opts.userId,
    workspaceId: opts.workspaceId,
  });

  if (!fingerprint) {
    console.warn("[trial-fingerprint] no fingerprint on subscription — cannot record");
    return { action: "no_fingerprint" as const };
  }

  const existing = await prisma.usedTrialFingerprint.findUnique({
    where: { cardFingerprint: fingerprint },
  });

  const isTrialing = sub.status === "trialing" || Boolean(sub.trial_end);

  // Paying subscriber (active) updating card / recreating — never block.
  if (sub.status === "active" && !isTrialing) {
    console.log("[trial-fingerprint] active paid sub — skip trial enforcement", {
      subscriptionId: sub.id,
    });
    return { action: "skip_paid" as const, fingerprint };
  }

  if (existing && existing.userId !== opts.userId && isTrialing) {
    console.warn(
      "[trial-fingerprint] ABUSE: trial on card already used by another account — ending trial now",
      {
        fingerprint,
        priorUserId: existing.userId,
        currentUserId: opts.userId,
        subscriptionId: sub.id,
      },
    );
    try {
      await getStripe().subscriptions.update(sub.id, {
        trial_end: "now",
        metadata: {
          ...sub.metadata,
          trialDeniedFingerprint: fingerprint,
          trialDeniedReason: "card_fingerprint_already_used",
        },
      });
    } catch (err) {
      console.error("[trial-fingerprint] failed to end abusive trial", {
        subscriptionId: sub.id,
        message: err instanceof Error ? err.message : String(err),
      });
    }
    return { action: "trial_ended" as const, fingerprint };
  }

  if (opts.trialWasOffered || isTrialing) {
    await recordTrialFingerprint({
      fingerprint,
      userId: opts.userId,
      workspaceId: opts.workspaceId,
      stripeCustomerId: customerId,
    });
    return { action: "recorded" as const, fingerprint };
  }

  return { action: "noop" as const, fingerprint };
}

export async function userIdForWorkspace(workspaceId: string): Promise<string | null> {
  const owner = await prisma.workspaceMember.findFirst({
    where: { workspaceId, role: "Owner" },
    orderBy: { createdAt: "asc" },
    select: { userId: true },
  });
  if (owner) return owner.userId;
  const any = await prisma.workspaceMember.findFirst({
    where: { workspaceId },
    orderBy: { createdAt: "asc" },
    select: { userId: true },
  });
  return any?.userId ?? null;
}
