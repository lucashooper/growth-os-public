import "server-only";

import { completeLogged } from "@/lib/ai/logged";
import {
  buildPackSelectionPrompt,
  formatPackDisplayName,
  matchImagePackFromTranscript,
  type ImagePackMatch,
  type ImagePackRef,
} from "@/lib/image-pack-match";

export { formatPackDisplayName };

type LlmPackParse = {
  imagePackSlug?: string | null;
  reason?: string;
};

/**
 * Resolve image pack from voice transcript: alias/score matcher first, LLM fallback if needed.
 */
export async function resolveImagePackForAgent(opts: {
  transcript: string;
  packs: ImagePackRef[];
  explicitSlug?: string;
  projectId: string;
}): Promise<ImagePackMatch | undefined> {
  const { transcript, packs, explicitSlug, projectId } = opts;

  if (explicitSlug) {
    const explicit = packs.find((p) => p.slug === explicitSlug);
    if (explicit) {
      return {
        slug: explicit.slug,
        name: explicit.name,
        score: 10000,
        source: "alias",
      };
    }
  }

  const deterministic = matchImagePackFromTranscript(transcript, packs);
  const needsLlm =
    !deterministic ||
    (deterministic.source === "score" && deterministic.score < 800);

  if (!needsLlm) return deterministic;

  try {
    const ai = await completeLogged(
      {
        messages: [
          { role: "system", content: buildPackSelectionPrompt(packs) },
          { role: "user", content: transcript },
        ],
        temperature: 0,
        maxTokens: 256,
        json: true,
      },
      { action: "agent_pack_selection", projectId },
    );

    const parsed = JSON.parse(
      ai.content.trim().replace(/^```json\s*|\s*```$/g, ""),
    ) as LlmPackParse;

    const slug = parsed.imagePackSlug?.trim();
    if (slug) {
      const pack = packs.find((p) => p.slug === slug);
      if (pack) {
        return {
          slug: pack.slug,
          name: pack.name,
          score: 8000,
          source: "alias",
        };
      }
    }
  } catch {
    /* fall through to deterministic */
  }

  return deterministic;
}
