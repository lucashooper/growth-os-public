import "server-only";

import { PrismaClient } from "@prisma/client";
import { logger } from "@/lib/logger";

/**
 * Prisma must be a process-wide singleton on Netlify/serverless.
 * Without globalThis caching in production, each warm isolate + HMR-style
 * re-import can open extra pools until Supabase hits EMAXCONN (→ 500/502).
 */
const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
  prismaReadyLogged?: boolean;
};

/**
 * Ensure Postgres URLs use the pooler and a tight per-isolate limit.
 * SQLite (`file:`) is left untouched.
 */
export function normalizeDatabaseUrl(raw?: string | null): string | undefined {
  if (!raw) return raw ?? undefined;
  if (raw.startsWith("file:")) return raw;

  try {
    const url = new URL(raw);
    const isPostgres =
      url.protocol === "postgresql:" || url.protocol === "postgres:";
    if (!isPostgres) return raw;

    // Supabase transaction pooler (6543) needs pgbouncer=true
    if (
      url.port === "6543" ||
      url.hostname.includes("pooler.supabase.com")
    ) {
      if (!url.searchParams.has("pgbouncer")) {
        url.searchParams.set("pgbouncer", "true");
      }
    }
    // Cap connections per serverless isolate (default Prisma is much higher)
    if (!url.searchParams.has("connection_limit")) {
      url.searchParams.set("connection_limit", "5");
    }
    if (!url.searchParams.has("pool_timeout")) {
      url.searchParams.set("pool_timeout", "10");
    }
    return url.toString();
  } catch {
    return raw;
  }
}

function createClient() {
  const datasourceUrl = normalizeDatabaseUrl(process.env.DATABASE_URL);
  return new PrismaClient({
    log: ["error", "warn"],
    ...(datasourceUrl ? { datasources: { db: { url: datasourceUrl } } } : {}),
  });
}

export const prisma = globalForPrisma.prisma ?? createClient();

// ALWAYS pin on globalThis — including production serverless warm instances.
globalForPrisma.prisma = prisma;

/** Probe DB connectivity for health checks. */
export async function checkPrismaConnection(): Promise<{
  connected: boolean;
  error?: string;
  latencyMs?: number;
}> {
  const started = Date.now();
  try {
    await prisma.$queryRaw`SELECT 1`;
    const latencyMs = Date.now() - started;
    if (!globalForPrisma.prismaReadyLogged) {
      globalForPrisma.prismaReadyLogged = true;
      logger.info("db", "Prisma connection ok", { latencyMs });
    }
    return { connected: true, latencyMs };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Prisma connect failed";
    logger.error("db", "Prisma connection failed", {
      message,
      stack: err instanceof Error ? err.stack : undefined,
    });
    return {
      connected: false,
      error: message,
      latencyMs: Date.now() - started,
    };
  }
}
