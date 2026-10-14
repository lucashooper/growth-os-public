"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Check, CreditCard, Loader2 } from "lucide-react";
import { PageHeader, PageBody } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ErrorBlock, LoadingBlock } from "@/components/empty-state";
import { apiFetch } from "@/lib/api-client";
import { openBillingPortal, startCheckout } from "@/lib/billing-client";
import {
  BILLING_TIERS,
  STRIPE_CUSTOMER_PORTAL_LOGIN,
  isBillingTier,
  type BillingTier,
} from "@/lib/billing-plans";
import { cn } from "@/lib/utils";

type BillingPayload = {
  billing: {
    tier: string;
    status: string;
    currentPeriodEnd: string | null;
    hasCustomer: boolean;
    paid: boolean;
    active: boolean;
  };
  usage?: {
    tier: string;
    periodStart: string;
    periodEnd: string | null;
    limits: {
      channels: number;
      agentGenerations: number;
      chatMessages: number;
      aiImages: number;
      aiVideos: number;
    };
    usage: {
      agentGenerations: number;
      chatMessages: number;
      aiImages: number;
      aiVideos: number;
      channels: number;
    };
  } | null;
  plans: { id: BillingTier; name: string; priceLabel: string; blurb: string }[];
};

const TIER_ORDER: BillingTier[] = ["creator", "team", "pro", "agency"];

