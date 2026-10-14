import {
  composeSlideText,
  splitSlideCopy,
  stripSlideMetaLabels,
} from "@/lib/generator/parse-pasted-scripts";

export type ParsedSlide = {
  index: number;
  text: string;
  heading?: string;
  body: string;
  /** Hint from "Slide N (Product)" etc. */
  beat: string;
  isProduct: boolean;
};

export type ParsedCarousel = {
  title: string;
  slides: ParsedSlide[];
};

export {
  composeSlideText,
  splitSlideCopy,
  stripSlideMetaLabels,
  slideFontScale,
  resolveSlideCopy,
  type CarouselSlide,
} from "@/lib/generator/parse-pasted-scripts";

/** UI chrome that sometimes gets copied into the paste box */
const CHROME_LINE =
  /^(paste your scripts|numbered posts|change path|we keep your words|image pack|build slideshows)\b/i;

function stripChrome(raw: string): string {
  return raw
    .replace(/\r\n/g, "\n")
    .split("\n")
    .filter((line) => !CHROME_LINE.test(line.trim()))
    .join("\n")
    .trim();
}

function cleanTitle(raw: string): string {
  return raw
    .replace(/^\s*\d+[\.\)]\s*/, "")
    .replace(/^[“"']+/, "")
    .replace(/[”"']+$/, "")
    .trim();
}

function parseSlideChunk(chunk: string): ParsedSlide | null {
  // Formats:
  //   Slide 1 (Writing)\nBody text…
  //   Slide 1: Body text on same line
  //   Slide 1 - Body text
  const header = chunk.match(
    /^\s*Slide\s+(\d+)\s*(?:\(([^)]*)\))?\s*[:\-–]?\s*/i,
  );
  if (!header) return null;

  const index = Number(header[1]);
  const beat = (header[2] || "").trim();
  const slideBody = chunk.slice(header[0].length).trim();

  const cleaned = stripSlideMetaLabels(
    slideBody
      .split(/\n/)
      .map((l) => l.trimEnd())
      .join("\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim(),
  );

  const { heading, body } = splitSlideCopy(cleaned);
  const text = composeSlideText(heading, body);

  const isProduct = /product/i.test(beat);
  if (!text && !isProduct) return null;

  return {
    index: Number.isFinite(index) ? index : 0,
    text,
    heading,
    body: body || (!heading ? text : ""),
    beat: beat.toLowerCase() || (isProduct ? "product" : "beat"),
    isProduct,
  };
}

/**
 * Parse a pasted batch of carousel scripts, e.g.:
 *
 * 1. "I accidentally changed my life"
 * Slide 1 (Writing)
 * Text here…
 *
 * Slide 2 (Journal)
 * More text
 *
 * 2. "Next post"
 * ...
 *
 * Never rewrites copy — returns the user's words exactly.
 */
export function parseScriptBatch(raw: string): ParsedCarousel[] {
  const text = stripChrome(raw);
  if (!text) return [];

  // Split on numbered titles: 1. "Title" or 1. Title or 1) Title
  const parts = text.split(/(?=^\s*\d+[\.\)]\s+\S)/m).filter((p) => p.trim());

  const carousels: ParsedCarousel[] = [];

  for (const part of parts) {
    const lines = part.split("\n");
    const titleLine = lines[0] || "";
    if (!/^\s*\d+[\.\)]\s+\S/.test(titleLine)) {
      // Not a numbered post block — try slide-only parse below
      continue;
    }

    const title = cleanTitle(titleLine);
    if (!title) continue;

    const body = lines.slice(1).join("\n");
    const slideChunks = body
      .split(/(?=^\s*Slide\s+\d+)/im)
      .filter((c) => c.trim());

    const slides: ParsedSlide[] = [];
    for (const chunk of slideChunks) {
      const slide = parseSlideChunk(chunk);
      if (slide) slides.push(slide);
    }

    // Fallback: if no "Slide N" headers, treat non-empty paragraphs as slides
    if (!slides.length) {
      const paras = body
        .split(/\n\s*\n/)
        .map((p) => p.trim())
        .filter(Boolean);
      paras.forEach((p, i) => {
        const cleaned = stripSlideMetaLabels(p.replace(/\n+/g, "\n").trim());
        const { heading, body } = splitSlideCopy(cleaned);
        const text = composeSlideText(heading, body);
        slides.push({
          index: i + 1,
          text,
          heading,
          body: body || (!heading ? text : ""),
          beat: i === paras.length - 1 ? "cta" : "beat",
          isProduct: false,
        });
      });
    }

    slides.sort((a, b) => a.index - b.index);
    // Re-index gaps while keeping order
    const normalized = slides.map((s, i) => ({
      ...s,
      index: s.index || i + 1,
    }));

    if (normalized.length) {
      carousels.push({ title, slides: normalized });
    }
  }

  // Single untitled dump with Slide N headers only
  if (!carousels.length && text.length > 20) {
    const slideChunks = text
      .split(/(?=^\s*Slide\s+\d+)/im)
      .filter((c) => c.trim());
    if (slideChunks.length >= 1) {
      const slides: ParsedSlide[] = [];
      for (const chunk of slideChunks) {
        const slide = parseSlideChunk(chunk);
        if (slide) slides.push(slide);
      }
      slides.sort((a, b) => a.index - b.index);
      if (slides.length) {
        carousels.push({ title: "Untitled carousel", slides });
      }
    }
  }

  return carousels;
}

/** Short summary for the Generator UI before Build. */
export function summarizeParsedScripts(parsed: ParsedCarousel[]): string {
  if (!parsed.length) return "No carousels detected yet.";
  const parts = parsed.map(
    (c, i) => `${i + 1}. “${c.title}” · ${c.slides.length} slides`,
  );
  return `Will build ${parsed.length} carousel${parsed.length === 1 ? "" : "s"} with your exact words:\n${parts.join("\n")}`;
}
