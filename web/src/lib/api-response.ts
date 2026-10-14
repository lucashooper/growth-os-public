import { NextResponse } from "next/server";
import { logger } from "@/lib/logger";

export function ok<T>(data: T, status = 200) {
  return NextResponse.json(data, { status });
}

type FailExtras = {
  requestId?: string;
  code?: string;
  stack?: string;
  details?: unknown;
};

export function fail(
  error: unknown,
  status = 500,
  category: "api" | "sync" | "ai" | "job" | "db" | "auth" = "api",
  extras: FailExtras = {},
) {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : "Unknown error";
  const stack = error instanceof Error ? error.stack : extras.stack;

  logger.error(category, message, {
    status,
    requestId: extras.requestId,
    code: extras.code,
    stack,
    details: extras.details,
  });

  const body: Record<string, unknown> = {
    ok: false,
    error: message,
    code: extras.code || (status >= 500 ? "INTERNAL" : "REQUEST"),
    retryable: status >= 500 || status === 429,
  };
  if (extras.requestId) body.requestId = extras.requestId;
  if (process.env.NODE_ENV !== "production" && stack) {
    body.stack = stack;
  }
  if (process.env.NODE_ENV !== "production" && extras.details) {
    body.details = extras.details;
  }

  return NextResponse.json(body, { status });
}