export function BillingView() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [data, setData] = useState<BillingPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<BillingTier | "portal" | null>(null);
  const [syncingCheckout, setSyncingCheckout] = useState(false);

  const canceled = searchParams.get("canceled") === "true";
  const updated = searchParams.get("updated") === "true";
  const success =
    searchParams.get("success") === "true" ||
    Boolean(searchParams.get("session_id"));
  const highlight = searchParams.get("tier");

  const load = useCallback(async () => {
    const sessionId = searchParams.get("session_id");
    const billingUrl = sessionId
      ? `/api/billing?session_id=${encodeURIComponent(sessionId)}`
      : "/api/billing";
    console.log("[BillingView] fetching billing", { billingUrl });
    setLoading(true);
    const res = await apiFetch<BillingPayload>(billingUrl, { skipCache: true });
    if (!res.ok) {
      console.warn("[BillingView] billing fetch failed", res.error);
      setError(res.error);
      setData(null);
      setLoading(false);
      return;
    }
    console.log("[BillingView] billing payload", res.data.billing);
    setData(res.data);
    setError(null);
    setLoading(false);
    return res.data;
  }, [searchParams]);

  useEffect(() => {
    void load();
  }, [load]);

  // Strip legacy auto-checkout param so refresh never re-triggers Stripe.
  useEffect(() => {
    if (searchParams.get("checkout") !== "1") return;
    const params = new URLSearchParams(searchParams.toString());
    params.delete("checkout");
    const qs = params.toString();
    router.replace(qs ? `/billing?${qs}` : "/billing");
  }, [router, searchParams]);

  // After successful Stripe checkout, poll until webhook/status shows active/trialing.
  useEffect(() => {
    if (!success) return;
    let cancelled = false;
    setSyncingCheckout(true);

    async function syncAfterCheckout() {
      console.log("[BillingView] syncing subscription after checkout…");
      for (let attempt = 0; attempt < 15; attempt++) {
        if (cancelled) return;
        const payload = await load();
        if (payload?.billing.active) {
          console.log("[BillingView] subscription active — checkout sync complete");
          window.dispatchEvent(new CustomEvent("growth-os:billing-activated"));
          const params = new URLSearchParams(searchParams.toString());
          params.delete("session_id");
          params.set("success", "true");
          params.set("welcome", "1");
          router.replace(`/billing?${params.toString()}`);
          setSyncingCheckout(false);
          return;
        }
        await new Promise((r) => setTimeout(r, 2000));
      }
      console.warn("[BillingView] checkout sync timed out — webhook may be delayed");
      setSyncingCheckout(false);
    }

    void syncAfterCheckout();
    return () => {
      cancelled = true;
    };
  }, [success, load, router, searchParams]);

  async function onUpgrade(tier: BillingTier) {
    setBusy(tier);
    setError(null);
    try {
      console.log("[BillingView] starting checkout", { tier });
      await startCheckout(tier);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Checkout failed");
      setBusy(null);
    }
  }

  async function onManage() {
    setBusy("portal");
    setError(null);
    try {
      await openBillingPortal();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not open billing portal");
      setBusy(null);
    }
  }

  if (loading && !data && !error) {
    return <LoadingBlock label="Loading billing…" />;
  }

  const current = data?.billing;
  const paid = Boolean(current?.active);
  const period = current?.currentPeriodEnd
    ? new Date(current.currentPeriodEnd).toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : null;

  return (
    <div className="flex min-h-full flex-col">
      <PageHeader
        title="Billing"
        description="Start for $0 with a 7-day trial, then the monthly rate. Change or cancel anytime."
        action={
          paid ? (
            <Button
              variant="outline"
              className="gap-2"
              disabled={busy === "portal"}
              onClick={() => void onManage()}
            >
              {busy === "portal" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <CreditCard className="h-4 w-4" />
              )}
              Manage subscription
            </Button>
          ) : undefined
        }
      />

      <PageBody>
        {canceled && (
          <p className="mb-4 rounded-xl border border-border bg-surface/40 px-3 py-2.5 text-sm text-muted">
            Checkout canceled. Choose a plan when you&apos;re ready.
          </p>
        )}
        {syncingCheckout && (
          <p className="mb-4 flex items-center gap-2 rounded-xl border border-primary/30 bg-primary/10 px-3 py-2.5 text-sm text-ink">
            <Loader2 className="h-4 w-4 animate-spin" />
            Activating your subscription…
          </p>
        )}
        {success && paid && !syncingCheckout && (
          <p className="mb-4 rounded-xl border border-primary/30 bg-primary/10 px-3 py-2.5 text-sm text-ink">
            You&apos;re subscribed — full access is unlocked.
          </p>
        )}
        {updated && (
          <p className="mb-4 rounded-xl border border-primary/30 bg-primary/10 px-3 py-2.5 text-sm text-ink">
            Plan updated.
          </p>
        )}
        {error && (
          <div className="mb-4">
            <ErrorBlock message={error} onRetry={() => void load()} />
          </div>
        )}

        {current && (
          <p className="mb-4 text-sm text-muted">
            Current plan:{" "}
            <span className="font-medium text-ink">
              {isBillingTier(current.tier)
                ? BILLING_TIERS[current.tier].name
                : "Free"}
            </span>
            {current.status && current.status !== "inactive"
              ? ` · ${current.status}`
              : ""}
            {period ? ` · renews ${period}` : ""}
          </p>
        )}

        {data?.usage && (
          <div className="mb-6 grid gap-2 rounded-xl border border-border bg-surface/40 p-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
            {(
              [
                [
                  "Agent gens",
                  data.usage.usage.agentGenerations,
                  data.usage.limits.agentGenerations,
                ],
                [
                  "Chat msgs",
                  data.usage.usage.chatMessages,
                  data.usage.limits.chatMessages,
                ],
                [
                  "Channels",
                  data.usage.usage.channels,
                  data.usage.limits.channels,
                ],
                [
                  "AI images",
                  data.usage.usage.aiImages,
                  data.usage.limits.aiImages,
                ],
              ] as const
            ).map(([label, used, limit]) => (
              <div key={label}>
                <p className="text-[11px] uppercase tracking-wide text-muted">
                  {label}
                </p>
                <p className="mt-0.5 font-medium tabular-nums text-ink">
                  {used}
                  <span className="font-normal text-muted"> / {limit}</span>
                </p>
              </div>
            ))}
          </div>
        )}

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {TIER_ORDER.map((id) => {
            const plan = BILLING_TIERS[id];
            const isCurrent = current?.tier === id && paid;
            const featured = id === "pro";
            return (
              <Card
                key={id}
                className={cn(
                  "flex flex-col",
                  (featured || highlight === id) && "border-white/[0.14]",
                )}
              >
                <CardContent className="flex h-full flex-col p-5">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-medium text-ink">{plan.name}</p>
                    {isCurrent ? <Badge>Current</Badge> : null}
                  </div>
                  <p className="mt-3 text-3xl font-semibold tabular-nums text-ink">
                    {plan.priceLabel}
                    <span className="ml-1 text-sm font-normal text-muted">/mo</span>
                  </p>
                  <p className="mt-2 flex-1 text-[13px] text-muted">{plan.blurb}</p>
                  <ul className="mt-4 space-y-1.5 text-[12px] text-muted">
                    <li className="flex items-center gap-2">
                      <Check className="h-3.5 w-3.5 text-primary" strokeWidth={1.75} />
                      7-day trial · start for $0
                    </li>
                    <li className="flex items-center gap-2">
                      <Check className="h-3.5 w-3.5 text-primary" strokeWidth={1.75} />
                      Cancel anytime from the portal
                    </li>
                  </ul>
                  {isCurrent ? (
                    <Button
                      variant="outline"
                      className="mt-5"
                      disabled={busy === "portal"}
                      onClick={() => void onManage()}
                    >
                      {busy === "portal" ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        "Manage"
                      )}
                    </Button>
                  ) : (
                    <Button
                      className="mt-5"
                      variant={featured ? "default" : "secondary"}
                      disabled={Boolean(busy) || syncingCheckout}
                      onClick={() => void onUpgrade(id)}
                    >
                      {busy === id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : paid ? (
                        `Switch to ${plan.name}`
                      ) : (
                        "Start free trial"
                      )}
                    </Button>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>

        {STRIPE_CUSTOMER_PORTAL_LOGIN ? (
          <p className="mt-6 text-xs text-muted">
            Already subscribed?{" "}
            <a
              href={STRIPE_CUSTOMER_PORTAL_LOGIN}
              className="text-ink underline-offset-2 hover:underline"
              target="_blank"
              rel="noreferrer"
            >
              Open the customer portal
            </a>{" "}
            to update your card or cancel.
          </p>
        ) : null}
      </PageBody>
    </div>
  );
}
