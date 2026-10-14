"use client";

/**
 * In-memory GET cache so navigating between app pages doesn't flash
 * Loading… after data was already fetched this session (Whop-style feel).
 */

type Entry = { data: unknown; at: number };

const store = new Map<string, Entry>();
const DEFAULT_TTL_MS = 5 * 60 * 1000;

export function cacheKey(url: string) {
  return url;
}

export function getCachedApi<T>(url: string, ttlMs = DEFAULT_TTL_MS): T | null {
  const entry = store.get(cacheKey(url));
  if (!entry) return null;
  if (Date.now() - entry.at > ttlMs) return null;
  return entry.data as T;
}

/** Return stale data even past TTL (for instant paint + background refresh). */
export function getStaleApi<T>(url: string): T | null {
  const entry = store.get(cacheKey(url));
  return entry ? (entry.data as T) : null;
}

export function setCachedApi(url: string, data: unknown) {
  store.set(cacheKey(url), { data, at: Date.now() });
}

export function invalidateApiCache(match?: string) {
  if (!match) {
    store.clear();
    return;
  }
  for (const key of store.keys()) {
    if (key.includes(match)) store.delete(key);
  }
}
