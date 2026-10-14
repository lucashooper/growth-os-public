import { stripeWebhookPOST } from "@/lib/stripe-webhook-handler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Live endpoint — configure Stripe Dashboard to /api/webhooks/stripe */
export const POST = stripeWebhookPOST;
