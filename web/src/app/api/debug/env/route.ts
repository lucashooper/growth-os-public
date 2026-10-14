import { NextResponse } from "next/server";
import { getEnvReport } from "@/lib/env";
import { logger } from "@/lib/logger";
import { withApi } from "@/lib/api-route";


export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Development-only: reports whether required env vars exist (booleans only).
 * Never returns secret values.
 */
async function handleGET() {
  if (process.env.NODE_ENV === "production" && process.env.DEBUG_ENV !== "1") {
    logger.warn("api", "GET /api/debug/env blocked in production");
    return NextResponse.json(
      { ok: false, error: "Not available in production" },
      { status: 404 },
    );
  }

  const report = getEnvReport();
  logger.info("api", "GET /api/debug/env", {
    missing: report.missingRequired.length,
  });

  return NextResponse.json({
    ok: true,
    environment: report.environment,
    nodeEnv: report.nodeEnv,
    netlify: report.netlify,
    node: process.version,
    vars: Object.fromEntries(report.checks.map((c) => [c.key, c.present])),
    hints: Object.fromEntries(
      report.checks
        .filter((c) => c.hint)
        .map((c) => [c.key, c.hint as string]),
    ),
    missingRequired: report.missingRequired,
  });
}

export const GET = withApi(handleGET, "GET src/app/api/debug/env/route.ts");
