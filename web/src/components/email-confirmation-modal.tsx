"use client";

import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, Loader2, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { buildAuthConfirmUrl } from "@/lib/supabase/auth-callback";

const COOLDOWN_SECONDS = 60;

type Props = {
  email: string;
  nextPath: string;
  onBack: () => void;
};

export function EmailConfirmationModal({ email, nextPath, onBack }: Props) {
  const [resendCooldown, setResendCooldown] = useState(0);
  const [resending, setResending] = useState(false);
  const [resent, setResent] = useState(false);
  const [resendError, setResendError] = useState<string | null>(null);

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = window.setInterval(() => {
      setResendCooldown((s) => (s <= 1 ? 0 : s - 1));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [resendCooldown]);

  const resendEmail = useCallback(async () => {
    if (resendCooldown > 0 || resending) return;
    setResending(true);
    setResendError(null);
    setResent(false);
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.resend({
        type: "signup",
        email,
        options: {
          emailRedirectTo: buildAuthConfirmUrl(nextPath),
        },
      });
      if (error) throw error;
      setResent(true);
      setResendCooldown(COOLDOWN_SECONDS);
      window.setTimeout(() => setResent(false), 4000);
    } catch (err) {
      setResendError(err instanceof Error ? err.message : "Could not resend email");
    } finally {
      setResending(false);
    }
  }, [email, nextPath, resendCooldown, resending]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl border border-[#35363C] bg-[#2B2D31] p-8 shadow-2xl">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-[#5865F2]/15 text-[#5865F2]">
          <Mail className="h-6 w-6" />
        </div>

        <h2 className="mt-5 text-center text-[20px] font-bold tracking-tight text-[#F2F3F5]">
          Check your inbox
        </h2>

        <p className="mt-3 text-center text-sm text-[#B5BAC1]">
          We sent a confirmation link to
        </p>

        <div className="mt-3 flex justify-center">
          <span className="inline-block max-w-full truncate rounded-full border border-[#35363C] bg-[#1E1F22] px-3 py-1.5 font-mono text-sm font-medium text-[#F2F3F5]">
            {email}
          </span>
        </div>

        <div className="mt-6">
          <Button
            type="button"
            className="h-11 w-full bg-[#5865F2] hover:bg-[#4752C4]"
            disabled={resendCooldown > 0 || resending}
            onClick={() => void resendEmail()}
          >
            {resending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : resendCooldown > 0 ? (
              `Resend in ${resendCooldown}s`
            ) : (
              "Resend confirmation email"
            )}
          </Button>
        </div>

        {resent && (
          <p className="mt-3 flex items-center justify-center gap-1.5 text-xs font-medium text-emerald-400">
            <CheckCircle2 className="h-3.5 w-3.5" />
            Confirmation link resent!
          </p>
        )}
        {resendError && (
          <p className="mt-3 text-center text-xs text-danger">{resendError}</p>
        )}

        <button
          type="button"
          className="mt-6 w-full text-center text-xs text-[#949BA4] hover:text-[#F2F3F5]"
          onClick={onBack}
        >
          Wrong email?{" "}
          <span className="underline underline-offset-2">Back to sign up</span>
        </button>
      </div>
    </div>
  );
}
