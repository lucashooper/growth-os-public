export type ImagePackRef = {
  slug: string;
  name: string;
  description?: string;
};

export type ImagePackMatch = {
  slug: string;
  name: string;
  score: number;
  source: "alias" | "score" | "guard";
};

const MIN_MATCH_SCORE = 60;

/** Canonical alias groups — longest alias wins at match time. */
export const PACK_ALIAS_GROUPS: {
  key: string;
  aliases: string[];
  rankPack: (pack: ImagePackRef) => number;
}[] = [
  {
    key: "insight_philosophy",
    aliases: [
      "insight philosophy",
      "insights philosophy",
      "insight-philosophy",
      "insight brand",
      "insight app",
      "zeno philosophy",
      "insight philosophy pack",
    ],
    rankPack: (pack) => {
      const id = `${pack.slug} ${pack.name} ${pack.description || ""}`.toLowerCase();
      if (/insight/.test(id) && /philosoph/.test(id)) return 300;
      if (/zeno-philosophy|insight-philosophy/.test(pack.slug)) return 280;
      if (/insight/.test(id) && !/philosopher/.test(pack.name.toLowerCase())) return 120;
      return 0;
    },
  },
  {
    key: "philosopher",
    aliases: [
      "classical philosophy",
      "paper and books",
      "philosopher pack",
      "philosopher",
      "philosophy",
      "stoic",
      "statues",
    ],
    rankPack: (pack) => {
      const id = `${pack.slug} ${pack.name}`.toLowerCase();
      if (/insight|zeno/.test(id)) return 0;
      if (pack.slug === "philosopher") return 250;
      if (/\bphilosopher\b/.test(pack.name.toLowerCase())) return 200;
      if (/philosoph/.test(id) && !/insight|zeno/.test(id)) return 150;
      return 0;
    },
  },
  {
    key: "dark_academia",
    aliases: ["dark academia", "dark luxury", "dark luxe", "academia", "vintage library"],
    rankPack: (pack) => {
      const id = `${pack.slug} ${pack.name}`.toLowerCase();
      if (/dark/.test(id) && /(lux|academ|luxe)/.test(id)) return 200;
      if (/dark academia|vintage library/.test(id)) return 180;
      return 0;
    },
  },
  {
    key: "gym_aesthetic",
    aliases: ["gym aesthetic", "gym stoic", "gym", "fitness", "workout"],
    rankPack: (pack) => {
      const id = `${pack.slug} ${pack.name}`.toLowerCase();
      if (/gym|stoic|fitness|workout/.test(id)) return 180;
      return 0;
    },
  },
  {
    key: "nature",
    aliases: ["nature", "forest", "landscape"],
    rankPack: (pack) => {
      const id = `${pack.slug} ${pack.name}`.toLowerCase();
      if (/\bnature\b/.test(id)) return 180;
      if (/forest|landscape/.test(id)) return 120;
      return 0;
    },
  },
  {
    key: "girl_aesthetic",
    aliases: ["girl aesthetic", "girl-aesthetic", "dallas aesthetic"],
    rankPack: (pack) => {
      const id = `${pack.slug} ${pack.name}`.toLowerCase();
      if (/girl/.test(id) && /aesthetic/.test(id)) return 200;
      return 0;
    },
  },
];

export function normalizePackText(text: string): string {
  return text
    .toLowerCase()
    .replace(/['']/g, "'")
    .replace(/[^a-z0-9\s-]/g, " ")
    .replace(/[\s-]+/g, " ")
    .trim();
}

function tokenize(text: string): string[] {
  return normalizePackText(text).split(" ").filter(Boolean);
}

function canonicalToken(token: string): string {
  if (token === "insights") return "insight";
  if (token === "philosophies") return "philosophy";
  return token;
}

function canonicalTokens(text: string): string[] {
  return tokenize(text).map(canonicalToken);
}

function addVariant(set: Set<string>, value: string) {
  const normalized = normalizePackText(value);
  if (!normalized || normalized.length < 2) return;
  set.add(normalized);
}

function packVariants(pack: ImagePackRef): string[] {
  const variants = new Set<string>();

  addVariant(variants, pack.slug);
  addVariant(variants, pack.name);
  addVariant(variants, pack.name.replace(/\s+collection$/i, ""));

  const tokens = [
    ...new Set([
      ...canonicalTokens(pack.name),
      ...canonicalTokens(pack.slug),
    ]),
  ];

  if (tokens.includes("insight") && tokens.includes("philosophy")) {
    addVariant(variants, "insight philosophy");
    addVariant(variants, "insights philosophy");
  }

  if (tokens.includes("zeno")) {
    addVariant(variants, "zeno philosophy");
  }

  if (tokens.includes("philosopher") && !tokens.includes("insight")) {
    addVariant(variants, "philosopher");
  }

  return [...variants].sort((a, b) => b.length - a.length);
}

