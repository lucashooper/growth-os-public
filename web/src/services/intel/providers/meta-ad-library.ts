import "server-only";

import {
  captureScreenshot,
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

/**
 * Meta Ads Library via Playwright (not Meta Marketing API).
 * Architecture allows swapping to API later — same ProviderResult shape.
 */
export const metaAdsDeepProvider: DeepProvider = {
  id: "meta_ads",

  supports(target) {
    return Boolean(
      target.metaPageId?.trim() ||
        target.name?.trim() ||
        target.facebookPage?.trim(),
    );
  },

  async syncCompetitor(target: CompetitorTarget): Promise<ProviderResult> {
    const search =
      target.metaPageId?.trim() ||
      target.facebookPage?.trim() ||
      target.name?.trim() ||
      "";
    if (!search) return emptyResult("meta_ads", "No search term");

    // Optional bypass when Playwright Meta is too flaky in CI
    if (process.env.META_ADS_PLAYWRIGHT === "0") {
      return {
        source: "meta_ads",
        collectedAt: new Date().toISOString(),
        ok: true,
        rawData: { search, skipped: true },
        structuredData: { search, ads: [], configured: false },
        insights: [
          "Meta Ads Playwright disabled (META_ADS_PLAYWRIGHT=0). Set token or enable browser scrape.",
        ],
      };
    }

    try {
      return await withRetry("meta_ads", async () => {
        return withBrowserPage(async (page) => {
          const url = `https://www.facebook.com/ads/library/?active_status=all&ad_type=all&country=ALL&q=${encodeURIComponent(search)}&search_type=keyword_unordered&media_type=all`;
          await gotoWithRateLimit(page, url, {
            timeoutMs: 55_000,
            waitUntil: "domcontentloaded",
          });
          await page.waitForTimeout(3500);

          // Scroll to load more cards
          for (let i = 0; i < 4; i++) {
            await page.mouse.wheel(0, 2200);
            await page.waitForTimeout(1200);
          }

          const ads = await page.evaluate(() => {
            const cards = [
              ...document.querySelectorAll(
                '[class*="ad"], [data-testid*="ad"], div[role="article"]',
              ),
            ].slice(0, 40);
            return cards
              .map((card, idx) => {
                const text = (card.textContent || "")
                  .replace(/\s+/g, " ")
                  .trim()
                  .slice(0, 600);
                if (text.length < 40) return null;
                const links = [...card.querySelectorAll("a")]
                  .map((a) => a.getAttribute("href") || "")
                  .filter(Boolean);
                const imgs = [...card.querySelectorAll("img")]
                  .map((img) => img.getAttribute("src") || "")
                  .filter((s) => s.startsWith("http"));
                return {
                  id: `meta-${idx}-${text.slice(0, 24).replace(/\W+/g, "")}`,
                  copy: text,
                  landing: links.find((l) => !l.includes("facebook.com")) || "",
                  image: imgs[0] || "",
                  platforms: ["facebook", "instagram"],
                };
              })
              .filter(Boolean) as Array<{
              id: string;
              copy: string;
              landing: string;
              image: string;
              platforms: string[];
            }>;
          });

          const pageShot = await captureScreenshot(page, {
            fullPage: false,
            name: `meta-${target.slug}-${Date.now()}.png`,
          });

          const insights: string[] = [];
          if (ads.length >= 6) {
            insights.push(
              `${target.name || search} has ${ads.length} visible Meta creatives.`,
            );
          } else if (ads.length === 0) {
            insights.push(
              `No Meta ads found for “${search}” (library UI may require login or empty results).`,
            );
          } else {
            insights.push(
              `${ads.length} Meta creative(s) visible for “${search}”.`,
            );
          }

          const videoish = ads.filter((a) =>
            /video|watch|reel/i.test(a.copy),
          ).length;
          if (videoish >= 3) {
            insights.push("Creatives skew toward video formats.");
          }

          return {
            source: "meta_ads" as const,
            collectedAt: new Date().toISOString(),
            ok: true,
            rawData: { search, url, adCount: ads.length },
            structuredData: {
              search,
              ads: ads.map((a) => ({
                id: a.id,
                copy: a.copy.slice(0, 280),
                landing: a.landing,
                mediaType: a.image ? "image" : "unknown",
                image: a.image,
                platforms: a.platforms,
                status: "active",
              })),
              adCount: ads.length,
            },
            insights,
            screenshotUrl: pageShot.relativePath,
            assets: [
              {
                kind: "screenshot",
                url: pageShot.relativePath,
                externalId: `meta-page-${Date.now()}`,
                title: `Meta Ads · ${search}`,
              },
              ...ads
                .filter((a) => a.image)
                .slice(0, 20)
                .map((a) => ({
                  kind: "meta_ad",
                  url: a.image,
                  externalId: a.id,
                  title: a.copy.slice(0, 80),
                  meta: {
                    body: a.copy.slice(0, 300),
                    landing: a.landing,
                    platforms: a.platforms,
                  },
                })),
            ],
          };
        });
      });
    } catch (err) {
      return emptyResult(
        "meta_ads",
        err instanceof Error ? err.message : "Meta Ads scrape failed",
      );
    }
  },
};
