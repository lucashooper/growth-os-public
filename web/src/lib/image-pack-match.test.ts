import assert from "node:assert/strict";
import { matchImagePackFromTranscript } from "./image-pack-match";

const PACKS = [
  { slug: "philosopher", name: "Philosopher" },
  { slug: "zeno-philosophy", name: "Insight-Philosophy" },
  { slug: "zeno-philosopher-style-2", name: "Zeno-Philosopher-Style-2" },
  { slug: "girl-dark-luxe-night-reflection", name: "Dark Luxury" },
  { slug: "girl-aesthetic", name: "Girl-Aesthetic" },
];

function expectMatch(transcript: string, expectedSlug: string) {
  const match = matchImagePackFromTranscript(transcript, PACKS);
  assert.ok(match, `expected a match for: ${transcript}`);
  assert.equal(
    match.slug,
    expectedSlug,
    `transcript "${transcript}" matched ${match.slug} (${match.name}), expected ${expectedSlug}`,
  );
}

function expectNoMatch(transcript: string) {
  const match = matchImagePackFromTranscript(transcript, PACKS);
  assert.equal(match, undefined, `expected no match for: ${transcript}`);
}

expectMatch(
  "can you create a five slide information slideshow with the Insight philosophy image pack",
  "zeno-philosophy",
);
expectMatch(
  "can you create a five slide information slideshow with the insights philosophy image pack",
  "zeno-philosophy",
);
expectMatch(
  "create a slideshow with the insight philosophy image pack",
  "zeno-philosophy",
);
expectMatch("use the Insight-Philosophy pack for this", "zeno-philosophy");
expectMatch("make slides with the philosopher pack", "philosopher");
expectMatch("paper and books philosopher image pack", "philosopher");
expectMatch("dark luxury pack please", "girl-dark-luxe-night-reflection");
expectNoMatch("create five slides about anxiety");

console.log("image-pack-match tests passed");
