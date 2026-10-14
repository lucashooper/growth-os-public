import { apiFetch } from "@/lib/api-client";
import {
  STRIPE_CUSTOMER_PORTAL_LOGIN,
  type BillingTier,
} from "@/lib/billing-plans";

export async function startCheckout(tier: BillingTier) {
  const res = await apiFetch<{ url: string }>("/api/stripe/checkout", {
    method: "POST",
    body: JSON.stringify({ tier }),
    skipCache: true,
  });
  if (!res.ok) throw new Error(res.error || "Checkout failed");
  if (!res.data.url) throw new Error("Stripe did not return a checkout URL");
  window.location.href = res.data.url;
}

export async function openBillingPortal() {
  const res = await apiFetch<{ url: string }>("/api/stripe/portal", {
    method: "POST",
    body: JSON.stringify({}),
    skipCache: true,
  });
  const url =
    (res.ok && res.data.url) || STRIPE_CUSTOMER_PORTAL_LOGIN;
  if (!url) {
    throw new Error(
      "Billing portal is not configured. Set NEXT_PUBLIC_STRIPE_CUSTOMER_PORTAL_URL.",
    );
  }
  window.location.href = url;
}
