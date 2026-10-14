import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { AppProviders } from "@/components/app-providers";
import { getSessionUser } from "@/lib/auth";
import { isSupabaseConfigured } from "@/lib/supabase/server";
import { logger } from "@/lib/logger";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabaseConfigured = isSupabaseConfigured();
  const devBypass =
    process.env.AUTH_DEV_BYPASS === "1" && !supabaseConfigured;

  let user = null;
  let bootError: string | null = null;
  try {
    user = await getSessionUser();
  } catch (err) {
    bootError = err instanceof Error ? err.message : String(err);
    logger.error("auth", "getSessionUser failed in app layout", {
      message: bootError,
      stack: err instanceof Error ? err.stack : undefined,
    });
  }

  if (bootError) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-bg px-6 text-center text-ink">
        <p className="text-sm font-medium">App failed to start</p>
        <p className="max-w-lg text-sm text-muted">{bootError}</p>
        <p className="max-w-lg text-xs text-muted">
          Check /api/health — production needs a reachable Postgres DATABASE_URL
          (Supabase Transaction pooler, port 6543) and Prisma tables created.
        </p>
        <a className="text-xs text-primary underline" href="/api/health">
          Open /api/health
        </a>
      </div>
    );
  }

  if (!user && !devBypass) {
    logger.info("auth", "app layout redirect → clear session → /login", {
      supabaseConfigured,
    });
    // Route Handler can clear sb-* cookies; Server Components cannot.
    // Prevents stale refresh tokens from confusing the client session.
    redirect("/api/auth/signout");
  }

  return (
    <AppProviders>
      <AppShell>{children}</AppShell>
    </AppProviders>
  );
}
