import "server-only";

import type { Browser, BrowserContext, Page } from "playwright";
import { createHash } from "crypto";
import { mkdir, writeFile, readFile, access } from "fs/promises";
import path from "path";
import { logger } from "@/lib/logger";
import { canUsePlaywright } from "@/services/intel/playwright-env";

export { canUsePlaywright } from "@/services/intel/playwright-env";

/**
 * Shared Playwright automation layer for the Deep Intelligence Engine.
 * - One browser process (lazy)
 * - Rate limiting across navigations
 * - Retry with backoff
 * - Screenshot + HTML snapshot helpers
 * - Simple disk cache for page HTML
 */

let browserPromise: Promise<Browser> | null = null;

export class PlaywrightUnavailableError extends Error {
  constructor(message = "Playwright is not available in this environment") {
    super(message);
    this.name = "PlaywrightUnavailableError";
  }
}

const RATE_MS = Number(process.env.INTEL_BROWSER_RATE_MS || 1200);
let lastNavAt = 0;
const navQueue: Array<() => void> = [];
let draining = false;

async function drainQueue() {
  if (draining) return;
  draining = true;
  while (navQueue.length) {
    const wait = Math.max(0, RATE_MS - (Date.now() - lastNavAt));
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    const next = navQueue.shift();
    lastNavAt = Date.now();
    next?.();
  }
  draining = false;
}

function enqueueRateLimit(): Promise<void> {
  return new Promise((resolve) => {
    navQueue.push(resolve);
    void drainQueue();
  });
}

export async function getSharedBrowser(): Promise<Browser> {
  if (!canUsePlaywright()) {
    throw new PlaywrightUnavailableError(
      "Playwright/Chromium cannot run on Netlify serverless. Sync uses HTML/oEmbed fallbacks; run browser sync locally or on a long-running host.",
    );
  }
  if (!browserPromise) {
    browserPromise = (async () => {
      const { chromium } = await import("playwright");
      return chromium.launch({
        headless: true,
        args: [
          "--disable-blink-features=AutomationControlled",
          "--no-sandbox",
          "--disable-dev-shm-usage",
        ],
      });
    })().catch((err) => {
      browserPromise = null;
      throw err;
    });
  }
  const browser = await browserPromise;
  if (!browser.isConnected()) {
    browserPromise = null;
    return getSharedBrowser();
  }
  return browser;
}

export type SessionOptions = {
  userAgent?: string;
  locale?: string;
  viewport?: { width: number; height: number };
};

export async function withBrowserPage<T>(
  fn: (page: Page, context: BrowserContext) => Promise<T>,
  opts?: SessionOptions,
): Promise<T> {
  const browser = await getSharedBrowser();
  const context = await browser.newContext({
    userAgent:
      opts?.userAgent ||
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    locale: opts?.locale || "en-US",
    viewport: opts?.viewport || { width: 1280, height: 900 },
  });
  const page = await context.newPage();
  try {
    return await fn(page, context);
  } finally {
    await context.close().catch(() => undefined);
  }
}

export async function withRetry<T>(
  label: string,
  fn: () => Promise<T>,
  opts?: { attempts?: number; baseDelayMs?: number },
): Promise<T> {
  const attempts = opts?.attempts ?? 3;
  const base = opts?.baseDelayMs ?? 800;
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      logger.warn("sync", `Browser retry ${label} (${i + 1}/${attempts})`, {
        err: err instanceof Error ? err.message : String(err),
      });
      await new Promise((r) => setTimeout(r, base * Math.pow(2, i)));
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

export async function gotoWithRateLimit(
  page: Page,
  url: string,
  opts?: { timeoutMs?: number; waitUntil?: "domcontentloaded" | "load" | "networkidle" },
) {
  await enqueueRateLimit();
  await page.goto(url, {
    waitUntil: opts?.waitUntil || "domcontentloaded",
    timeout: opts?.timeoutMs ?? 45_000,
  });
}

function cacheRoot() {
  return path.join(process.cwd(), ".intel-cache");
}

function cacheKey(url: string) {
  return createHash("sha256").update(url).digest("hex").slice(0, 24);
}

export async function readHtmlCache(
  url: string,
  maxAgeMs = 6 * 60 * 60 * 1000,
): Promise<string | null> {
  try {
    const file = path.join(cacheRoot(), `${cacheKey(url)}.html`);
    const metaFile = path.join(cacheRoot(), `${cacheKey(url)}.meta.json`);
    await access(file);
    const meta = JSON.parse(await readFile(metaFile, "utf8")) as {
      at: number;
    };
    if (Date.now() - meta.at > maxAgeMs) return null;
    return readFile(file, "utf8");
  } catch {
    return null;
  }
}

export async function writeHtmlCache(url: string, html: string) {
  try {
    const root = cacheRoot();
    await mkdir(root, { recursive: true });
    const key = cacheKey(url);
    await writeFile(path.join(root, `${key}.html`), html, "utf8");
    await writeFile(
      path.join(root, `${key}.meta.json`),
      JSON.stringify({ at: Date.now(), url }),
      "utf8",
    );
  } catch (err) {
    logger.warn("sync", "HTML cache write failed", {
      err: err instanceof Error ? err.message : String(err),
    });
  }
}

export async function captureScreenshot(
  page: Page,
  opts?: { fullPage?: boolean; name?: string },
): Promise<{ buffer: Buffer; relativePath: string }> {
  const root = path.join(process.cwd(), "public", "intel-screenshots");
  await mkdir(root, { recursive: true });
  const name =
    opts?.name ||
    `shot-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.png`;
  const abs = path.join(root, name);
  const buffer = Buffer.from(
    await page.screenshot({ fullPage: opts?.fullPage ?? true, type: "png" }),
  );
  await writeFile(abs, buffer);
  return { buffer, relativePath: `/intel-screenshots/${name}` };
}

export async function captureHtmlSnapshot(
  page: Page,
  opts?: { name?: string },
): Promise<{ html: string; relativePath: string }> {
  const html = await page.content();
  const root = path.join(process.cwd(), "public", "intel-html");
  await mkdir(root, { recursive: true });
  const name =
    opts?.name ||
    `page-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.html`;
  await writeFile(path.join(root, name), html, "utf8");
  return { html, relativePath: `/intel-html/${name}` };
}

/** Content hash for change detection between versions */
export function contentFingerprint(input: string): string {
  return createHash("sha256").update(input).digest("hex").slice(0, 32);
}
