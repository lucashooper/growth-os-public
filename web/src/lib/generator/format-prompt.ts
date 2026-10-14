/**
 * Shared carousel format archetypes + few-shot shape.
 * Used by both the main Generator (`/api/ai/generate`) and Voice Studio.
 */

export type CarouselFormat = "storytelling" | "informational";

export function isLifestylePack(
  pack?: { slug?: string; name?: string; description?: string } | null,
) {
  const hay = `${pack?.slug || ""} ${pack?.name || ""} ${pack?.description || ""}`.toLowerCase();
  return /girl|aesthetic|lifestyle|dallas|soft.?girl|clean.?girl|girly/i.test(hay);
}

/** Infer format from a voice transcript or freeform request. Default = educational. */
export function extractCarouselFormat(text: string): CarouselFormat {
  if (/\b(story|vulnerable|personal story|narrative|arc)\b/i.test(text)) {
    return "storytelling";
  }
  return "informational";
}

/**
 * Exact Generator system-prompt block for slide structure.
 * Informational: Slide 1 hook → middle slides = actionable takeaways → last = synthesis/CTA.
 */
export function formatPrompt(
  format: CarouselFormat,
  lifestyle = false,
  slidesPer = 5,
) {
  const n = Math.max(3, Math.min(slidesPer, 10));
  const midEnd = Math.max(2, n - 1);

  if (lifestyle) {
    return `FORMAT: Girly / Lifestyle carousel (exactly ${n} slides) — conversational TikTok energy
TONE (STRICT):
- Lowercase aesthetic preferred.
- First-person, relatable, slightly chaotic / soft / personal — NEVER clinical, academic, or corporate.
- BANNED words/phrases: over-indexing, cognitive debt, sensory fasting, optimizing, framework, mechanisms, protocol, bandwidth, leverage, stakeholder, paradigm, dopamine detox (as jargon), "signs you're", "here's exactly how to unlock".
- Write like a friend texting advice, not a therapist worksheet or productivity blog.

HOOK archetypes (match this vibe, invent fresh copy):
- "my favorite low-effort ways to reset when my brain won't shut up"
- "five chaotic but actually helpful mental health hacks (my therapist made me try)"
- "things i do when every small task feels like a mountain"

BODY slides = numbered practical hacks with a short why, e.g.:
"1. ice cube in the palm — whenever your brain is spiraling, hold an ice cube until it melts. it shocks your nervous system back into the present."

Slide ${n} SOFT CTA — lowercase, low-pressure:
  "i log my thoughts here — i use insight"
  "check in with yourself daily (i use insight)"

Few-shot shape:
["five chaotic but actually helpful mental health hacks (my therapist made me try)","1. ice cube in the palm — hold it until it melts when your brain is spiraling","2. voice note the spiral — dump the loop out loud for 60 seconds then delete it","3. one tiny reset before bed — three lines about what felt heavy today","i check in here every night — i use insight"]`;
  }

  if (format === "storytelling") {
    return `FORMAT: Storytelling / Vulnerable Arc (exactly ${n} slides)
Slide 1 HOOK — highly relatable personal struggle (first person feeling).
  e.g. "Every small task felt like a mountain I couldn't climb."
Slide 2 — realization / mindset shift.
Slides 3–${midEnd} — micro-habit / practical protocol that fixed it (specific, numbered or timeboxed).
Slide ${n} SOFT CTA — low-pressure product line (lowercase ok). Examples:
  "i log my thoughts here — i use insight"
  "check in with yourself daily (i use insight)"
  "that's why i built insight"
  Never hard-sell ("download now", "link in bio"). Soft parenthetical or first-person habit mention only.

Few-shot shape:
["Every small task felt like a mountain I couldn't climb.","I realized I wasn't lazy — I was overloaded and tracking nothing.","I started writing three lines each night before bed.","Then I checked one priority each morning before opening socials.","i log my thoughts here — i use insight"]`;
  }

  return `FORMAT: Informational / Educational Framework (exactly ${n} slides) — like viral fitness protocol carousels
STRICT: This is an EDUCATIONAL carousel. Ban vague poetic quotes, fortune-cookie luxury lines, and abstract metaphors ("design your darkness", "chaos is cheap", "document the shadows"). Every middle slide must be a specific, actionable takeaway a viewer can do today.

Slide 1 HOOK — high-curiosity problem statement or counter-intuitive insight. Name the problem. Not a quote.
  e.g. "Here's exactly how to unlock your dream physique (step by step)"
  e.g. "Signs you're not lazy — you're mentally overloaded"

Slides 2–${midEnd} — numbered, specific micro-habits or rules (Title — concrete instruction with a number, timebox, or measurable action).
  e.g. "Eat enough protein — Aim for 0.7–1.0g per pound of bodyweight daily."
  e.g. "Prioritize sleep — Get 7–9 hours every night to maximize recovery."
  e.g. "Progressive overload — Add weight or reps every week."

Slide ${n} — insightful synthesis + soft CTA (lowercase, low-pressure product mention). Recap the protocol; never hard-sell.
  e.g. "that's the protocol — i log it here (i use insight)"

Rules: No long paragraphs. Each middle slide = one crisp rule. White-caption energy, scannable.`;
}
