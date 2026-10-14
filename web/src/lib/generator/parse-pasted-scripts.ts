/**
 * Paste sanitization + heading/body split for carousel slides.
 * Meta labels must never bake onto final slide images.
 */

/** Lines / prefixes like (subtext: …), subtext:, visual: */
const META_PAREN_LINE =
  /^\s*\((?:subtext|note|visual|hook|cta|overlay|direction|b-roll)[:\s][^)]*\)\s*$/gim;

const META_PAREN_INLINE =
  /\s*\((?:subtext|note|visual|hook|cta|overlay|direction|b-roll)[:\s][^)]*\)\s*/gi;

const META_PREFIX_LINE =
  /^\s*(?:subtext|note|visual|hook|cta|overlay|direction|b-roll)\s*:\s*.*$/gim;

const META_PREFIX_INLINE =
  /^\s*(?:subtext|note|visual|hook|cta|overlay|direction|b-roll)\s*:\s*/gim;

export type CarouselSlide = {
  heading?: string;
  body: string;
  imageIndex?: number;
};

/**
 * Strip parenthetical / labeled meta so it never renders on slides.
 */
export function stripSlideMetaLabels(text: string): string {
  if (!text?.trim()) return "";
  return text
    .replace(/\r\n/g, "\n")
    .replace(META_PAREN_LINE, "")
    .replace(META_PREFIX_LINE, "")
    .split("\n")
    .map((line) =>
      line
        .replace(META_PAREN_INLINE, " ")
        .replace(META_PREFIX_INLINE, "")
        .replace(/[ \t]{2,}/g, " ")
        .trimEnd(),
    )
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function composeSlideText(heading?: string, body?: string): string {
  const h = (heading || "").trim();
  const b = (body || "").trim();
  if (h && b) return `${h}\n${b}`;
  return h || b;
}

/**
 * Split slide copy into heading + body.
 * Case A: explicit `Heading:` / `Body:` tags
 * Case B: first line < 45 chars + more content → heading
 * Case C: single short line → heading-only (bold hook)
 */
export function splitSlideCopy(raw: string): CarouselSlide {
  const cleaned = stripSlideMetaLabels(raw);
  if (!cleaned) return { body: "" };

  const headingTag = cleaned.match(/^\s*Heading\s*:\s*(.+)$/im);
  const bodyTag = cleaned.match(/Body\s*:\s*([\s\S]+)$/im);
  if (headingTag || /(?:^|\n)\s*Body\s*:/i.test(cleaned)) {
    let heading = headingTag?.[1]?.trim() || "";
    let body = "";
    if (bodyTag) {
      body = bodyTag[1].trim();
    } else if (headingTag) {
      body = cleaned
        .replace(/^\s*Heading\s*:\s*.+$/im, "")
        .replace(/^\s*Body\s*:\s*/im, "")
        .trim();
    } else {
      body = cleaned.replace(/^\s*Body\s*:\s*/im, "").trim();
    }
    // Drop Body: label residue from heading-only extracts
    heading = heading.replace(/\s*Body\s*:.*$/i, "").trim();
    if (heading && body) return { heading, body };
    if (heading) return { heading, body: "" };
    return { body };
  }

  const lines = cleaned
    .split(/\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  if (lines.length >= 2 && lines[0]!.length > 0 && lines[0]!.length < 45) {
    return {
      heading: lines[0],
      body: lines.slice(1).join("\n").trim(),
    };
  }

  // Short single-line hook → treat as heading for bold emphasis
  if (lines.length === 1 && lines[0]!.length < 45) {
    return { heading: lines[0], body: "" };
  }

  return { body: cleaned };
}

export type SlideFontScale = {
  /** Preview body size (px) */
  bodyPreviewPx: number;
  /** Preview heading size (px) */
  headingPreviewPx: number;
  /** Canvas body size (px @ 1080) */
  bodyCanvasPx: number;
  /** Canvas heading size (px @ 1080) */
  headingCanvasPx: number;
  /** CSS line-height for body */
  bodyLineHeight: number;
  headingLineHeight: number;
  /** Gap between heading and body (preview px / canvas px) */
  gapPreviewPx: number;
  gapCanvasPx: number;
};

/** Dynamic type scale so long copy fits 9:16 without clipping. */
export function slideFontScale(charCount: number): SlideFontScale {
  if (charCount < 80) {
    return {
      bodyPreviewPx: 16,
      headingPreviewPx: 20,
      bodyCanvasPx: 56,
      headingCanvasPx: 68,
      bodyLineHeight: 1.35,
      headingLineHeight: 1.2,
      gapPreviewPx: 8,
      gapCanvasPx: 18,
    };
  }
  if (charCount <= 180) {
    return {
      bodyPreviewPx: 14,
      headingPreviewPx: 17,
      bodyCanvasPx: 48,
      headingCanvasPx: 58,
      bodyLineHeight: 1.3,
      headingLineHeight: 1.18,
      gapPreviewPx: 6,
      gapCanvasPx: 14,
    };
  }
  return {
    bodyPreviewPx: 12,
    headingPreviewPx: 15,
    bodyCanvasPx: 40,
    headingCanvasPx: 50,
    bodyLineHeight: 1.25,
    headingLineHeight: 1.15,
    gapPreviewPx: 5,
    gapCanvasPx: 12,
  };
}

export function resolveSlideCopy(slide: {
  text?: string;
  heading?: string;
  body?: string;
}): CarouselSlide {
  // Prefer live `text` when it has manual line breaks (user pressed Enter)
  if (slide.text?.includes("\n")) {
    return splitSlideCopy(slide.text);
  }
  if (slide.heading != null || slide.body != null) {
    return {
      heading: (slide.heading || "").trim() || undefined,
      body: (slide.body || "").trim(),
    };
  }
  return splitSlideCopy(slide.text || "");
}
