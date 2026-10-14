import { prisma } from "@/lib/db";
import { fail, ok } from "@/lib/api-response";
import { AuthError, requireUser } from "@/lib/auth";
import { withApi } from "@/lib/api-route";
import { getStripe, originFromRequest } from "@/lib/stripe";
import { STRIPE_CUSTOMER_PORTAL_LOGIN } from "@/lib/billing-plans";

export const runtime = "nodejs";

async function handlePOST(req: Request) {
  try {
    const user = await requireUser();
    const member = await prisma.workspaceMember.findFirst({
      where: { userId: user.id },
      include: { workspace: true },
      orderBy: { createdAt: "asc" },
    });
    const customerId = member?.workspace.stripeCustomerId;
    if (!customerId) {
      if (!STRIPE_CUSTOMER_PORTAL_LOGIN) {
        return fail(
          "Billing portal is not configured. Set NEXT_PUBLIC_STRIPE_CUSTOMER_PORTAL_URL or subscribe once so a Stripe customer exists.",
          400,
        );
      }
      return ok({ url: STRIPE_CUSTOMER_PORTAL_LOGIN });
    }

    const stripe = getStripe();
    const origin = originFromRequest(req);
    try {
      const portalSession = await stripe.billingPortal.sessions.create({
        customer: customerId,
        return_url: `${origin}/billing`,
      });
      return ok({ url: portalSession.url });
    } catch {
      if (!STRIPE_CUSTOMER_PORTAL_LOGIN) {
        return fail(
          "Could not open the Stripe billing portal. Check STRIPE_SECRET_KEY and the customer portal settings.",
          502,
        );
      }
      return ok({ url: STRIPE_CUSTOMER_PORTAL_LOGIN });
    }
  } catch (err) {
    if (err instanceof AuthError) return fail(err.message, err.status);
    return fail(err);
  }
}

export const POST = withApi(handlePOST, "POST src/app/api/stripe/portal/route.ts");
