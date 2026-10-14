import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { logger } from "@/lib/logger";
import { getStripe } from "@/lib/stripe";
import { handleStripeWebhookEvent } from "@/lib/stripe-billing-sync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Stripe webhook handler — verifies signature against raw body + STRIPE_WEBHOOK_SECRET.
 */
export async function stripeWebhookPOST(req: Request) {
  const secret = (process.env.STRIPE_WEBHOOK_SECRET || "").trim();
  if (!secret) {
    return NextResponse.json(
      { error: "STRIPE_WEBHOOK_SECRET is not set" },
      { status: 500 },
    );
  }

  const sig = req.headers.get("stripe-signature");
  if (!sig) {
    return NextResponse.json({ error: "Missing stripe-signature" }, { status: 400 });
  }

  const rawBody = await req.text();
  let event: Stripe.Event;
  try {
    event = getStripe().webhooks.constructEvent(rawBody, sig, secret);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Invalid signature";
    logger.warn("api", "Webhook signature failed", { message });
    return NextResponse.json({ error: message }, { status: 400 });
  }

  try {
    await handleStripeWebhookEvent(event);
  } catch (err) {
    logger.error("api", "Webhook handler failed", {
      type: event.type,
      message: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json({ error: "Webhook handler failed" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
