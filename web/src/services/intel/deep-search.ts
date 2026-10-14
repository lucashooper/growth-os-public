import "server-only";

import {
  gotoWithRateLimit,
  withBrowserPage,
  withRetry,
} from "@/services/intel/browser-pool";
import { logger } from "@/lib/logger";

export type DeepSearchCandidate = {
  name: string;
  websiteUrl?: string;
  appStoreUrl?: string;
  playStoreUrl?: string;
  tiktokHandle?: string;
  reason: string;
};

/**
 * Deep Search — discover competitor candidates from a natural-language query.
 * Uses DuckDuckGo HTML (no API key). Results are suggestions; user confirms add.
 */
export async function deepSearchCompetitors(
  query: string,
): Promise<DeepSearchCandidate[]> {
  const q = query.trim();
  if (!q) return [];

  try {
    return await withRetry(
      "deep_search",
      async () =>
        withBrowserPage(async (page) => {
          const searchUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(
            `${q} app OR tiktok OR "app store"`,
          )}`;
          await gotoWithRateLimit(page, searchUrl, { timeoutMs: 35_000 });
          await page.waitForTimeout(1500);

          const links = await page.evaluate(() => {
            return [...document.querySelectorAll("a.result__a, a.result-link")]
              .map((a) => ({
                title: (a.textContent || "").replace(/\s+/g, " ").trim(),
                href: (a as HTMLAnchorElement).href,
              }))
              .filter((x) => x.title && x.href)
              .slice(0, 20);
          });

          const candidates: DeepSearchCandidate[] = [];
          const seen = new Set<string>();

          for (const link of links) {
            let host = "";
            try {
              host = new URL(link.href).hostname.replace(/^www\./, "");
            } catch {
              continue;
            }
            if (
              /duckduckgo|google\.|facebook\.|wikipedia|youtube\.com\/watch/i.test(
                host,
              )
            ) {
              continue;
            }

            const name =
              link.title.split(/[-|–]/)[0]?.trim().slice(0, 60) || host;
            const key = name.toLowerCase();
            if (seen.has(key)) continue;
            seen.add(key);

            const isAppStore = /apps\.apple\.com/i.test(link.href);
            const isPlay = /play\.google\.com/i.test(link.href);
            const isTikTok = /tiktok\.com\/@/i.test(link.href);

            candidates.push({
              name,
              websiteUrl: !isAppStore && !isPlay && !isTikTok ? link.href : undefined,
              appStoreUrl: isAppStore ? link.href : undefined,
              playStoreUrl: isPlay ? link.href : undefined,
              tiktokHandle: isTikTok
                ? link.href.match(/tiktok\.com\/@([^/?]+)/i)?.[1]
                : undefined,
              reason: `Matched “${q}” via web search · ${host}`,
            });
          }

          // Heuristic: also propose TikTok-style handles from query words
          const slug = q
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "")
            .slice(0, 20);
          if (slug && candidates.length < 8) {
            candidates.push({
              name: q,
              tiktokHandle: slug,
              reason: `Suggested TikTok handle from query (verify before sync)`,
            });
          }

          return candidates.slice(0, 12);
        }),
      { attempts: 2 },
    );
  } catch (err) {
    logger.warn("sync", "Deep search failed", {
      err: err instanceof Error ? err.message : String(err),
    });
    // Soft fallback suggestions
    return [
      {
        name: q,
        reason: "Search unavailable — add manually with website / TikTok / app links",
      },
    ];
  }
}
