import { isPaidTier, PAID_STATUSES, type BillingTier } from "@/lib/billing-plans";

export function hasActiveSubscription(
  tier: string | null | undefined,
  status: string | null | undefined,
): boolean {
  return isPaidTier(tier) && PAID_STATUSES.has(status || "");
}

export function billingRedirectPath(tier?: BillingTier | null) {
  if (tier) return `/billing?tier=${tier}`;
  return "/billing";
}
