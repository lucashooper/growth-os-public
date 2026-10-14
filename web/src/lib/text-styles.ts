export type TextStyleId =
  | "tiktok-sans"
  | "tiktok-bold"
  | "aesthetic-yellow"
  | "soft-pastel-pink"
  | "electric-blue"
  | "dark-charcoal"
  | "classic-white"
  | "soft-serif"
  | "outline"
  | "neon"
  | "minimal-light";

export type TextStyle = {
  id: TextStyleId;
  name: string;
  description: string;
  /** CSS font-family for preview */
  fontFamily: string;
  fontWeight: number;
  color: string;
  shadow: string;
  /** canvas font string builder */
  canvasFont: (size: number) => string;
  canvasFill: string;
  canvasStroke?: string;
  canvasStrokeWidth?: number;
  canvasShadow: string;
  canvasShadowBlur: number;
  canvasShadowOffsetY?: number;
  /** Legacy per-style hint; dimming is controlled separately (default off). */
  overlay: "none" | "dark" | "soft" | "light";
  /** Prefer pairing with caption box "none" */
  preferNoBox?: boolean;
};

const TIKTOK_SANS =
  '"TikTok Sans", "Helvetica Neue", Helvetica, Arial, sans-serif';

export const TEXT_STYLES: TextStyle[] = [
  {
    id: "tiktok-sans",
    name: "TikTok Sans",
    description:
      "Official TikTok typeface — medium weight, native caption feel (SIL OFL 1.1)",
    fontFamily: TIKTOK_SANS,
    fontWeight: 500,
    color: "#ffffff",
    shadow: "0 1px 3px rgba(0,0,0,0.55)",
    canvasFont: (s) => `500 ${s}px ${TIKTOK_SANS}`,
    canvasFill: "#ffffff",
    canvasShadow: "rgba(0,0,0,0.45)",
    canvasShadowBlur: 4,
    overlay: "none" as TextStyle["overlay"],
  },
  {
    id: "aesthetic-yellow",
    name: "Aesthetic Yellow",
    description: "Viral pale yellow lowercase captions with soft dark shadow — no box",
    fontFamily: TIKTOK_SANS,
    fontWeight: 500,
    color: "#FFE866",
    shadow: "0 2px 4px rgba(0,0,0,0.7)",
    canvasFont: (s) => `500 ${s}px ${TIKTOK_SANS}`,
    canvasFill: "#FFE866",
    canvasShadow: "rgba(0,0,0,0.7)",
    canvasShadowBlur: 4,
    canvasShadowOffsetY: 2,
    overlay: "none",
    preferNoBox: true,
  },
  {
    id: "soft-pastel-pink",
    name: "Soft Pastel Pink",
    description: "Soft pink viral caption — pairs with Highlight Box (A)",
    fontFamily: TIKTOK_SANS,
    fontWeight: 500,
    color: "#FFA6C9",
    shadow: "0 2px 4px rgba(0,0,0,0.7)",
    canvasFont: (s) => `500 ${s}px ${TIKTOK_SANS}`,
    canvasFill: "#FFA6C9",
    canvasShadow: "rgba(0,0,0,0.7)",
    canvasShadowBlur: 4,
    canvasShadowOffsetY: 2,
    overlay: "none",
    preferNoBox: true,
  },
  {
    id: "electric-blue",
    name: "Electric Blue",
    description: "Saturated TikTok blue — highlight box or text-only",
    fontFamily: TIKTOK_SANS,
    fontWeight: 500,
    color: "#00C2E8",
    shadow: "0 2px 4px rgba(0,0,0,0.7)",
    canvasFont: (s) => `500 ${s}px ${TIKTOK_SANS}`,
    canvasFill: "#00C2E8",
    canvasShadow: "rgba(0,0,0,0.7)",
    canvasShadowBlur: 4,
    canvasShadowOffsetY: 2,
    overlay: "none",
    preferNoBox: true,
  },
  {
    id: "dark-charcoal",
    name: "Dark Charcoal",
    description: "Near-black accent for light scenes / highlight boxes",
    fontFamily: TIKTOK_SANS,
    fontWeight: 500,
    color: "#111827",
    shadow: "0 1px 2px rgba(255,255,255,0.35)",
    canvasFont: (s) => `500 ${s}px ${TIKTOK_SANS}`,
    canvasFill: "#111827",
    canvasShadow: "rgba(0,0,0,0.35)",
    canvasShadowBlur: 3,
    canvasShadowOffsetY: 1,
    overlay: "none",
    preferNoBox: true,
  },
  {
    id: "tiktok-bold",
    name: "TikTok Bold",
    description: "Heavy sans, white, strong shadow — closest to native captions",
    fontFamily: '"Arial Black", "Helvetica Neue", Arial, sans-serif',
    fontWeight: 800,
    color: "#ffffff",
    shadow: "0 2px 8px rgba(0,0,0,0.9)",
    canvasFont: (s) => `800 ${s}px "Arial Black", "Helvetica Neue", Arial, sans-serif`,
    canvasFill: "#ffffff",
    canvasShadow: "rgba(0,0,0,0.9)",
    canvasShadowBlur: 12,
    overlay: "dark",
  },
  {
    id: "classic-white",
    name: "Classic Clean",
    description: "Bold Helvetica, slightly softer shadow",
    fontFamily: '"Helvetica Neue", Helvetica, Arial, sans-serif',
    fontWeight: 700,
    color: "#ffffff",
    shadow: "0 2px 6px rgba(0,0,0,0.75)",
    canvasFont: (s) => `700 ${s}px "Helvetica Neue", Helvetica, Arial, sans-serif`,
    canvasFill: "#ffffff",
    canvasShadow: "rgba(0,0,0,0.75)",
    canvasShadowBlur: 8,
    overlay: "dark",
  },
  {
    id: "soft-serif",
    name: "Editorial Serif",
    description: "Georgia-style for stoic / journaling carousels",
    fontFamily: 'Georgia, "Times New Roman", serif',
    fontWeight: 700,
    color: "#faf7f2",
    shadow: "0 2px 10px rgba(0,0,0,0.8)",
    canvasFont: (s) => `700 ${s}px Georgia, "Times New Roman", serif`,
    canvasFill: "#faf7f2",
    canvasShadow: "rgba(0,0,0,0.8)",
    canvasShadowBlur: 10,
    overlay: "dark",
  },
  {
    id: "outline",
    name: "Outline Punch",
    description: "White fill with black stroke — high contrast",
    fontFamily: '"Impact", "Arial Black", sans-serif',
    fontWeight: 800,
    color: "#ffffff",
    shadow: "0 0 0 transparent",
    canvasFont: (s) => `800 ${s}px Impact, "Arial Black", sans-serif`,
    canvasFill: "#ffffff",
    canvasStroke: "#000000",
    canvasStrokeWidth: 6,
    canvasShadow: "rgba(0,0,0,0.4)",
    canvasShadowBlur: 4,
    overlay: "soft",
  },
  {
    id: "neon",
    name: "Neon Pop",
    description: "Bright accent text for hooks",
    fontFamily: '"Arial Black", Arial, sans-serif',
    fontWeight: 800,
    color: "#39ff14",
    shadow: "0 0 12px rgba(57,255,20,0.55)",
    canvasFont: (s) => `800 ${s}px "Arial Black", Arial, sans-serif`,
    canvasFill: "#39ff14",
    canvasShadow: "rgba(57,255,20,0.55)",
    canvasShadowBlur: 18,
    overlay: "dark",
  },
  {
    id: "minimal-light",
    name: "Minimal Light",
    description: "Dark text on light wash — product / UI slides",
    fontFamily: '"Helvetica Neue", Arial, sans-serif',
    fontWeight: 600,
    color: "#111111",
    shadow: "0 1px 0 rgba(255,255,255,0.4)",
    canvasFont: (s) => `600 ${s}px "Helvetica Neue", Arial, sans-serif`,
    canvasFill: "#111111",
    canvasShadow: "rgba(255,255,255,0.35)",
    canvasShadowBlur: 2,
    overlay: "light",
  },
];

export function getTextStyle(id?: string): TextStyle {
  return TEXT_STYLES.find((t) => t.id === id) || TEXT_STYLES[0]!;
}
