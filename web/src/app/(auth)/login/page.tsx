"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PasswordInput } from "@/components/password-input";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/client";
import { buildAuthCallbackRedirectUrl } from "@/lib/supabase/auth-callback";

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next") || "/billing";
  const callbackError = params.get("error");
  const callbackReason = params.get("reason");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [checkingSession, setCheckingSession] = useState(true);
  const configured = isSupabaseConfigured();

  // Valid session → enter app. Stale/invalid refresh token → clear cookies so
  // we don't bounce with middleware or leave broken sb-* cookies around.
  useEffect(() => {
    let cancelled = false;
    async function reconcileSession() {
      if (!configured) {
        setCheckingSession(false);
        return;
      }
      const timeout = window.setTimeout(() => {
        if (!cancelled) setCheckingSession(false);
      }, 8000);
      try {
        const supabase = createClient();

        // After a failed email-confirm callback, clear stale sessions so we
        // don't silently log the user into a different existing account.
        if (callbackError === "auth_callback_failed") {
          await supabase.auth.signOut({ scope: "local" });
          setCheckingSession(false);
          window.clearTimeout(timeout);
          return;
        }

        const { data, error: sessionError } = await supabase.auth.getUser();
        if (cancelled) return;
        if (data.user && !sessionError) {
          router.replace(next);
          return;
        }
        if (sessionError) {
          await supabase.auth.signOut({ scope: "local" });
        }
      } catch {
        // ignore — show login form
      } finally {
        window.clearTimeout(timeout);
        if (!cancelled) setCheckingSession(false);
      }
    }
    void reconcileSession();
    return () => {
      cancelled = true;
    };
  }, [callbackError, configured, next, router]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (!configured) {
        throw new Error(
          "Supabase is not configured. Use Continue locally (dev) or add Supabase keys.",
        );
      }
      const supabase = createClient();
      const { error: err } = await supabase.auth.signInWithPassword({ email, password });
      if (err) throw err;
      void remember;
      router.push(next);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setBusy(false);
    }
  }

  async function oauth(provider: "google") {
    if (!configured) {
      setError("Connect Supabase and enable the Google provider first.");
      return;
    }
    const supabase = createClient();
    await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo: buildAuthCallbackRedirectUrl(next) },
    });
  }

  if (checkingSession) {
    return (
      <div className="flex items-center justify-center gap-2 text-sm text-muted">
        <Loader2 className="h-4 w-4 animate-spin" />
        Checking session…
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-border/80 bg-surface/60 p-8 shadow-2xl backdrop-blur-xl">
      <Link href="/" className="text-xs font-medium tracking-wide text-muted hover:text-ink">
        ← Growth OS
      </Link>
      <h1 className="mt-4 text-2xl font-semibold tracking-tight text-ink">Welcome back</h1>
      <p className="mt-1 text-sm text-muted">Sign in to your workspace</p>

      {callbackError === "auth_callback_failed" && (
        <div className="mt-4 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2.5 text-xs text-ink">
          <p className="font-medium">Email confirmation link expired or invalid.</p>
          <p className="mt-1 text-muted">
            {callbackReason
              ? `Details: ${callbackReason}`
              : "Sign in below, or sign up again and use Resend confirmation email from the same browser."}
          </p>
          <Link href="/signup" className="mt-2 inline-block text-primary hover:underline">
            Back to sign up
          </Link>
        </div>
      )}

      {!configured && (
        <div className="mt-4 rounded-xl border border-border bg-bg/60 p-3 text-xs text-muted">
          <p className="font-medium text-ink">Local development</p>
          <p className="mt-1">Supabase keys are not set. With AUTH_DEV_BYPASS=1 you can enter the app as the local owner.</p>
          <Button className="mt-3 w-full" onClick={() => router.push(next)}>
            Continue locally
          </Button>
        </div>
      )}

      <form onSubmit={onSubmit} className="mt-6 space-y-3">
        <div>
          <label className="text-xs text-muted">Email</label>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-1 h-11 w-full rounded-xl border border-border bg-bg px-3 text-sm"
            autoComplete="email"
            disabled={!configured}
          />
        </div>
        <div>
          <div className="flex items-center justify-between">
            <label className="text-xs text-muted">Password</label>
            <Link href="/auth/reset" className="text-[11px] text-primary hover:underline">
              Forgot password?
            </Link>
          </div>
          <PasswordInput
            value={password}
            onChange={setPassword}
            required
            autoComplete="current-password"
            disabled={!configured}
          />
        </div>
        <label className="flex items-center gap-2 text-xs text-muted">
          <input
            type="checkbox"
            checked={remember}
            onChange={(e) => setRemember(e.target.checked)}
          />
          Remember me
        </label>
        {error && <p className="text-xs text-danger">{error}</p>}
        <Button type="submit" className="h-11 w-full" disabled={busy || !configured}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Sign in"}
        </Button>
      </form>

      <div className="my-5 flex items-center gap-3 text-[11px] text-muted">
        <div className="h-px flex-1 bg-border" />
        or
        <div className="h-px flex-1 bg-border" />
      </div>

      <div className="space-y-2">
        <Button
          type="button"
          variant="secondary"
          className="h-11 w-full"
          onClick={() => oauth("google")}
          disabled={!configured}
        >
          Continue with Google
        </Button>
        <Button
          type="button"
          variant="secondary"
          className="h-11 w-full opacity-60"
          disabled
          title="TikTok login coming soon"
        >
          Continue with TikTok
        </Button>
      </div>

      <p className="mt-6 text-center text-xs text-muted">
        No account?{" "}
        <Link href="/signup" className="text-primary hover:underline">
          Start free
        </Link>
      </p>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="text-sm text-muted">Loading…</div>}>
      <LoginForm />
    </Suspense>
  );
}
