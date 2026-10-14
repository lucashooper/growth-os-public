/**
 * TikTok-native caption accents:
 * - No box → colored text + dark shadow
 * - Highlight box ("A" button) → accent fills the box; text auto-contrasts
 */

import { getTextStyle } from "@/lib/text-styles";

export type AccentId =
  | "aesthetic-yellow"
  | "soft-pastel-pink"
  | "electric-blue"
  | "classic-white"
  | "dark-charcoal"
  | "tiktok-sans"
  | "tiktok-bold";

export type CaptionAccent = {
  id: AccentId | string;
  name: string;
  /** Fill used for text (no-box) or highlight box background */
  color: string;
  description: string;
};

export const CAPTION_ACCENTS: CaptionAccent[] = [
  {
    id: "aesthetic-yellow",
    name: "Aesthetic Yellow",
    color: "#FFE866",
    description: "Viral pale yellow — native TikTok highlight yellow",
  },
  {
    id: "soft-pastel-pink",
    name: "Soft Pastel Pink",
    color: "#FFA6C9",
    description: "Soft pink accent",
  },
  {
    id: "electric-blue",
    name: "Electric Blue",
    color: "#00C2E8",
    description: "Saturated TikTok blue highlight",
  },
  {
    id: "classic-white",
    name: "Classic White",
    color: "#FFFFFF",
    description: "White accent / classic white box",
  },
  {
    id: "dark-charcoal",
    name: "Dark Charcoal",
    color: "#111827",
    description: "Near-black accent",
  },
  {
    id: "tiktok-sans",
    name: "TikTok Sans White",
    color: "#FFFFFF",
    description: "Default white caption text",
  },
  {
    id: "tiktok-bold",
    name: "TikTok Bold White",
    color: "#FFFFFF",
    description: "Heavy white caption",
  },
];

/** Relative luminance 0–1 (sRGB). */
export function relativeLuminance(hexOrRgba: string): number {
  const c = parseColor(hexOrRgba);
  if (!c) return 0.5;
  const lin = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(c.r) + 0.7152 * lin(c.g) + 0.0722 * lin(c.b);
}

function parseColor(
  input: string,
): { r: number; g: number; b: number; a: number } | null {
  const s = input.trim();
  if (s.startsWith("#")) {
    let h = s.slice(1);
    if (h.length === 3) {
      h = h
        .split("")
        .map((ch) => ch + ch)
        .join("");
    }
    if (h.length !== 6) return null;
    return {
      r: parseInt(h.slice(0, 2), 16),
      g: parseInt(h.slice(2, 4), 16),
      b: parseInt(h.slice(4, 6), 16),
      a: 1,
    };
  }
  const m = s.match(
    /rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*([\d.]+))?\s*\)/i,
  );
  if (!m) return null;
  return {
    r: Number(m[1]),
    g: Number(m[2]),
    b: Number(m[3]),
    a: m[4] !== undefined ? Number(m[4]) : 1,
  };
}

/** High-contrast text for a given box fill (TikTok pairing). */
export function contrastTextFor(bg: string): string {
  return relativeLuminance(bg) > 0.55 ? "#111827" : "#FFFFFF";
}

export function getAccent(id?: string): CaptionAccent {
  return (
    CAPTION_ACCENTS.find((a) => a.id === id) ||
    CAPTION_ACCENTS.find((a) => a.id === "tiktok-sans")!
  );
}

export type HighlightMode = "none" | "highlight" | "dark-pill";

/** Map legacy caption box ids → highlight mode. */
export function normalizeHighlightMode(captionBoxId?: string): HighlightMode {
  if (!captionBoxId || captionBoxId === "none") return "none";
  if (captionBoxId === "dark-pill") return "dark-pill";
  // white / black / red / highlight / anything enabled → highlight box mode
  return "highlight";
}

export type ResolvedCaptionPaint = {
  mode: "text" | "box";
  /** Accent hex used for text (no-box) or box fill */
  accentColor: string;
  textColor: string;
  boxBackground: string;
  textShadow: string;
  canvasShadow: string;
  canvasShadowBlur: number;
  canvasShadowOffsetY: number;
  paddingX: number;
  paddingY: number;
  borderRadius: number;
  boxShadowCss?: string;
  canvasBoxShadow?: string;
  canvasBoxShadowBlur?: number;
  canvasBoxShadowOffsetY?: number;
};

