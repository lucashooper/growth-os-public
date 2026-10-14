import "server-only";

import {
  gotoWithRateLimit,
  withBrowserPage,
  withRetry,
} from "@/services/intel/browser-pool";
import {
  emptyResult,
  type CompetitorTarget,
  type DeepProvider,
  type ProviderResult,
} from "@/services/intel/providers/types";

export function parsePlayStoreId(raw: string): string | null {
  const t = raw.trim();
  if (!t) return null;
  if (/^[a-z][a-z0-9_]*(\.[a-z0-9_]+)+$/i.test(t)) return t;
  try {
    const u = new URL(t.startsWith("http") ? t : `https://${t}`);
    return u.searchParams.get("id");
  } catch {
    const m = t.match(/id=([a-zA-Z0-9._]+)/);
    return m?.[1] || null;
  }
}

export const playStoreDeepProvider: DeepProvider = {
  id: "play_store",

  supports(target) {
    return Boolean(target.playStoreUrl?.trim());
  },

  async syncCompetitor(target: CompetitorTarget): Promise<ProviderResult> {
    const id = parsePlayStoreId(target.playStoreUrl);
    if (!id) {
      return emptyResult("play_store", "Could not parse Play Store package id");
    }
    const url = `https://play.google.com/store/apps/details?id=${encodeURIComponent(id)}&hl=en&gl=US`;

    try {
      return await withRetry(
        "play_store",
        async () =>
          withBrowserPage(async (page) => {
            await gotoWithRateLimit(page, url, { timeoutMs: 40_000 });
            await page.waitForTimeout(2000);
            const data = await page.evaluate(() => {
              const text = (sel: string) =>
                (document.querySelector(sel)?.textContent || "")
                  .replace(/\s+/g, " ")
                  .trim();
              const name =
                text('h1[itemprop="name"]') ||
                text("h1") ||
                document.title.split("-")[0]?.trim() ||
                "";
              const ratingText =
                text('[itemprop="starRating"]') ||
                (document.body.innerText.match(/Rated ([\d.]+) stars/i) ||
                  [])[1] ||
                "";
              const rating = parseFloat(ratingText) || null;
              const icon =
                (
                  document.querySelector(
                    'img[alt="Icon image"], img[itemprop="image"]',
                  ) as HTMLImageElement | null
                )?.src || "";
              const description = text('[data-g-id="description"]') || "";
              const screenshots = [
                ...document.querySelectorAll(
                  'img[alt*="Screenshot"], img[src*="play-lh"]',
                ),
              ]
                .map((img) => (img as HTMLImageElement).src)
                .filter(Boolean)
                .slice(0, 10);
              return { name, rating, icon, description, screenshots };
            });

            if (!data.name && data.rating == null) {
              return emptyResult(
                "play_store",
                "Could not parse Play Store page",
              );
            }

            const insights: string[] = [];
            if (data.rating != null) {
              insights.push(`Android rating ${data.rating.toFixed(1)}★.`);
            }
            if (data.screenshots.length) {
              insights.push(
                `${data.screenshots.length} Play Store screenshots collected.`,
              );
            }

            return {
              source: "play_store" as const,
              collectedAt: new Date().toISOString(),
              ok: true,
              rawData: { id, url },
              structuredData: { id, url, ...data },
              insights,
              assets: [
                ...(data.icon
                  ? [
                      {
                        kind: "screenshot",
                        url: data.icon,
                        externalId: `android-icon-${id}`,
                        title: data.name,
                      },
                    ]
                  : []),
                ...data.screenshots.map((s, i) => ({
                  kind: "screenshot",
                  url: s,
                  externalId: `android-ss-${id}-${i}`,
                  title: `${data.name} screenshot ${i + 1}`,
                })),
              ],
            };
          }),
        { attempts: 2 },
      );
    } catch (err) {
      return emptyResult(
        "play_store",
        err instanceof Error ? err.message : "Play Store sync failed",
      );
    }
  },
};
