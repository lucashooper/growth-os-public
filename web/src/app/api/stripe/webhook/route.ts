import { stripeWebhookPOST } from "@/lib/stripe-webhook-handler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Legacy path — same handler as /api/webhooks/stripe */
export const POST = stripeWebhookPOST;
