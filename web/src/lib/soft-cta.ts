/** Soft, low-pressure CTAs for product / app mockup slides. */
export function softProductCta(appName?: string): string {
  const name = (appName || "insight").trim().replace(/^@/, "") || "insight";
  const lower = name.toLowerCase();
  const options = [
    `i log my thoughts here — i use ${lower}`,
    `check in with yourself daily (i use ${lower})`,
    `that's why i built ${lower}`,
    `i reset here every night — ${lower}`,
  ];
  // Stable pick from name so the same workspace feels consistent
  let hash = 0;
  for (let i = 0; i < lower.length; i++) hash = (hash + lower.charCodeAt(i) * (i + 1)) % options.length;
  return options[hash] || options[0]!;
}

export function isProductSlideHint(opts: {
  isProduct?: boolean;
  suppressText?: boolean;
  beat?: string;
  kind?: string;
  textPosition?: string;
}): boolean {
  if (opts.isProduct) return true;
  if (opts.kind === "product") return true;
  if (opts.beat && /product/i.test(opts.beat)) return true;
  // Legacy: product was stored as suppress + none
  if (opts.suppressText && opts.textPosition === "none") return true;
  return false;
}
