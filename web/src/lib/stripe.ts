import "server-only";
import Stripe from "stripe";
import { BILLING_TIERS, type BillingTier } from "@/lib/billing-plans";

export { BILLING_TIERS, isBillingTier, isPaidTier, type BillingTier } from "@/lib/billing-plans";

let stripeClient: Stripe | null = null;

export function getStripe() {
  const key = (process.env.STRIPE_SECRET_KEY || "").trim();
  if (!key) throw new Error("STRIPE_SECRET_KEY is not set");
  if (!stripeClient) {
    stripeClient = new Stripe(key);
  }
  return stripeClient;
}

export function originFromRequest(req: Request) {
  const header = req.headers.get("origin");
  if (header) return header.replace(/\/$/, "");
  try {
    const url = new URL(req.url);
    if (url.hostname === "localhost" || url.hostname === "127.0.0.1") {
      return url.origin;
    }
  } catch {
    /* ignore */
  }
  const env =
    process.env.NEXT_PUBLIC_APP_BASE_URL || process.env.APP_BASE_URL;
  if (env) return env.replace(/\/$/, "");
  return new URL(req.url).origin;
}

export function tierFromProductId(productId: string | null | undefined): BillingTier | null {
  if (!productId) return null;
  for (const [tier, meta] of Object.entries(BILLING_TIERS)) {
    if (meta.productId === productId) return tier as BillingTier;
  }
  return null;
}

export async function priceIdForTier(tier: BillingTier) {
  const envPrice =
    process.env[`STRIPE_PRICE_${tier.toUpperCase()}`] ||
    (tier === "pro" ? process.env.STRIPE_PRICE_ID_PRO : undefined);
  if (envPrice) return envPrice;

  const stripe = getStripe();
  const productEnv = `STRIPE_PRODUCT_${tier.toUpperCase()}`;
  const productId =
    process.env[productEnv] || BILLING_TIERS[tier].productId;
  if (!productId) {
    throw new Error(
      `Set ${productEnv} to the Stripe product id for the ${tier} plan`,
    );
  }
  const prices = await stripe.prices.list({
    product: productId,
    active: true,
    type: "recurring",
    limit: 10,
  });
  const monthly = prices.data.find(
    (p) => p.recurring?.interval === "month" && (p.recurring.interval_count || 1) === 1,
  );
  const price = monthly || prices.data[0];
  if (!price) {
    throw new Error(`No active recurring price for ${tier} (${productId})`);
  }
  return price.id;
}

export function periodEndFromSubscription(sub: Stripe.Subscription) {
  const itemEnd = sub.items.data[0]?.current_period_end;
  const unix = itemEnd;
  return unix ? new Date(unix * 1000) : null;
}
