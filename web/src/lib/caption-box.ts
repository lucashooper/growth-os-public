export type CaptionBoxId =
  | "none"
  | "highlight"
  | "white"
  | "dark-pill"
  | "black"
  | "red";

/** Caption highlight — native TikTok uses one tight block behind the whole caption. */
export type CaptionBoxStyle = {
  id: CaptionBoxId;
  name: string;
  description: string;
  enabled: boolean;
  backgroundColor: string;
  textColor: string;
  /** Horizontal padding inside the box (preview px) */
  paddingX: number;
  /** Vertical padding inside the box (preview px) */
  paddingY: number;
  borderRadius: number;
  /** Line gap inside the box — 0 = native integrated look */
  lineGap: number;
  shadow?: string;
  canvasShadow?: string;
  canvasShadowBlur?: number;
  canvasShadowOffsetY?: number;
  /** When true, box fill comes from the chosen accent color */
  usesAccentFill?: boolean;
};

export const CAPTION_BOX_STYLES: CaptionBoxStyle[] = [
  {
    id: "none",
    name: "None (text only)",
    description: "Accent-colored text + dark shadow — no box",
    enabled: false,
    backgroundColor: "transparent",
    textColor: "",
    paddingX: 0,
    paddingY: 0,
    borderRadius: 0,
    lineGap: 0,
  },
  {
    id: "highlight",
    name: "TikTok Highlight Box (A)",
    description:
      "Accent fills the box; text auto-contrasts (native TikTok Aa highlight)",
    enabled: true,
    backgroundColor: "#FFE866",
    textColor: "#111827",
    paddingX: 14,
    paddingY: 10,
    borderRadius: 10,
    lineGap: 0,
    shadow: "0 4px 14px rgba(0,0,0,0.28)",
    canvasShadow: "rgba(0,0,0,0.28)",
    canvasShadowBlur: 18,
    canvasShadowOffsetY: 4,
    usesAccentFill: true,
  },
  {
    id: "white",
    name: "TikTok Classic White Box",
    description: "Black text (#111827) on solid white rounded container",
    enabled: true,
    backgroundColor: "#FFFFFF",
    textColor: "#111827",
    paddingX: 14,
    paddingY: 10,
    borderRadius: 10,
    lineGap: 0,
    shadow: "0 4px 14px rgba(0,0,0,0.28)",
    canvasShadow: "rgba(0,0,0,0.28)",
    canvasShadowBlur: 18,
    canvasShadowOffsetY: 4,
  },
  {
    id: "dark-pill",
    name: "TikTok Dark Pill",
    description: "White text on semi-translucent dark container",
    enabled: true,
    backgroundColor: "rgba(0,0,0,0.65)",
    textColor: "#FFFFFF",
    paddingX: 16,
    paddingY: 11,
    borderRadius: 999,
    lineGap: 0,
    shadow: "0 2px 10px rgba(0,0,0,0.35)",
    canvasShadow: "rgba(0,0,0,0.35)",
    canvasShadowBlur: 12,
    canvasShadowOffsetY: 3,
  },
  {
    id: "black",
    name: "Black box",
    description: "One black block, white text — high contrast",
    enabled: true,
    backgroundColor: "#111111",
    textColor: "#FFFFFF",
    paddingX: 14,
    paddingY: 10,
    borderRadius: 8,
    lineGap: 0,
    shadow: "none",
  },
  {
    id: "red",
    name: "Red box",
    description: "TikTok-alert red — white text, single block",
    enabled: true,
    backgroundColor: "#FF3B30",
    textColor: "#FFFFFF",
    paddingX: 14,
    paddingY: 10,
    borderRadius: 8,
    lineGap: 0,
    shadow: "none",
  },
];

/** Default to Highlight Box so TikTok exports bake with a native caption plate. */
export function getCaptionBox(id?: string): CaptionBoxStyle {
  if (!id) {
    return CAPTION_BOX_STYLES.find((b) => b.id === "highlight")!;
  }
  return (
    CAPTION_BOX_STYLES.find((b) => b.id === id) ||
    CAPTION_BOX_STYLES.find((b) => b.id === "highlight")!
  );
}

/** Shared word-wrap for preview + canvas. Honors explicit line breaks (Enter). */
export function wrapCaptionLines(
  text: string,
  measure: (line: string) => number,
  maxWidth: number,
  maxLines = 18,
): string[] {
  const normalized = text.replace(/\r\n/g, "\n");
  const paragraphs = normalized.split("\n");
  const lines: string[] = [];

  for (const para of paragraphs) {
    const words = para.trim().split(/\s+/).filter(Boolean);
    if (!words.length) continue;
    let line = "";
    for (const word of words) {
      const test = line ? `${line} ${word}` : word;
      if (measure(test) > maxWidth && line) {
        lines.push(line);
        line = word;
      } else {
        line = test;
      }
    }
    if (line) lines.push(line);
    if (lines.length >= maxLines) break;
  }

  return lines.slice(0, maxLines);
}

/**
 * TikTok right rail (like / comment / share) eats ~15% of width.
 * Use the same inset on both sides so captions stay visually centered
 * while still clearing the right-rail buttons.
 */
export const TIKTOK_SAFE = {
  /** Canvas 1080×1920 — equal left/right inset */
  canvasSide: 200,
  /** Live preview phone (~260px wide) */
  previewSide: 48,
} as const;

export type TextPosition = "top" | "center" | "bottom";
