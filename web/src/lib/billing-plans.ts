/** Plan entitlements + monthly AI quotas (calendar period from Stripe). */

/** Static env reads so Next can inline NEXT_PUBLIC_* into the client bundle. */
function firstSet(...values: Array<string | undefined>): string {
  for (const value of values) {
    const trimmed = value?.trim();
    if (trimmed) return trimmed;
  }
  return "";
}

export const BILLING_TIERS = {
  creator: {
    productId: firstSet(
      process.env.NEXT_PUBLIC_STRIPE_PRODUCT_CREATOR,
      process.env.STRIPE_PRODUCT_CREATOR,
    ),
    name: "Creator",
    priceLabel: "$24",
    blurb: "5 channels · 150 agent gens · 500 chat msgs / mo",
  },
  team: {
    productId: firstSet(
      process.env.NEXT_PUBLIC_STRIPE_PRODUCT_TEAM,
      process.env.STRIPE_PRODUCT_TEAM,
    ),
    name: "Team",
    priceLabel: "$34",
    blurb: "10 channels · 400 agent gens · 1,500 chat msgs · 100 AI images / mo",
  },
  pro: {
    productId: firstSet(
      process.env.NEXT_PUBLIC_STRIPE_PRODUCT_PRO,
      process.env.STRIPE_PRODUCT_PRO,
    ),
    name: "Pro",
    priceLabel: "$44",
    blurb: "30 channels · 800 agent gens · 3,000 chat msgs · 300 AI images / mo",
  },
  agency: {
    productId: firstSet(
      process.env.NEXT_PUBLIC_STRIPE_PRODUCT_AGENCY,
      process.env.STRIPE_PRODUCT_AGENCY,
    ),
    name: "Agency",
    priceLabel: "$89",
    blurb: "100 channels · 2,000 agent gens · 8,000 chat msgs · 500 AI images / mo",
  },
} as const;

export type BillingTier = keyof typeof BILLING_TIERS;

/**
 * Monthly hard limits per paid tier.
 * Sized for healthy margin on Groq (default Qwen 3.6 27B ≈ $0.60 in / $3.00 out per 1M tokens;
 * Llama 3.3 70B ≈ $0.59 / $0.79). Rough COGS at full Pro use ≈ $8–12 vs $44 revenue.
 */
export type TierLimits = {
  channels: number;
  agentGenerations: number;
  chatMessages: number;
  aiImages: number;
  aiVideos: number;
};

export const TIER_LIMITS: Record<BillingTier | "free", TierLimits> = {
  free: {
    channels: 0,
    agentGenerations: 0,
    chatMessages: 0,
    aiImages: 0,
    aiVideos: 0,
  },
  creator: {
    channels: 5,
    agentGenerations: 150,
    chatMessages: 500,
    aiImages: 50,
    aiVideos: 5,
  },
  team: {
    channels: 10,
    agentGenerations: 400,
    chatMessages: 1500,
    aiImages: 100,
    aiVideos: 10,
  },
  pro: {
    channels: 30,
    agentGenerations: 800,
    chatMessages: 3000,
    aiImages: 300,
    aiVideos: 30,
  },
  agency: {
    channels: 100,
    agentGenerations: 2000,
    chatMessages: 8000,
    aiImages: 500,
    aiVideos: 60,
  },
};

export function limitsForTier(tier: string | null | undefined): TierLimits {
  if (tier && tier in TIER_LIMITS) {
    return TIER_LIMITS[tier as BillingTier | "free"];
  }
  return TIER_LIMITS.free;
}

export function isBillingTier(value: string | null | undefined): value is BillingTier {
  return Boolean(value && value in BILLING_TIERS);
}

export function isPaidTier(tier: string | null | undefined) {
  return Boolean(tier && tier !== "free" && isBillingTier(tier));
}

export const PAID_STATUSES = new Set(["active", "trialing", "past_due"]);

/** Public Stripe Customer Portal login (email magic link). Empty until configured. */
export const STRIPE_CUSTOMER_PORTAL_LOGIN = firstSet(
  process.env.NEXT_PUBLIC_STRIPE_CUSTOMER_PORTAL_URL,
);
