import type { EmailOtpType } from "@supabase/supabase-js";
import { isBillingTier } from "@/lib/billing-plans";
import { configuredSiteUrl } from "@/lib/public-config";

const DEFAULT_POST_CONFIRM = "/billing";

/** Public site origin for auth redirects (client + server). */
export function authAppOrigin(fallback?: string): string {
  const configured = configuredSiteUrl() || fallback || "";
  if (configured) return configured.replace(/\/$/, "");
  return "http://localhost:3000";
}

/** Redirect target for Supabase signUp / resend (email confirm landing page). */
export function buildAuthConfirmUrl(nextPath?: string): string {
  const origin = authAppOrigin();
  const url = new URL("/auth/confirm", origin);
  if (nextPath) url.searchParams.set("next", nextPath);
  return url.toString();
}

/** OAuth redirect (Google, etc.) — PKCE code exchange on /auth/callback. */
export function buildAuthCallbackRedirectUrl(nextPath?: string): string {
  const origin = authAppOrigin();
  const url = new URL("/auth/callback", origin);
  if (nextPath) url.searchParams.set("next", nextPath);
  return url.toString();
}

export function safeNextPath(raw: string | null | undefined): string | null {
  if (!raw) return null;
  if (!raw.startsWith("/") || raw.startsWith("//")) return null;
  return raw;
}

/** After email confirm, honor ?next= or fall back to signup plan metadata. */
export function resolvePostConfirmPath(
  requestedNext: string | null,
  userMetadata?: Record<string, unknown> | null,
): string {
  const explicit = safeNextPath(requestedNext);
  if (explicit) return explicit;

  const plan = userMetadata?.selected_plan;
  if (typeof plan === "string" && isBillingTier(plan)) {
    return `/billing?tier=${plan}`;
  }

  return DEFAULT_POST_CONFIRM;
}

const SIGNUP_OTP_TYPES: EmailOtpType[] = ["email", "signup"];

export function otpTypesToTry(
  raw: string | null,
  flow: "signup" | "recovery" | "oauth",
): EmailOtpType[] {
  if (flow === "recovery") {
    return raw === "recovery" ? ["recovery"] : ["recovery", ...(raw ? [raw as EmailOtpType] : [])];
  }
  if (flow === "oauth") return [];

  const ordered: EmailOtpType[] = [];
  if (raw && !ordered.includes(raw as EmailOtpType)) {
    ordered.push(raw as EmailOtpType);
  }
  for (const t of SIGNUP_OTP_TYPES) {
    if (!ordered.includes(t)) ordered.push(t);
  }
  return ordered;
}

export function isPkceVerifierError(message: string): boolean {
  return /pkce|code verifier not found/i.test(message);
}

export function inferOtpFlow(
  type: string | null,
  hasTokenHash: boolean,
): "signup" | "recovery" | "oauth" {
  if (!hasTokenHash) return "oauth";
  if (type === "recovery" || type === "magiclink") return "recovery";
  return "signup";
}
