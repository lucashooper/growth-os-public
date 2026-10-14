import "server-only";

export type LogLevel = "debug" | "info" | "warn" | "error";
export type LogCategory =
  | "sync"
  | "ai"
  | "api"
  | "job"
  | "db"
  | "system"
  | "export"
  | "auth"
  | "env"
  | "publish-engine"
  | "publish-worker"
  | "publisher"
  | "backfill";

const isDev = process.env.NODE_ENV !== "production";
const persistEnabled = process.env.LOG_PERSIST === "1";

function stamp() {
  return new Date().toISOString();
}

function serializeMeta(meta?: unknown): string {
  if (meta === undefined) return "";
  try {
    return ` ${JSON.stringify(meta)}`;
  } catch {
    return " [meta:unserializable]";
  }
}

function line(
  level: LogLevel,
  category: LogCategory,
  message: string,
  meta?: unknown,
) {
  // Production: skip debug noise
  if (!isDev && level === "debug") return;

  const out = `[${stamp()}] [${level.toUpperCase()}] [${category}] ${message}${serializeMeta(meta)}`;
  if (level === "error") console.error(out);
  else if (level === "warn") console.warn(out);
  else console.log(out);
}

async function persist(
  level: LogLevel,
  category: LogCategory,
  message: string,
  meta?: unknown,
) {
  if (!persistEnabled) return;
  // Only persist warn/error to avoid DB storms
  if (level !== "warn" && level !== "error") return;
  try {
    const { prisma } = await import("@/lib/db");
    await prisma.devLog.create({
      data: {
        level,
        category,
        message,
        metaJson: JSON.stringify(meta ?? {}),
      },
    });
  } catch (err) {
    console.warn(
      `[${stamp()}] [WARN] [system] log persist failed: ${
        err instanceof Error ? err.message : "unknown"
      }`,
    );
  }
}

export const logger = {
  debug(category: LogCategory, message: string, meta?: unknown) {
    line("debug", category, message, meta);
    void persist("debug", category, message, meta);
  },
  info(category: LogCategory, message: string, meta?: unknown) {
    line("info", category, message, meta);
    void persist("info", category, message, meta);
  },
  warn(category: LogCategory, message: string, meta?: unknown) {
    line("warn", category, message, meta);
    void persist("warn", category, message, meta);
  },
  error(category: LogCategory, message: string, meta?: unknown) {
    line("error", category, message, meta);
    void persist("error", category, message, meta);
  },
};
