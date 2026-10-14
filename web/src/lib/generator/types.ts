/**
 * Per-slide layout overrides for Generator preview + canvas export.
 */

export type SlideTextAlign = "center" | "left";

export type SlideCustomization = {
  /** 8–80: % from top of frame */
  positionY?: number;
  /** 50–95: caption box width as % of frame */
  boxWidth?: number;
  /** 0.7–1.4: multiplier on auto font scale */
  fontSizeScale?: number;
  textAlign?: SlideTextAlign;
};

export const LAYOUT_DEFAULTS = {
  positionYRegular: 45,
  positionYProduct: 20,
  boxWidth: 85,
  fontSizeScale: 1,
  textAlign: "center" as SlideTextAlign,
  positionYMin: 8,
  positionYMax: 80,
  boxWidthMin: 50,
  boxWidthMax: 95,
  fontScaleMin: 0.7,
  fontScaleMax: 1.4,
} as const;

export function clampLayoutPositionY(y: number): number {
  return Math.min(
    LAYOUT_DEFAULTS.positionYMax,
    Math.max(LAYOUT_DEFAULTS.positionYMin, Math.round(y)),
  );
}

export function clampBoxWidth(w: number): number {
  return Math.min(
    LAYOUT_DEFAULTS.boxWidthMax,
    Math.max(LAYOUT_DEFAULTS.boxWidthMin, Math.round(w)),
  );
}

export function clampFontSizeScale(s: number): number {
  const v = Math.round(s * 100) / 100;
  return Math.min(
    LAYOUT_DEFAULTS.fontScaleMax,
    Math.max(LAYOUT_DEFAULTS.fontScaleMin, v),
  );
}

export function defaultSlideCustomization(
  isProduct = false,
): Required<SlideCustomization> {
  return {
    positionY: isProduct
      ? LAYOUT_DEFAULTS.positionYProduct
      : LAYOUT_DEFAULTS.positionYRegular,
    boxWidth: LAYOUT_DEFAULTS.boxWidth,
    fontSizeScale: LAYOUT_DEFAULTS.fontSizeScale,
    textAlign: LAYOUT_DEFAULTS.textAlign,
  };
}

/** Merge stored customization with defaults (product-aware). */
export function resolveSlideCustomization(
  partial?: SlideCustomization | null,
  opts?: {
    isProduct?: boolean;
    /** Legacy top-level positionY on the slide */
    legacyPositionY?: number;
  },
): Required<SlideCustomization> {
  const base = defaultSlideCustomization(Boolean(opts?.isProduct));
  const legacyY =
    typeof opts?.legacyPositionY === "number"
      ? clampLayoutPositionY(opts.legacyPositionY)
      : undefined;
  return {
    positionY: clampLayoutPositionY(
      partial?.positionY ?? legacyY ?? base.positionY,
    ),
    boxWidth: clampBoxWidth(partial?.boxWidth ?? base.boxWidth),
    fontSizeScale: clampFontSizeScale(
      partial?.fontSizeScale ?? base.fontSizeScale,
    ),
    textAlign: partial?.textAlign === "left" ? "left" : "center",
  };
}
