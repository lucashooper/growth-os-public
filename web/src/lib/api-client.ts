"use client";

import { getCachedApi, getStaleApi, setCachedApi } from "@/lib/api-cache";

export type ApiResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; retryable: boolean; status: number };

export async function apiFetch<T>(
  input: string,
  init?: RequestInit & {
    retries?: number;
    /** Skip reading/writing the session GET cache */
    skipCache?: boolean;
  },
): Promise<ApiResult<T>> {
  const retries = init?.retries ?? 0;
  const method = (init?.method || "GET").toUpperCase();
  const isGet = method === "GET" && !init?.body;
  const useCache = isGet && !init?.skipCache;

  let lastError = "Request failed";
  let lastStatus = 500;
  let retryable = true;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(input, {
        ...init,
        headers: {
          "Content-Type": "application/json",
          ...(init?.headers ?? {}),
        },
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        lastError = body.error || `HTTP ${res.status}`;
        lastStatus = res.status;
        retryable = Boolean(body.retryable ?? res.status >= 500);
        if (!retryable || attempt === retries) {
          return { ok: false, error: lastError, retryable, status: lastStatus };
        }
        await sleep(400 * (attempt + 1));
        continue;
      }
      const data = body as T;
      if (useCache) setCachedApi(input, data);
      return { ok: true, data };
    } catch (err) {
      lastError = err instanceof Error ? err.message : "Network error";
      lastStatus = 0;
      retryable = true;
      if (attempt === retries) {
        return { ok: false, error: lastError, retryable, status: lastStatus };
      }
      await sleep(400 * (attempt + 1));
    }
  }

  return { ok: false, error: lastError, retryable, status: lastStatus };
}

/** Instant paint helper — prefer fresh cache, fall back to stale. */
export function peekApi<T>(url: string): T | null {
  return getCachedApi<T>(url) ?? getStaleApi<T>(url);
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}
