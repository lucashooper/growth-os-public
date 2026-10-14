import "server-only";

import { prisma } from "@/lib/db";

const DEFAULT_PACKS = [
  {
    name: "Auto",
    slug: "auto",
    description: "Pick the best pack for this content",
    colors: { bg: "#0b0f0e", accent: "#6ee7b7", text: "#f5f5f4", muted: "#a8a29e" },
    fonts: { display: "Avenir Next, Inter, system-ui", body: "Inter, system-ui" },
    assets: ["gradient-soft", "logo-mark"],
    previewCss:
      "background:linear-gradient(165deg,#12201c,#0b0f0e 55%,#1a1510);color:#f5f5f4",
    isDefault: true,
  },
  {
    name: "Zeno Purple",
    slug: "zeno-purple",
    description: "Purple branding, soft gradients, logo-ready",
    colors: { bg: "#120818", accent: "#a78bfa", text: "#faf5ff", muted: "#c4b5fd" },
    fonts: { display: "Avenir Next, Montserrat, system-ui", body: "Inter, system-ui" },
    assets: ["purple-gradient", "logo", "cta-card", "icons"],
    previewCss:
      "background:linear-gradient(160deg,#2a1040,#120818 50%,#1e1030);color:#faf5ff",
    isDefault: false,
  },
  {
    name: "Philosopher",
    slug: "philosopher",
    description: "Classic stoic backgrounds and serif-adjacent display",
    colors: { bg: "#14110e", accent: "#d6b27a", text: "#f5f0e6", muted: "#a8a29e" },
    fonts: { display: "Georgia, 'Times New Roman', serif", body: "Inter, system-ui" },
    assets: ["marble-bg", "scroll-texture", "quote-frame"],
    previewCss:
      "background:linear-gradient(165deg,#2a2218,#14110e 60%,#1c1814);color:#f5f0e6",
    isDefault: false,
  },
  {
    name: "Dark",
    slug: "dark",
    description: "High-contrast dark slides",
    colors: { bg: "#050505", accent: "#ffffff", text: "#ffffff", muted: "#a3a3a3" },
    fonts: { display: "SF Pro Display, Inter, system-ui", body: "Inter, system-ui" },
    assets: ["noise", "hard-shadow"],
    previewCss: "background:#050505;color:#fff",
    isDefault: false,
  },
  {
    name: "Minimal",
    slug: "minimal",
    description: "Clean light-on-dark typography",
    colors: { bg: "#111111", accent: "#e7e5e4", text: "#fafafa", muted: "#78716c" },
    fonts: { display: "Inter, Helvetica Neue, system-ui", body: "Inter, system-ui" },
    assets: ["thin-rules"],
    previewCss: "background:#111;color:#fafafa",
    isDefault: false,
  },
  {
    name: "Product Screenshots",
    slug: "product",
    description: "Frame for app UI screenshots",
    colors: { bg: "#0c1220", accent: "#38bdf8", text: "#f8fafc", muted: "#94a3b8" },
    fonts: { display: "Inter, system-ui", body: "Inter, system-ui" },
    assets: ["phone-bezel", "screenshot-slot", "cta-card"],
    previewCss:
      "background:linear-gradient(180deg,#152038,#0c1220);color:#f8fafc",
    isDefault: false,
  },
  {
    name: "Phone Mockups",
    slug: "phone-mockups",
    description: "Device frames for product moments",
    colors: { bg: "#0a0a0a", accent: "#86efac", text: "#f4f4f5", muted: "#a1a1aa" },
    fonts: { display: "Inter, system-ui", body: "Inter, system-ui" },
    assets: ["iphone-frame", "android-frame", "shadow"],
    previewCss: "background:#0a0a0a;color:#f4f4f5",
    isDefault: false,
  },
];

const DEFAULT_FLOWS = [
  {
    name: "Stoic Story",
    slug: "stoic-story",
    description: "Hook → Quote → Explanation → Application → CTA",
    beats: ["Hook", "Quote", "Explanation", "Application", "CTA"],
    slideCount: 5,
    isDefault: true,
  },
  {
    name: "Mistake Lesson",
    slug: "mistake-lesson",
    description: "Problem → Mistake → Lesson → Solution → App",
    beats: ["Problem", "Mistake", "Lesson", "Solution", "App"],
    slideCount: 5,
    isDefault: false,
  },
  {
    name: "Narrative Arc",
    slug: "narrative-arc",
    description: "Story → Conflict → Realisation → Advice → CTA",
    beats: ["Story", "Conflict", "Realisation", "Advice", "CTA"],
    slideCount: 5,
    isDefault: false,
  },
  {
    name: "Educational Deep Dive",
    slug: "education",
    description: "Hook → Context → Insight → Example → Practice → Soft CTA",
    beats: ["Hook", "Context", "Insight", "Example", "Practice", "Soft CTA"],
    slideCount: 6,
    isDefault: false,
  },
];

export async function ensureBrandPacks(projectId: string) {
  const count = await prisma.brandPack.count({ where: { projectId } });
  if (count > 0) {
    return prisma.brandPack.findMany({
      where: { projectId },
      orderBy: { name: "asc" },
    });
  }
  await prisma.brandPack.createMany({
    data: DEFAULT_PACKS.map((p) => ({
      projectId,
      name: p.name,
      slug: p.slug,
      description: p.description,
      colorsJson: JSON.stringify(p.colors),
      fontsJson: JSON.stringify(p.fonts),
      assetsJson: JSON.stringify(p.assets),
      previewCss: p.previewCss,
      isDefault: p.isDefault,
    })),
  });
  return prisma.brandPack.findMany({
    where: { projectId },
    orderBy: { name: "asc" },
  });
}

export async function ensureContentFlows(projectId: string) {
  const count = await prisma.contentFlow.count({ where: { projectId } });
  if (count === 0) {
    await prisma.contentFlow.createMany({
      data: DEFAULT_FLOWS.map((f) => ({
        projectId,
        name: f.name,
        slug: f.slug,
        description: f.description,
        beatsJson: JSON.stringify(f.beats),
        slideCount: f.slideCount,
        isDefault: f.isDefault,
      })),
    });
  }

  // Refresh engagement heuristic from published posts when possible
  const published = await prisma.post.findMany({
    where: { projectId, status: "published" },
    select: { views: true, likes: true, comments: true, theme: true },
  });
  if (published.length >= 5) {
    const meanEng =
      published.reduce((s, p) => {
        if (p.views <= 0) return s;
        return s + ((p.likes + p.comments) / p.views) * 100;
      }, 0) / published.length;

    const flows = await prisma.contentFlow.findMany({ where: { projectId } });
    for (const flow of flows) {
      // Lightweight heuristic: education themes boost education flow, etc.
      const boost =
        flow.slug.includes("stoic") || flow.slug.includes("narrative")
          ? 1.08
          : flow.slug.includes("mistake")
            ? 1.04
            : 1.0;
      await prisma.contentFlow.update({
        where: { id: flow.id },
        data: {
          avgEngagement: Number((meanEng * boost).toFixed(2)),
          sampleSize: published.length,
        },
      });
    }
  }

  return prisma.contentFlow.findMany({
    where: { projectId },
    orderBy: [{ avgEngagement: "desc" }, { name: "asc" }],
  });
}
