"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import { EmailConfirmationModal } from "@/components/email-confirmation-modal";
import { Button } from "@/components/ui/button";
import { PasswordInput } from "@/components/password-input";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/client";
import { buildAuthConfirmUrl } from "@/lib/supabase/auth-callback";
import { BILLING_TIERS, isBillingTier, type BillingTier } from "@/lib/billing-plans";

export default function SignupForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const selectedPlan = searchParams.get("plan");
  const plan: BillingTier | null = isBillingTier(selectedPlan) ? selectedPlan : null;

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [awaitingEmail, setAwaitingEmail] = useState<string | null>(null);

  const planLabel = plan ? BILLING_TIERS[plan].name : null;
  const next = plan
    ? `/billing?tier=${plan}`
    : "/billing";

  const heading = useMemo(() => {
    if (planLabel) return `Start your ${planLabel} trial`;
    return "Create your account";
  }, [planLabel]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (!isSupabaseConfigured()) {
        throw new Error(
          "Supabase Auth is not configured. Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.",
        );
      }
      const supabase = createClient();
      const { data, error: err } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { full_name: name, selected_plan: plan || "creator" },
          emailRedirectTo: buildAuthConfirmUrl(next),
        },
      });
      if (err) throw err;
      if (data.session) {
        router.push(next);
        router.refresh();
      } else {
        setAwaitingEmail(email.trim());
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Signup failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="rounded-2xl border border-border/80 bg-surface/60 p-8 shadow-2xl backdrop-blur-xl">
        <Link href="/" className="text-xs font-medium tracking-wide text-muted hover:text-ink">
          ← Growth OS
        </Link>
        <h1 className="mt-4 text-2xl font-semibold tracking-tight text-ink">{heading}</h1>
        <p className="mt-1 text-sm text-muted">
          {planLabel && plan
            ? `7-day trial for $0, then ${BILLING_TIERS[plan].priceLabel}/mo. You'll go straight to secure checkout.`
            : "Pick a plan after signup — 7-day trial for $0."}
        </p>

        <form onSubmit={onSubmit} className="mt-6 space-y-3">
          <div>
            <label className="text-xs text-muted">Name</label>
            <input
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-1 h-11 w-full rounded-xl border border-border bg-bg px-3 text-sm"
            />
          </div>
          <div>
            <label className="text-xs text-muted">Email</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 h-11 w-full rounded-xl border border-border bg-bg px-3 text-sm"
              autoComplete="email"
            />
          </div>
          <div>
            <label className="text-xs text-muted">Password</label>
            <PasswordInput
              value={password}
              onChange={setPassword}
              required
              minLength={8}
              autoComplete="new-password"
            />
          </div>
          {error && <p className="text-xs text-danger">{error}</p>}
          <Button type="submit" className="h-11 w-full" disabled={busy}>
            {busy ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : planLabel ? (
              "Continue to checkout"
            ) : (
              "Create account"
            )}
          </Button>
        </form>

        <p className="mt-6 text-center text-xs text-muted">
          Already have an account?{" "}
          <Link href="/login" className="text-primary hover:underline">
            Sign in
          </Link>
        </p>
      </div>

      {awaitingEmail && (
        <EmailConfirmationModal
          email={awaitingEmail}
          nextPath={next}
          onBack={() => setAwaitingEmail(null)}
        />
      )}
    </>
  );
}
