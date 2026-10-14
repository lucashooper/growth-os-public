import "server-only";

import {
  emptyResult,
  type CompetitorTarget,
  type DeepProvider,
  type ProviderResult,
} from "@/services/intel/providers/types";

export function parseAppStoreId(raw: string): string | null {
  const t = raw.trim();
  if (!t) return null;
  if (/^\d+$/.test(t)) return t;
  const m = t.match(/id(\d+)/i) || t.match(/\/(\d+)(?:\?|$)/);
  return m?.[1] || null;
}

export const appStoreDeepProvider: DeepProvider = {
  id: "app_store",

  supports(target) {
    return Boolean(target.appStoreUrl?.trim());
  },

  async syncCompetitor(target: CompetitorTarget): Promise<ProviderResult> {
    const id = parseAppStoreId(target.appStoreUrl);
    if (!id) {
      return emptyResult("app_store", "Could not parse App Store id");
    }

    try {
      const res = await fetch(
        `https://itunes.apple.com/lookup?id=${encodeURIComponent(id)}`,
        { signal: AbortSignal.timeout(15_000) },
      );
      const json = (await res.json()) as {
        results?: Array<Record<string, unknown>>;
      };
      const app = json.results?.[0];
      if (!app) return emptyResult("app_store", "App not found in iTunes Lookup");

      const screenshots = [
        ...((app.screenshotUrls as string[]) || []),
        ...((app.ipadScreenshotUrls as string[]) || []),
      ].slice(0, 12);
      const artwork = String(
        app.artworkUrl512 || app.artworkUrl100 || "",
      );

      const structured = {
        id,
        name: String(app.trackName || ""),
        subtitle: String(app.trackCensoredName || ""),
        rating: Number(app.averageUserRating || 0) || null,
        ratingsCount: Number(app.userRatingCount || 0) || null,
        version: String(app.version || ""),
        releaseNotes: String(app.releaseNotes || "").slice(0, 3000),
        description: String(app.description || "").slice(0, 4000),
        releaseDate: String(app.currentVersionReleaseDate || ""),
        sellerName: String(app.sellerName || ""),
        url: String(app.trackViewUrl || ""),
        icon: artwork,
        screenshots,
      };

      const insights: string[] = [];
      if (structured.rating != null) {
        insights.push(
          `iOS rating ${structured.rating.toFixed(1)}★ (${structured.ratingsCount?.toLocaleString() || 0} ratings).`,
        );
      }
      if (structured.releaseNotes) {
        insights.push(`Latest release notes available (v${structured.version}).`);
      }
      if (screenshots.length) {
        insights.push(`${screenshots.length} App Store screenshots collected.`);
      }

      return {
        source: "app_store",
        collectedAt: new Date().toISOString(),
        ok: true,
        rawData: { id, resultKeys: Object.keys(app) },
        structuredData: structured,
        insights,
        assets: [
          ...(artwork
            ? [
                {
                  kind: "screenshot",
                  url: artwork,
                  externalId: `ios-icon-${id}`,
                  title: structured.name,
                },
              ]
            : []),
          ...screenshots.map((url, i) => ({
            kind: "screenshot",
            url,
            externalId: `ios-ss-${id}-${i}`,
            title: `${structured.name} screenshot ${i + 1}`,
          })),
        ],
      };
    } catch (err) {
      return emptyResult(
        "app_store",
        err instanceof Error ? err.message : "App Store lookup failed",
      );
    }
  },
};
