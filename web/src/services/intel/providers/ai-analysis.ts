import "server-only";

import { completeLogged } from "@/lib/ai/logged";
import type {
  CompetitorTarget,
  DeepProvider,
  ProviderResult,
} from "@/services/intel/providers/types";

/**
 * Cross-provider AI analysis. Consumes other providers' structured outputs
 * (passed via target signals / previous results in engine).
 */
export function createAiAnalysisProvider(
  priorResults: ProviderResult[],
): DeepProvider {
  return {
    id: "ai_analysis",

    supports() {
      return priorResults.some((r) => r.ok);
    },

    async syncCompetitor(target: CompetitorTarget): Promise<ProviderResult> {
      const digest = priorResults
        .filter((r) => r.ok)
        .map(
          (r) =>
            `## ${r.source}\nInsights: ${r.insights.join(" | ") || "none"}\nData: ${JSON.stringify(r.structuredData).slice(0, 1200)}`,
        )
        .join("\n\n");

      const fallbackInsights = priorResults.flatMap((r) => r.insights).slice(0, 8);
      let insights = fallbackInsights;

      try {
        const result = await completeLogged(
          {
            messages: [
              {
                role: "system",
                content:
                  "You are a growth intelligence analyst. Return 4-7 short bullets answering: what should this creator do next based on competitor signals? No fluff.",
              },
              {
                role: "user",
                content: `Competitor: ${target.name || target.handle || target.slug}\nNiche: ${target.niche}\n\nProvider digest:\n${digest || "(empty)"}`,
              },
            ],
            temperature: 0.4,
            maxTokens: 700,
          },
          { action: "ai_analysis_provider", projectId: target.projectId },
        );
        const lines = result.content
          .split("\n")
          .map((l) => l.replace(/^[•\-*]\s*/, "").trim())
          .filter((l) => l.length > 12);
        if (lines.length) insights = lines.slice(0, 8);
      } catch {
        /* keep deterministic */
      }

      return {
        source: "ai_analysis",
        collectedAt: new Date().toISOString(),
        ok: true,
        rawData: { providers: priorResults.map((r) => r.source) },
        structuredData: {
          recommendation: insights[0] || "Collect more competitor data.",
          bullets: insights,
        },
        insights,
      };
    },
  };
}
