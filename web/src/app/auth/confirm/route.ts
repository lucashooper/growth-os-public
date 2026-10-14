import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import type { EmailOtpType } from "@supabase/supabase-js";
import { provisionUserWorkspace } from "@/services/tenancy";
import { logger } from "@/lib/logger";
import {
  authAppOrigin,
  inferOtpFlow,
  otpTypesToTry,
  resolvePostConfirmPath,
  safeNextPath,
} from "@/lib/supabase/auth-callback";

function failRedirect(origin: string, reason: string) {
  const url = new URL("/login", origin);
  url.searchParams.set("error", "auth_callback_failed");
  url.searchParams.set("reason", reason.slice(0, 200));
  return NextResponse.redirect(url);
}

async function verifyWithTokenHash(
  supabase: ReturnType<typeof createServerClient>,
  tokenHash: string,
  types: EmailOtpType[],
) {
  let lastError: string | undefined;
  for (const otpType of types) {
    const { data, error } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type: otpType,
    });
    if (!error && data.user?.email) {
      return { data, error: undefined, otpType };
    }
    lastError = error?.message;
    logger.warn("auth", "confirm verifyOtp(token_hash) failed", {
      type: otpType,
      message: lastError,
    });
  }
  return { data: null, error: lastError, otpType: undefined };
}

async function verifyWithTokenEmail(
  supabase: ReturnType<typeof createServerClient>,
  token: string,
  email: string,
  types: EmailOtpType[],
) {
  let lastError: string | undefined;
  for (const otpType of types) {
    const { data, error } = await supabase.auth.verifyOtp({
      email,
      token,
      type: otpType,
    });
    if (!error && data.user?.email) {
      return { data, error: undefined, otpType };
    }
    lastError = error?.message;
    logger.warn("auth", "confirm verifyOtp(token+email) failed", {
      type: otpType,
      message: lastError,
    });
  }
  return { data: null, error: lastError, otpType: undefined };
}

/**
 * Email confirm / password recovery — token_hash only (no PKCE code exchange).
 * Email templates MUST link here, not /auth/callback.
 */
export async function GET(request: NextRequest) {
  try {
    return await handleConfirm(request);
  } catch (err) {
    // Never surface a bare 500 on the email link — send the user to /login with a reason.
    const message = err instanceof Error ? err.message : "unknown";
    logger.error("auth", "confirm crashed", { message });
    return failRedirect(authAppOrigin(request.nextUrl.origin), `confirm_failed: ${message}`);
  }
}

async function handleConfirm(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const tokenHash = searchParams.get("token_hash");
  const token = searchParams.get("token");
  const email = searchParams.get("email");
  const type = searchParams.get("type");
  const requestedNext = safeNextPath(searchParams.get("next"));
  const origin = authAppOrigin(request.nextUrl.origin);

  logger.info("auth", "confirm hit", {
    hasTokenHash: Boolean(tokenHash),
    hasToken: Boolean(token),
    hasEmail: Boolean(email),
    type,
  });

  if (!tokenHash && !(token && email)) {
    return failRedirect(
      origin,
      "missing_confirm_params — email link must use /auth/confirm with token_hash (update Supabase email template)",
    );
  }

  const flow = inferOtpFlow(type, Boolean(tokenHash || token));
  const types = otpTypesToTry(type, flow);

  let redirectTarget = new URL("/billing", origin);
  let response = NextResponse.redirect(redirectTarget);

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.redirect(redirectTarget);
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  let verified:
    | Awaited<ReturnType<typeof verifyWithTokenHash>>
    | Awaited<ReturnType<typeof verifyWithTokenEmail>>
    | null = null;

  if (tokenHash) {
    verified = await verifyWithTokenHash(supabase, tokenHash, types);
  } else if (token && email) {
    verified = await verifyWithTokenEmail(supabase, token, email, types);
  }

  const user = verified?.data?.user;
  if (!user?.email || !user.id) {
    return failRedirect(origin, verified?.error || "verify_otp_failed");
  }

  const next = resolvePostConfirmPath(requestedNext, user.user_metadata as Record<string, unknown>);
  redirectTarget = new URL(next, origin);
  response = NextResponse.redirect(redirectTarget);
  for (const cookie of request.cookies.getAll()) {
    response.cookies.set(cookie.name, cookie.value);
  }

  // The session cookies are already set; if provisioning fails here,
  // getSessionUser() retries it on the next authenticated request.
  try {
    await provisionUserWorkspace({
      id: user.id,
      email: user.email,
      name:
        (user.user_metadata?.full_name as string) || user.email.split("@")[0],
    });
  } catch (err) {
    logger.error("auth", "confirm provisionUserWorkspace failed", {
      userId: user.id,
      message: err instanceof Error ? err.message : "unknown",
    });
  }

  logger.info("auth", "confirm success", {
    userId: user.id,
    otpType: verified?.otpType,
    next,
  });

  return response;
}