function extractExplicitPackPhrase(transcript: string): string | undefined {
  const normalized = normalizePackText(transcript);

  const imagePack = normalized.match(
    /(?:with|using|from)\s+(?:the\s+)?(.+?)\s+image\s+pack\b/,
  );
  if (imagePack?.[1]) return imagePack[1].trim();

  const genericPack = normalized.match(
    /(?:with|using|from)\s+(?:the\s+)?(.+?)\s+pack\b/,
  );
  if (genericPack?.[1]) return genericPack[1].trim();

  return undefined;
}

function transcriptContainsAlias(normalizedTranscript: string, alias: string): boolean {
  const normalizedAlias = normalizePackText(alias);
  if (!normalizedAlias) return false;
  if (normalizedTranscript.includes(normalizedAlias)) return true;

  const aliasTokens = canonicalTokens(normalizedAlias);
  const transcriptTokens = canonicalTokens(normalizedTranscript);
  if (aliasTokens.length === 1) {
    return transcriptTokens.includes(aliasTokens[0]!);
  }

  return aliasTokens.every((token) => transcriptTokens.includes(token));
}

function matchByAlias(
  transcript: string,
  packs: ImagePackRef[],
): ImagePackMatch | undefined {
  const normalized = normalizePackText(transcript);
  const tokens = canonicalTokens(transcript);
  const hasInsight = tokens.includes("insight");
  const hasPhilosophy = tokens.includes("philosophy");

  const aliasEntries = PACK_ALIAS_GROUPS.flatMap((group) =>
    group.aliases.map((alias) => ({
      group,
      alias,
      length: normalizePackText(alias).length,
    })),
  ).sort((a, b) => b.length - a.length);

  for (const { group, alias } of aliasEntries) {
    if (!transcriptContainsAlias(normalized, alias)) continue;

    if (
      group.key === "philosopher" &&
      hasInsight &&
      hasPhilosophy &&
      alias !== "classical philosophy"
    ) {
      continue;
    }

    let bestPack: ImagePackRef | undefined;
    let bestRank = 0;

    for (const pack of packs) {
      const rank = group.rankPack(pack);
      if (rank > bestRank) {
        bestRank = rank;
        bestPack = pack;
      }
    }

    if (bestPack && bestRank > 0) {
      return {
        slug: bestPack.slug,
        name: bestPack.name,
        score: 5000 + bestRank + alias.length,
        source: "alias",
      };
    }
  }

  return undefined;
}

function scorePack(transcript: string, pack: ImagePackRef): number {
  const text = normalizePackText(transcript);
  const textTokens = canonicalTokens(text);
  const explicitPhrase = extractExplicitPackPhrase(transcript);
  const variants = packVariants(pack);
  const packTokens = [
    ...new Set([
      ...canonicalTokens(pack.name),
      ...canonicalTokens(pack.slug),
    ]),
  ].filter((t) => t.length > 2);
  let score = 0;

  if (explicitPhrase) {
    const phrase = normalizePackText(explicitPhrase);
    const phraseTokens = canonicalTokens(explicitPhrase);
    const phraseIsSingleWord = phraseTokens.length === 1;

    if (phraseIsSingleWord) {
      const phraseToken = phraseTokens[0]!;
      const slugNorm = normalizePackText(pack.slug);
      const nameNorm = normalizePackText(pack.name);

      if (slugNorm === phrase || nameNorm === phrase) score += 2500;
      if (packTokens.length === 1 && packTokens[0] === phraseToken) score += 1800;
      if (
        packTokens.length > 1 &&
        packTokens.includes(phraseToken) &&
        nameNorm !== phrase &&
        slugNorm !== phrase
      ) {
        score -= 350;
      }
    }

    for (const variant of variants) {
      if (phrase === variant) score += 1200;
      else if (phrase.includes(variant) && variant.length >= 5) {
        score += 700 + variant.length * 8;
      } else if (variant.includes(phrase) && phrase.length >= 5) {
        score += 500 + phrase.length * 8;
      }
    }

    const matchedTokens = packTokens.filter((token) =>
      phraseTokens.includes(token),
    );

    if (packTokens.length >= 2 && matchedTokens.length === packTokens.length) {
      score += 350 + matchedTokens.length * 40;
    } else if (matchedTokens.length > 0) {
      score += matchedTokens.length * 35;
      if (packTokens.length >= 2) {
        score -= 80 * (packTokens.length - matchedTokens.length);
      }
    }

    if (
      packTokens.length === 1 &&
      phraseTokens.length >= 2 &&
      !phraseTokens.includes(packTokens[0]!)
    ) {
      score -= 250;
    }
  }

  for (const variant of variants) {
    if (variant.length < 3) continue;
    if (!text.includes(variant)) continue;
    score += 120 + variant.length * 6;
    if (variant.includes(" ")) score += 80;
  }

  const matchedInText = packTokens.filter((token) =>
    textTokens.includes(token),
  );

  if (packTokens.length >= 2 && matchedInText.length === packTokens.length) {
    score += 180 + matchedInText.length * 25;
  } else if (matchedInText.length > 0) {
    score += matchedInText.length * 18;
    if (packTokens.length >= 2) {
      score -= 60 * (packTokens.length - matchedInText.length);
    }
  }

  if (
    packTokens.length === 1 &&
    packTokens[0] === "philosopher" &&
    (textTokens.includes("insight") || text.includes("insight philosophy"))
  ) {
    score -= 500;
  }

  return score;
}

