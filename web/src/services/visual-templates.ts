import "server-only";

export type VisualAsset = {
  id: string;
  kind: "background" | "overlay" | "mockup" | "product" | "texture";
  label: string;
  /** CSS background or image URL */
  url: string;
  tags: string[];
};

export type VisualTemplate = {
  slug: string;
  name: string;
  description: string;
  assets: VisualAsset[];
};

/**
 * Curated visual templates (remote images). Later these can be replaced by
 * user-uploaded Brand Pack folders in the Content Library.
 */
export const VISUAL_TEMPLATES: VisualTemplate[] = [
  {
    slug: "philosopher",
    name: "Philosopher Collection",
    description: "Marble, statues, parchment, temples",
    assets: [
      {
        id: "phil-bg-1",
        kind: "background",
        label: "Marble hall",
        url: "https://images.unsplash.com/photo-1578662996442-48f60103fc96?w=900&q=80",
        tags: ["hook", "quote"],
      },
      {
        id: "phil-bg-2",
        kind: "background",
        label: "Ancient statue",
        url: "https://images.unsplash.com/photo-1564399579883-451a5d44ec08?w=900&q=80",
        tags: ["story", "insight"],
      },
      {
        id: "phil-bg-3",
        kind: "background",
        label: "Old books",
        url: "https://images.unsplash.com/photo-1524995997946-a1c2e315a42f?w=900&q=80",
        tags: ["explanation", "context"],
      },
      {
        id: "phil-bg-4",
        kind: "background",
        label: "Temple columns",
        url: "https://images.unsplash.com/photo-1552832230-c0197dd311b5?w=900&q=80",
        tags: ["application", "lesson"],
      },
      {
        id: "phil-bg-5",
        kind: "background",
        label: "Journal desk",
        url: "https://images.unsplash.com/photo-1455390582262-044cdead277a?w=900&q=80",
        tags: ["practice", "cta"],
      },
      {
        id: "phil-mock-1",
        kind: "mockup",
        label: "Phone mockup",
        url: "https://images.unsplash.com/photo-1512941937669-90a1b58e7e9c?w=900&q=80",
        tags: ["cta", "app"],
      },
    ],
  },
  {
    slug: "nature",
    name: "Nature Collection",
    description: "Calm landscapes and soft light",
    assets: [
      {
        id: "nat-1",
        kind: "background",
        label: "Fog forest",
        url: "https://images.unsplash.com/photo-1441974231531-c6227db76b6e?w=900&q=80",
        tags: ["hook", "story"],
      },
      {
        id: "nat-2",
        kind: "background",
        label: "Mountain dawn",
        url: "https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?w=900&q=80",
        tags: ["insight", "realisation"],
      },
      {
        id: "nat-3",
        kind: "background",
        label: "Ocean calm",
        url: "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=900&q=80",
        tags: ["application", "advice"],
      },
      {
        id: "nat-4",
        kind: "background",
        label: "Desert quiet",
        url: "https://images.unsplash.com/photo-1509316785289-025f5b846b35?w=900&q=80",
        tags: ["lesson", "practice"],
      },
      {
        id: "nat-mock",
        kind: "mockup",
        label: "Phone outdoors",
        url: "https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?w=900&q=80",
        tags: ["cta", "app"],
      },
    ],
  },
  {
    slug: "product",
    name: "Product Collection",
    description: "UI showcases and product moments",
    assets: [
      {
        id: "prod-1",
        kind: "product",
        label: "App UI dark",
        url: "https://images.unsplash.com/photo-1551650975-87deedd944c3?w=900&q=80",
        tags: ["hook", "product"],
      },
      {
        id: "prod-2",
        kind: "product",
        label: "Dashboard",
        url: "https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=900&q=80",
        tags: ["insight", "example"],
      },
      {
        id: "prod-3",
        kind: "mockup",
        label: "Phone mockup",
        url: "https://images.unsplash.com/photo-1512941937669-90a1b58e7e9c?w=900&q=80",
        tags: ["cta", "app"],
      },
      {
        id: "prod-4",
        kind: "background",
        label: "Gradient soft",
        url: "https://images.unsplash.com/photo-1557683316-973673baf926?w=900&q=80",
        tags: ["context", "practice"],
      },
    ],
  },
  {
    slug: "ui-showcase",
    name: "UI Showcase",
    description: "Screens and interface frames",
    assets: [
      {
        id: "ui-1",
        kind: "product",
        label: "Mobile UI",
        url: "https://images.unsplash.com/photo-1512941937669-90a1b58e7e9c?w=900&q=80",
        tags: ["hook", "cta"],
      },
      {
        id: "ui-2",
        kind: "product",
        label: "Laptop workspace",
        url: "https://images.unsplash.com/photo-1498050108023-c5249f4df085?w=900&q=80",
        tags: ["explanation", "example"],
      },
      {
        id: "ui-3",
        kind: "background",
        label: "Abstract UI",
        url: "https://images.unsplash.com/photo-1550745165-9bc0b252726f?w=900&q=80",
        tags: ["insight", "lesson"],
      },
    ],
  },
  {
    slug: "mixed",
    name: "Mixed",
    description: "Blend of philosopher + product + nature",
    assets: [],
  },
  {
    slug: "auto",
    name: "Auto",
    description: "AI picks the best collection for the topic",
    assets: [],
  },
];