/**
 * Resolve final paint for preview + canvas bake from accent + box mode.
 */
export function resolveCaptionPaint(
  textStyleId?: string,
  captionBoxId?: string,
): ResolvedCaptionPaint {
  const listed = CAPTION_ACCENTS.find((a) => a.id === textStyleId);
  const accentColor = listed?.color || getTextStyle(textStyleId).canvasFill;
  const mode = normalizeHighlightMode(captionBoxId);

  if (mode === "none") {
    return {
      mode: "text",
      accentColor,
      textColor: accentColor,
      boxBackground: "transparent",
      // Tight shadow — soft blur reads as muddy on TikTok exports
      textShadow: "0 1px 2px rgba(0,0,0,0.75)",
      canvasShadow: "rgba(0,0,0,0.75)",
      canvasShadowBlur: 2,
      canvasShadowOffsetY: 1,
      paddingX: 0,
      paddingY: 0,
      borderRadius: 0,
    };
  }

  if (mode === "dark-pill") {
    return {
      mode: "box",
      accentColor,
      textColor: "#FFFFFF",
      boxBackground: "rgba(0,0,0,0.65)",
      textShadow: "none",
      canvasShadow: "transparent",
      canvasShadowBlur: 0,
      canvasShadowOffsetY: 0,
      paddingX: 16,
      paddingY: 11,
      borderRadius: 999,
      boxShadowCss: "0 2px 10px rgba(0,0,0,0.35)",
      canvasBoxShadow: "rgba(0,0,0,0.35)",
      canvasBoxShadowBlur: 12,
      canvasBoxShadowOffsetY: 3,
    };
  }

  // Highlight box — box takes accent; text auto-contrasts (TikTok Aa style)
  // Pink / blue use crisp white on a more saturated fill (matches native TikTok)
  let boxBg =
    captionBoxId === "white"
      ? "#FFFFFF"
      : captionBoxId === "black"
        ? "#111111"
        : captionBoxId === "red"
          ? "#FF3B30"
          : accentColor;

  let textColor = contrastTextFor(boxBg);

  if (captionBoxId === "highlight" || mode === "highlight") {
    if (textStyleId === "soft-pastel-pink") {
      boxBg = "rgba(255, 90, 150, 0.92)";
      textColor = "#FFFFFF";
    } else if (textStyleId === "electric-blue") {
      boxBg = "rgba(0, 180, 230, 0.92)";
      textColor = "#FFFFFF";
    } else if (textStyleId === "aesthetic-yellow") {
      boxBg = "#FFE866";
      textColor = "#111827";
    }
  }

  return {
    mode: "box",
    accentColor,
    textColor,
    boxBackground: boxBg,
    // No text shadow in box mode — shadows look soft/blurry vs native TikTok
    textShadow: "none",
    canvasShadow: "transparent",
    canvasShadowBlur: 0,
    canvasShadowOffsetY: 0,
    paddingX: 14,
    paddingY: 10,
    borderRadius: 12,
    boxShadowCss: "0 2px 8px rgba(0,0,0,0.22)",
    canvasBoxShadow: "rgba(0,0,0,0.22)",
    canvasBoxShadowBlur: 10,
    canvasBoxShadowOffsetY: 2,
  };
}

/** TikTok top safe-zone — clears search bar / status icons. */
export const TOP_SAFE_Y = 18;
/** Product soft-CTA / showcase text sits in the upper third (above mockups). */
export const PRODUCT_POSITION_Y = 20;
/** Bottom safe-zone. */
export const BOTTOM_SAFE_Y = 78;

export const DEFAULT_POSITION_Y: Record<"top" | "center" | "bottom", number> = {
  top: TOP_SAFE_Y,
  center: 45,
  bottom: BOTTOM_SAFE_Y,
};

export function clampPositionY(y: number): number {
  return Math.min(80, Math.max(8, Math.round(y)));
}

export function positionYFromPreset(
  pos?: string,
  isProduct?: boolean,
): number {
  if (isProduct || pos === "none") return PRODUCT_POSITION_Y;
  if (pos === "top") return TOP_SAFE_Y;
  if (pos === "bottom") return BOTTOM_SAFE_Y;
  return DEFAULT_POSITION_Y.center;
}