function applyInsightPhilosophyGuard(
  transcript: string,
  match: ImagePackMatch | undefined,
  packs: ImagePackRef[],
): ImagePackMatch | undefined {
  const tokens = canonicalTokens(transcript);
  if (!tokens.includes("insight") || !tokens.includes("philosophy")) {
    return match;
  }

  const insightPhilosophyPack = [...packs]
    .map((pack) => ({ pack, rank: PACK_ALIAS_GROUPS[0]!.rankPack(pack) }))
    .filter((entry) => entry.rank > 0)
    .sort((a, b) => b.rank - a.rank)[0]?.pack;

  if (!insightPhilosophyPack) return match;

  const matchedIsGenericPhilosopher =
    match &&
    !/insight|zeno/i.test(`${match.slug} ${match.name}`) &&
    /philosoph|philosopher/i.test(`${match.slug} ${match.name}`);

  if (!match || matchedIsGenericPhilosopher) {
    return {
      slug: insightPhilosophyPack.slug,
      name: insightPhilosophyPack.name,
      score: 9000,
      source: "guard",
    };
  }

  return match;
}

export function formatPackDisplayName(name: string): string {
  return name.replace(/-/g, " ").replace(/\s+/g, " ").trim();
}

export function buildPackSelectionPrompt(packs: ImagePackRef[]): string {
  const packLines = packs
    .map((p) => `- slug: "${p.slug}" · name: "${p.name}"`)
    .join("\n");

  return `You extract the imagePack parameter from voice commands for slideshow generation.

Available image packs:
${packLines}

Disambiguation rules (strict):
- Any mention of "Insight", "Insight app", "Insight philosophy", or "insights philosophy" MUST map to the Insight brand pack (slug containing insight/zeno-philosophy — NOT the generic Philosopher pack).
- Generic philosophy / stoic / statues / classical mentions WITHOUT "Insight" map to the Philosopher pack (slug: philosopher).
- Prefer the longest, most specific pack name match over shorter partial matches.

Few-shot examples:
- "five slide slideshow with the insight philosophy image pack" → imagePack slug for Insight-Philosophy / zeno-philosophy
- "create slides using the philosopher pack" → imagePack: "philosopher"
- "slideshow with dark luxury pack" → imagePack for Dark Luxury
- "use insight app visuals" → imagePack for Insight brand pack

Return JSON only: {"imagePackSlug":"<slug or null>","reason":"<short>"}`;
}

export function matchImagePackFromTranscript(
  transcript: string,
  packs: ImagePackRef[],
): ImagePackMatch | undefined {
  const trimmed = transcript.trim();
  if (!trimmed || packs.length === 0) return undefined;

  const aliasMatch = matchByAlias(trimmed, packs);
  if (aliasMatch) return aliasMatch;

  let best: ImagePackMatch | undefined;

  const sortedPacks = [...packs].sort(
    (a, b) =>
      normalizePackText(b.name).length +
      normalizePackText(b.slug).length -
      (normalizePackText(a.name).length + normalizePackText(a.slug).length),
  );

  for (const pack of sortedPacks) {
    const score = scorePack(trimmed, pack);
    if (score < MIN_MATCH_SCORE) continue;

    if (
      !best ||
      score > best.score ||
      (score === best.score && pack.name.length > best.name.length)
    ) {
      best = { slug: pack.slug, name: pack.name, score, source: "score" };
    }
  }

  return applyInsightPhilosophyGuard(trimmed, best, packs);
}

export function matchImagePackSlugFromTranscript(
  transcript: string,
  packs: ImagePackRef[],
): string | undefined {
  return matchImagePackFromTranscript(transcript, packs)?.slug;
}
