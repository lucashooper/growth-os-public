"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/client";
import { buildAuthConfirmUrl } from "@/lib/supabase/auth-callback";

export default function ResetPasswordPage() {
  const [email, setEmail] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setMsg(null);
    if (!isSupabaseConfigured()) {
      setError("Supabase is not configured.");
      return;
    }
    const supabase = createClient();
    const { error: err } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: buildAuthConfirmUrl("/settings"),
    });
    if (err) setError(err.message);
    else setMsg("Check your email for a reset link.");
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-bg px-4">
      <div className="w-full max-w-md rounded-2xl border border-border bg-surface/50 p-8">
        <Link href="/login" className="text-xs text-muted hover:text-ink">
          ← Back to login
        </Link>
        <h1 className="mt-4 text-xl font-semibold text-ink">Reset password</h1>
        <form onSubmit={submit} className="mt-6 space-y-3">
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@company.com"
            className="h-11 w-full rounded-xl border border-border bg-bg px-3 text-sm"
          />
          {error && <p className="text-xs text-danger">{error}</p>}
          {msg && <p className="text-xs text-primary">{msg}</p>}
          <Button type="submit" className="w-full">
            Send reset link
          </Button>
        </form>
      </div>
    </div>
  );
}
