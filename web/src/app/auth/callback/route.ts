import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { provisionUserWorkspace } from "@/services/tenancy";
import { logger } from "@/lib/logger";
import {
  authAppOrigin,
  isPkceVerifierError,
  resolvePostConfirmPath,
  safeNextPath,
} from "@/lib/supabase/auth-callback";

function failRedirect(origin: string, reason: string) {
  const url = new URL("/login", origin);
  url.searchParams.set("error", "auth_callback_failed");
  url.searchParams.set("reason", reason.slice(0, 200));
  return NextResponse.redirect(url);
}

/**
 * OAuth / same-browser PKCE callback only.
 * Email confirmation must use /auth/confirm (token_hash) — never PKCE code from email.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type");
  const requestedNext = safeNextPath(searchParams.get("next"));
  const origin = authAppOrigin(request.nextUrl.origin);

  // Email links should hit /auth/confirm — forward if they land here with token_hash.
  if (tokenHash && type) {
    const confirm = new URL("/auth/confirm", origin);
    searchParams.forEach((value, key) => confirm.searchParams.set(key, value));
    return NextResponse.redirect(confirm);
  }

  const authError = searchParams.get("error_description") || searchParams.get("error");
  if (authError) {
    return failRedirect(origin, authError);
  }

  if (!code) {
    return failRedirect(origin, "missing_oauth_code");
  }

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

  const { data, error } = await supabase.auth.exchangeCodeForSession(code);
  if (error || !data.user?.email) {
    logger.warn("auth", "oauth exchangeCodeForSession failed", {
      message: error?.message,
    });
    if (error && isPkceVerifierError(error.message)) {
      return failRedirect(
        origin,
        "Email links must use /auth/confirm — update Supabase Confirm signup template to token_hash URL (see supabase/email-templates/confirm-signup.html)",
      );
    }
    return failRedirect(origin, error?.message || "oauth_session_failed");
  }

  const next = resolvePostConfirmPath(
    requestedNext,
    data.user.user_metadata as Record<string, unknown>,
  );
  redirectTarget = new URL(next, origin);
  response = NextResponse.redirect(redirectTarget);
  for (const cookie of request.cookies.getAll()) {
    response.cookies.set(cookie.name, cookie.value);
  }

  await provisionUserWorkspace({
    id: data.user.id,
    email: data.user.email,
    name:
      (data.user.user_metadata?.full_name as string) ||
      data.user.email.split("@")[0],
  });

  logger.info("auth", "oauth callback success", { userId: data.user.id, next });
  return response;
}
