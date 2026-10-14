import { NextResponse } from "next/server";
import { checkPrismaConnection } from "@/lib/db";
import { getEnvReport, logEnvValidation } from "@/lib/env";
import { logger } from "@/lib/logger";
import { withApi } from "@/lib/api-route";


export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function checkSupabase(): Promise<{
  reachable: boolean;
  configured: boolean;
  error?: string;
  latencyMs?: number;
}> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    return { reachable: false, configured: false, error: "missing env" };
  }
  const started = Date.now();
  try {
    // Auth settings endpoint is anonymous-friendly and proves reachability
    const res = await fetch(`${url.replace(/\/$/, "")}/auth/v1/health`, {
      headers: { apikey: key },
      signal: AbortSignal.timeout(8000),
    });
    const latencyMs = Date.now() - started;
    if (!res.ok) {
      return {
        reachable: false,
        configured: true,
        error: `HTTP ${res.status}`,
        latencyMs,
      };
    }
    return { reachable: true, configured: true, latencyMs };
  } catch (err) {
    return {
      reachable: false,
      configured: true,
      error: err instanceof Error ? err.message : "fetch failed",
      latencyMs: Date.now() - started,
    };
  }
}

async function handleGET() {
  const started = Date.now();
  try {
    const env = logEnvValidation("health");
    const [prismaStatus, supabase] = await Promise.all([
      checkPrismaConnection(),
      checkSupabase(),
    ]);

    const appOk = true;
    const healthy =
      prismaStatus.connected &&
      (supabase.configured ? supabase.reachable : false) &&
      env.missingRequired.length === 0;

    const body = {
      ok: healthy,
      status: healthy ? "healthy" : "degraded",
      app: {
        status: appOk ? "up" : "down",
        service: "growth-os",
        time: new Date().toISOString(),
        node: process.version,
        nextRuntime: "nodejs",
      },
      database: {
        connected: prismaStatus.connected,
        prismaConnected: prismaStatus.connected,
        error: prismaStatus.error,
        latencyMs: prismaStatus.latencyMs,
        kind:
          env.checks.find((c) => c.key === "DATABASE_URL")?.hint || "unknown",
      },
      supabase: {
        configured: supabase.configured,
        reachable: supabase.reachable,
        error: supabase.error,
        latencyMs: supabase.latencyMs,
      },
      environment: {
        deployment:
          process.env.CONTEXT ||
          process.env.NETLIFY_CONTEXT ||
          (process.env.NETLIFY === "true" ? "netlify" : "local"),
        nodeEnv: process.env.NODE_ENV || "undefined",
        netlify: process.env.NETLIFY === "true",
        validation: {
          ok: env.missingRequired.length === 0,
          missingRequired: env.missingRequired,
          present: Object.fromEntries(
            env.checks.map((c) => [c.key, c.present]),
          ),
        },
      },
      latencyMs: Date.now() - started,
    };

    logger.info("api", "GET /api/health", {
      ok: body.ok,
      prisma: prismaStatus.connected,
      supabase: supabase.reachable,
    });

    return NextResponse.json(body, { status: healthy ? 200 : 503 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "health failed";
    const stack = err instanceof Error ? err.stack : undefined;
    logger.error("api", "GET /api/health crashed", { message, stack });
    return NextResponse.json(
      {
        ok: false,
        status: "error",
        error: message,
        ...(process.env.NODE_ENV !== "production" ? { stack } : {}),
      },
      { status: 500 },
    );
  }
}

export const GET = withApi(handleGET, "GET src/app/api/health/route.ts");
