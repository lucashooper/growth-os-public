import "server-only";

import {
  captureHtmlSnapshot,
  captureScreenshot,
  contentFingerprint,
  gotoWithRateLimit,
  readHtmlCache,
  withBrowserPage,
  withRetry,
  writeHtmlCache,
} from "@/services/intel/browser-pool";
import {
  emptyResult,
  type CompetitorTarget,
  type DeepProvider,
  type ProviderResult,
} from "@/services/intel/providers/types";

function normalizeUrl(raw: string): string | null {
  const t = raw.trim();
  if (!t) return null;
  try {
    return new URL(t.startsWith("http") ? t : `https://${t}`).toString();
  } catch {
    return null;
  }
}

async function extractPageFacts(page: import("playwright").Page) {
  return page.evaluate(() => {
    const text = (el: Element | null) =>
      (el?.textContent || "").replace(/\s+/g, " ").trim();
    const meta = (name: string) => {
      const el =
        document.querySelector(`meta[name="${name}"]`) ||
        document.querySelector(`meta[property="${name}"]`) ||
        document.querySelector(`meta[property="og:${name}"]`);
      return el?.getAttribute("content") || "";
    };
    const headings = [...document.querySelectorAll("h1,h2,h3")]
      .map((h) => text(h))
      .filter(Boolean)
      .slice(0, 40);
    const ctas = [
      ...document.querySelectorAll(
        "a,button,[role='button'],input[type='submit']",
      ),
    ]
      .map((el) => text(el))
      .filter(
        (t) =>
          t.length > 1 &&
          t.length < 60 &&
          /start|try|get|download|sign|join|free|buy|pricing|book|demo/i.test(
            t,
          ),
      )
      .slice(0, 20);
    const nav = [...document.querySelectorAll("nav a")]
      .map((a) => text(a))
      .filter(Boolean)
      .slice(0, 30);
    const footer = text(document.querySelector("footer")).slice(0, 800);
    const pricingBlocks = [...document.querySelectorAll("section,div")]
      .map((el) => text(el))
      .filter((t) => /\$|€|£|\/mo|per month|pricing|free plan/i.test(t))
      .filter((t) => t.length > 20 && t.length < 400)
      .slice(0, 8);
    const features = [...document.querySelectorAll("section")]
      .map((s) => {
        const h = text(s.querySelector("h1,h2,h3"));
        if (!h) return null;
        return { heading: h, body: text(s).slice(0, 280) };
      })
      .filter(Boolean)
      .slice(0, 12);

    return {
      title: document.title || meta("title") || meta("og:title"),
      description: meta("description") || meta("og:description"),
      headings,
      ctas: [...new Set(ctas)],
      nav: [...new Set(nav)],
      footer,
      pricingBlocks,
      features,
      ogImage: meta("og:image"),
    };
  });
}

export const websiteDeepProvider: DeepProvider = {
  id: "website",

  supports(target) {
    return Boolean(target.websiteUrl?.trim());
  },

  async syncCompetitor(target: CompetitorTarget): Promise<ProviderResult> {
    const url = normalizeUrl(target.websiteUrl);
    if (!url) return emptyResult("website", "Invalid website URL");

    try {
      return await withRetry("website", async () => {
        const cached = await readHtmlCache(url);
        return withBrowserPage(async (page) => {
          await gotoWithRateLimit(page, url, { timeoutMs: 40_000 });
          await page.waitForTimeout(1200);
          const facts = await extractPageFacts(page);
          const shot = await captureScreenshot(page, {
            fullPage: true,
            name: `web-${target.slug}-${Date.now()}.png`,
          });
          const snap = await captureHtmlSnapshot(page, {
            name: `web-${target.slug}-${Date.now()}.html`,
          });
          await writeHtmlCache(url, snap.html);

          const fingerprint = contentFingerprint(
            JSON.stringify({
              title: facts.title,
              headings: facts.headings.slice(0, 10),
              ctas: facts.ctas.slice(0, 8),
              pricing: facts.pricingBlocks.slice(0, 3),
            }),
          );

          const insights: string[] = [];
          if (facts.pricingBlocks.length) {
            insights.push("Pricing section detected on homepage.");
          }
          if (facts.ctas.length) {
            insights.push(
              `Primary CTAs: ${facts.ctas.slice(0, 3).join(", ")}.`,
            );
          }
          if (cached && contentFingerprint(cached.slice(0, 5000)) !== contentFingerprint(snap.html.slice(0, 5000))) {
            insights.push("Homepage HTML changed since last cache.");
          }

          return {
            source: "website" as const,
            collectedAt: new Date().toISOString(),
            ok: true,
            rawData: { url, htmlLength: snap.html.length },
            structuredData: { url, ...facts },
            insights,
            assets: [
              {
                kind: "screenshot",
                url: shot.relativePath,
                externalId: `homepage-${fingerprint.slice(0, 12)}`,
                title: facts.title || "Homepage",
              },
              ...(facts.ogImage
                ? [
                    {
                      kind: "og_image",
                      url: facts.ogImage,
                      externalId: "og-primary",
                      title: facts.title,
                    },
                  ]
                : []),
            ],
            fingerprint,
            screenshotUrl: shot.relativePath,
            htmlPath: snap.relativePath,
          };
        });
      });
    } catch (err) {
      return emptyResult(
        "website",
        err instanceof Error ? err.message : "Website sync failed",
      );
    }
  },
};

/** Alias — landing page uses same deep website crawl for now */
export const landingPageProvider: DeepProvider = {
  id: "landing_page",
  supports: (t) => websiteDeepProvider.supports(t),
  syncCompetitor: async (t) => {
    const r = await websiteDeepProvider.syncCompetitor(t);
    return { ...r, source: "landing_page" };
  },
};