// Fill mixed from others
const mixed = VISUAL_TEMPLATES.find((t) => t.slug === "mixed")!;
mixed.assets = [
  ...VISUAL_TEMPLATES.find((t) => t.slug === "philosopher")!.assets.slice(0, 2),
  ...VISUAL_TEMPLATES.find((t) => t.slug === "nature")!.assets.slice(0, 2),
  ...VISUAL_TEMPLATES.find((t) => t.slug === "product")!.assets.slice(0, 2),
];

export type SlideVisual = {
  text: string;
  backgroundAssetId: string;
  backgroundUrl: string;
  overlay: "dark" | "soft" | "none" | "gradient";
  textPosition: "center" | "top" | "bottom";
  animation: "fade" | "slide-up" | "none";
  transition: "cut" | "fade";
};

export function resolveTemplate(slug?: string): VisualTemplate {
  if (!slug || slug === "auto") {
    return VISUAL_TEMPLATES.find((t) => t.slug === "philosopher")!;
  }
  const found = VISUAL_TEMPLATES.find((t) => t.slug === slug);
  if (!found || found.assets.length === 0) {
    return VISUAL_TEMPLATES.find((t) => t.slug === "philosopher")!;
  }
  return found;
}

export function pickVisualsForSlides(
  slideTexts: string[],
  templateSlug?: string,
  beats: string[] = [],
): { template: VisualTemplate; slides: SlideVisual[]; picks: string[] } {
  const template =
    templateSlug === "auto"
      ? resolveTemplate("philosopher")
      : resolveTemplate(templateSlug);

  const used = new Set<string>();
  const picks: string[] = [];
  const slides: SlideVisual[] = slideTexts.map((text, i) => {
    const beat = (beats[i] || "").toLowerCase();
    const isLast = i === slideTexts.length - 1;
    let pool = template.assets;
    if (isLast) {
      const mocks = template.assets.filter((a) => a.kind === "mockup" || a.tags.includes("cta"));
      if (mocks.length) pool = mocks;
    } else if (beat) {
      const tagged = template.assets.filter((a) =>
        a.tags.some((t) => beat.includes(t) || t.includes(beat.split(" ")[0] || "")),
      );
      if (tagged.length) pool = tagged;
    }
    let asset = pool.find((a) => !used.has(a.id)) || pool[i % pool.length] || template.assets[0];
    if (!asset) {
      asset = {
        id: "fallback",
        kind: "background",
        label: "Fallback",
        url: "https://images.unsplash.com/photo-1557683316-973673baf926?w=900&q=80",
        tags: [],
      };
    }
    used.add(asset.id);
    picks.push(`${asset.label} (${asset.id})`);
    return {
      text,
      backgroundAssetId: asset.id,
      backgroundUrl: asset.url,
      overlay: isLast ? "gradient" : "dark",
      textPosition: i === 0 ? "center" : i % 2 === 0 ? "center" : "bottom",
      animation: i === 0 ? "fade" : "slide-up",
      transition: "fade",
    };
  });

  return { template, slides, picks };
}

export function scoreCarousel(input: {
  hook: string;
  slides: string[];
  refsAvgViews: number;
  projectAvgViews: number;
  engagementHint: number;
}): {
  score: number;
  hook: number;
  retention: number;
  saves: number;
  downloads: number;
  reasons: string[];
} {
  const hookLen = input.hook.trim().length;
  const hookScore =
    hookLen >= 40 && hookLen <= 120 ? 5 : hookLen >= 20 && hookLen <= 160 ? 4 : 3;
  const avgSlide =
    input.slides.reduce((s, t) => s + t.length, 0) / Math.max(input.slides.length, 1);
  const retention =
    avgSlide >= 60 && avgSlide <= 220 ? 4 : avgSlide > 40 ? 3 : 2;
  const continuity = input.slides.every((s) => s.split(/\s+/).length >= 6) ? 5 : 3;
  const saves = continuity >= 5 ? 5 : 4;
  const downloads = /download|app|link in bio|try|zeno/i.test(
    input.slides[input.slides.length - 1] || "",
  )
    ? 4
    : 3;

  let score = Math.round(
    ((hookScore + retention + saves + downloads) / 20) * 100,
  );
  if (input.refsAvgViews > input.projectAvgViews * 1.2) score = Math.min(98, score + 4);
  if (input.engagementHint >= 4) score = Math.min(98, score + 2);

  const reasons: string[] = [];
  if (hookScore >= 4) reasons.push("Excellent hook length and tension");
  if (retention >= 4) reasons.push("Slide length supports swipe retention");
  if (saves >= 4) reasons.push("Narrative depth likely to earn saves");
  if (downloads >= 4) reasons.push("CTA slide invites app action");

  return {
    score,
    hook: hookScore,
    retention,
    saves,
    downloads,
    reasons,
  };
}
