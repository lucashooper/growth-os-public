import { NextResponse } from "next/server";
import { AuthError, isAuthError } from "@/lib/auth";
import { fail, ok } from "@/lib/api-response";
import { logger } from "@/lib/logger";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyHandler = (req: Request, ctx: any) => Promise<Response> | Response;

function requestId() {
  return Math.random().toString(36).slice(2, 10);
}

function methodOf(req: Request) {
  return req.method || "GET";
}

function pathOf(req: Request) {
  try {
    return new URL(req.url).pathname;
  } catch {
    return "unknown";
  }
}

/**
 * Wrap an App Router API handler: request log, try/catch, JSON errors, timing.
 */
export function withApi<T extends AnyHandler>(handler: T, label?: string): T {
  const wrapped: AnyHandler = async (req, ctx) => {
    const id = requestId();
    const method = methodOf(req);
    const path = pathOf(req);
    const name = label || `${method} ${path}`;
    const started = Date.now();

    logger.info("api", `${name} start`, { requestId: id, method, path });

    try {
      const res = await handler(req, ctx);
      const ms = Date.now() - started;
      const status = res.status;
      if (status >= 500) {
        logger.error("api", `${name} ${status}`, { requestId: id, ms });
      } else if (status >= 400) {
        logger.warn("api", `${name} ${status}`, { requestId: id, ms });
      } else {
        logger.info("api", `${name} ${status}`, { requestId: id, ms });
      }

      const headers = new Headers(res.headers);
      headers.set("x-request-id", id);
      return new NextResponse(res.body, {
        status: res.status,
        statusText: res.statusText,
        headers,
      });
    } catch (err) {
      const ms = Date.now() - started;
      if (isAuthError(err)) {
        logger.warn("api", `${name} auth`, {
          requestId: id,
          ms,
          status: err.status,
          message: err.message,
        });
        return fail(err.message, err.status, "api", {
          requestId: id,
          code: "AUTH",
        });
      }

      const message = err instanceof Error ? err.message : "Unknown error";
      const stack = err instanceof Error ? err.stack : undefined;
      logger.error("api", `${name} unhandled`, {
        requestId: id,
        ms,
        message,
        stack,
      });

      return fail(err, 500, "api", {
        requestId: id,
        code: "UNHANDLED",
        ...(process.env.NODE_ENV !== "production" ? { stack } : {}),
      });
    }
  };

  return wrapped as T;
}

export { ok, fail, AuthError };
