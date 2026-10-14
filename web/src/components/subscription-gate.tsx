"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { CreditCard, Loader2, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/api-client";
import { startCheckout } from "@/lib/billing-client";
import { BILLING_TIERS, isBillingTier, type BillingTier } from "@/lib/billing-plans";

type BillingPayload = {
  billing: {
    tier: string;
    status: string;
    paid: boolean;
    active: boolean;
  };
};

const ALLOWED_WITHOUT_SUBSCRIPTION = new Set(["/billing", "/settings"]);

export function SubscriptionGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  const [active, setActive] = useState(false);
  const [tier, setTier] = useState<BillingTier>("creator");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const skipGate = ALLOWED_WITHOUT_SUBSCRIPTION.has(pathname);

  const checkSubscription = useCallback(async () => {
    console.log("[SubscriptionGate] checking subscription…", { pathname });
    const res = await apiFetch<BillingPayload>("/api/billing", { skipCache: true });
    if (!res.ok) {
      console.warn("[SubscriptionGate] billing fetch failed", res.error);
      setActive(false);
      setChecking(false);
      return;
    }

    const billing = res.data.billing;
    const isActive = Boolean(billing.active);
    console.log("[SubscriptionGate] billing status", {
      tier: billing.tier,
      status: billing.status,
      active: isActive,
      paid: billing.paid,
    });

    setActive(isActive);
    if (isBillingTier(billing.tier)) {
      setTier(billing.tier);
    }
    setChecking(false);

    if (!isActive && !ALLOWED_WITHOUT_SUBSCRIPTION.has(pathname)) {
      const params = new URLSearchParams(window.location.search);
      const preferred = params.get("tier");
      const highlightTier = isBillingTier(preferred) ? preferred : "creator";
      const target = `/billing?tier=${highlightTier}`;
      console.log("[SubscriptionGate] no active plan — redirect to billing", { target });
      router.replace(target);
    }
  }, [pathname, router]);

  useEffect(() => {
    if (skipGate) {
      setChecking(false);
      return;
    }
    void checkSubscription();
  }, [checkSubscription, skipGate]);

  async function onStartCheckout() {
    setBusy(true);
    setError(null);
    try {
      await startCheckout(tier);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Checkout failed");
      setBusy(false);
    }
  }

  if (skipGate) return <>{children}</>;

  if (checking) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 text-muted">
        <Loader2 className="h-6 w-6 animate-spin" />
        <p className="text-sm">Checking subscription…</p>
      </div>
    );
  }

  if (active) return <>{children}</>;

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <div className="pointer-events-none select-none opacity-30 blur-[2px]">{children}</div>
      <div className="absolute inset-0 z-40 flex items-center justify-center bg-bg/80 p-6 backdrop-blur-sm">
        <div className="w-full max-w-md rounded-2xl border border-border bg-surface p-8 text-center shadow-2xl">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-primary/15 text-primary">
            <Lock className="h-7 w-7" />
          </div>
          <h2 className="mt-5 text-xl font-semibold tracking-tight text-ink">
            Choose a plan to continue
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-muted">
            Growth OS requires an active plan. Start your 7-day trial for $0, then
            continue on {BILLING_TIERS[tier].priceLabel}/mo — cancel anytime.
          </p>
          {error && <p className="mt-3 text-xs text-danger">{error}</p>}
          <Button
            className="mt-6 h-11 w-full gap-2"
            disabled={busy}
            onClick={() => void onStartCheckout()}
          >
            {busy ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <CreditCard className="h-4 w-4" />
            )}
            Start free trial — {BILLING_TIERS[tier].name}
          </Button>
          <button
            type="button"
            className="mt-4 text-xs text-muted hover:text-ink"
            onClick={() => router.push("/billing")}
          >
            Compare all plans
          </button>
        </div>
      </div>
    </div>
  );
}
