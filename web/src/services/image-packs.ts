import "server-only";
import { prisma } from "@/lib/db";
import { VISUAL_TEMPLATES } from "@/services/visual-templates";
import { logger } from "@/lib/logger";
import { packEmoji } from "@/lib/pack-emoji";

export type PackOrderMode = "sequential" | "random" | "ai";
export { packEmoji };

const SEED_PACKS = VISUAL_TEMPLATES.filter(
  (t) => t.slug !== "auto" && t.assets.length > 0,
);

let schemaReady: Promise<void> | null = null;

/** Ensure ImagePackAsset columns exist (prod may lag schema deploys). */
export function ensureImagePackSchema(): Promise<void> {
  if (!schemaReady) {
    schemaReady = (async () => {
      const url = process.env.DATABASE_URL || "";
      const isPostgres = /^postgres(ql)?:\/\//i.test(url);

      async function ensureColumn(
        probeSql: string,
        alterPostgres: string,
        alterSqlite: string,
        label: string,
      ) {
        try {
          await prisma.$queryRawUnsafe(probeSql);
          return;
        } catch {
          /* missing */
        }
        try {
          await prisma.$executeRawUnsafe(isPostgres ? alterPostgres : alterSqlite);
          logger.info("db", `Added ${label}`);
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          if (!/duplicate column|already exists/i.test(message)) {
            logger.error("db", `Failed to add ${label}`, { message });
            throw err;
          }
        }
      }

      await ensureColumn(
        `SELECT "description" FROM "ImagePackAsset" LIMIT 1`,
        `ALTER TABLE "ImagePackAsset" ADD COLUMN IF NOT EXISTS "description" TEXT NOT NULL DEFAULT ''`,
        `ALTER TABLE "ImagePackAsset" ADD COLUMN "description" TEXT NOT NULL DEFAULT ''`,
        "ImagePackAsset.description",
      );
      await ensureColumn(
        `SELECT "includedInSequence" FROM "ImagePackAsset" LIMIT 1`,
        `ALTER TABLE "ImagePackAsset" ADD COLUMN IF NOT EXISTS "includedInSequence" BOOLEAN NOT NULL DEFAULT true`,
        `ALTER TABLE "ImagePackAsset" ADD COLUMN "includedInSequence" BOOLEAN NOT NULL DEFAULT 1`,
        "ImagePackAsset.includedInSequence",
      );
    })().catch((err) => {
      schemaReady = null;
      throw err;
    });
  }
  return schemaReady;
}

function slugify(name: string) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48);
}

export async function ensureImagePacks(projectId: string) {
  await ensureImagePackSchema();
  const count = await prisma.imagePack.count({ where: { projectId } });
  if (count === 0) {
    for (const t of SEED_PACKS) {
      await prisma.imagePack.create({
        data: {
          projectId,
          name: t.name.replace(/ Collection$/, ""),
          slug: t.slug,
          description: t.description,
          orderMode: "ai",
          isDefault: t.slug === "philosopher",
          assets: {
            create: t.assets.map((a, i) => ({
              label: a.label,
              kind: a.kind,
              url: a.url,
              tagsJson: JSON.stringify(a.tags),
              sortOrder: i,
            })),
          },
        },
      });
    }
    logger.info("api", "Seeded default image packs", { projectId, count: SEED_PACKS.length });
  }

  return prisma.imagePack.findMany({
    where: { projectId },
    include: { assets: { orderBy: { sortOrder: "asc" } } },
    orderBy: [{ isDefault: "desc" }, { name: "asc" }],
  });
}

export function serializePack(
  pack: Awaited<ReturnType<typeof ensureImagePacks>>[number],
) {
  return {
    id: pack.id,
    name: pack.name,
    slug: pack.slug,
    description: pack.description,
    orderMode: pack.orderMode as PackOrderMode,
    isDefault: pack.isDefault,
    imageCount: pack.assets.length,
    emoji: packEmoji(pack.name, pack.slug),
    assets: pack.assets.map((a) => {
      const row = a as {
        description?: string;
        includedInSequence?: boolean;
        tagsJson: string;
        id: string;
        label: string;
        kind: string;
        url: string;
        path: string;
        sortOrder: number;
      };
      return {
        id: row.id,
        label: row.label,
        kind: row.kind,
        url: row.url,
        path: row.path,
        description:
          typeof row.description === "string" ? row.description : "",
        includedInSequence: row.includedInSequence !== false,
        tags: JSON.parse(row.tagsJson || "[]") as string[],
        sortOrder: row.sortOrder,
      };
    }),
  };
}

export function filenameToLabel(filename: string) {
  return filename
    .replace(/\.[^.]+$/, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 64) || "image";
}

function isProductAsset(a: { kind: string; tags: string[] }) {
  return (
    a.kind === "product" ||
    a.tags.includes("product") ||
    a.tags.includes("product-slide")
  );
}

type PackPick = {
  index: number;
  assetId: string;
  label: string;
  url: string;
  kind: string;
  /** Product/UI shots should not carry heavy caption text */
  suppressText: boolean;
  overlay: "dark" | "gradient" | "soft";
  textPosition: "center" | "top" | "bottom" | "none";
  /** Vertical caption position as % of frame (5–85) */
  positionY: number;
  animation: "fade" | "slide-up";
  transition: "fade";
};

function pickFromAsset(
  asset: { id: string; label: string; url: string; kind: string; tags: string[] },
  index: number,
  slideCount: number,
  forceSuppress = false,
): PackPick {
  const product = forceSuppress || isProductAsset(asset);
  const isLast = index === slideCount - 1;
  return {
    index,
    assetId: asset.id,
    label: asset.label,
    url: asset.url,
    kind: asset.kind,
    // Soft CTA is baked on product slides — never suppress caption overlay
    suppressText: false,
    overlay: product ? "soft" : isLast ? "gradient" : "dark",
    textPosition: product
      ? "top"
      : index === 1
        ? "center"
        : index % 2 === 0
          ? "center"
          : "bottom",
    positionY: product ? 18 : index === 1 ? 48 : index % 2 === 0 ? 48 : 78,
    animation: index === 1 ? "fade" : "slide-up",
    transition: "fade",
  };
}

/** Assign pack images to N slides using order mode. Never reuse the same image twice when enough assets exist. */
export function assignPackImages(
  pack: {
    orderMode: string;
    name: string;
    slug: string;
    description?: string;
    assets: {
      id: string;
      label: string;
      url: string;
      kind: string;
      tags: string[];
      description?: string;
      includedInSequence?: boolean;
    }[];
  },
  slideCount: number,
  beats: string[] = [],
  /** Optional AI-picked asset ids in slide order (from LLM) */
  preferredAssetIds?: string[],
) {
  const assets = pack.assets.filter((a) => a.includedInSequence !== false);
  if (!assets.length) return [];

  // Sequential: strict pack order (sortOrder) — slide 1 → asset 1, etc.
  if (pack.orderMode === "sequential") {
    return Array.from({ length: slideCount }, (_, i) => {
      const asset = assets[i % assets.length]!;
      const beatProduct = /product/i.test(beats[i] || "");
      return pickFromAsset(asset, i + 1, slideCount, beatProduct);
    });
  }

  let ordered = assets;
  if (pack.orderMode === "random") {
    ordered = [...assets].sort(() => Math.random() - 0.5);
  }

  const used = new Set<string>();
  const picks: PackPick[] = [];

  // Honor LLM preferred order first (AI chooses best)
  if (pack.orderMode === "ai" && preferredAssetIds?.length) {
    for (let i = 0; i < slideCount; i++) {
      const prefId = preferredAssetIds[i];
      const asset =
        (prefId && ordered.find((a) => a.id === prefId && !used.has(a.id))) ||
        ordered.find((a) => !used.has(a.id)) ||
        ordered[i % ordered.length]!;
      used.add(asset.id);
      picks.push(
        pickFromAsset(asset, i + 1, slideCount, /product/i.test(beats[i] || "")),
      );
    }
    return picks;
  }

  for (let i = 0; i < slideCount; i++) {
    const isLast = i === slideCount - 1;
    const isHook = i === 0;
    const beat = (beats[i] || "").toLowerCase();
    let pool = ordered;

    if (pack.orderMode === "ai" && isLast) {
      const mocks = ordered.filter(
        (a) =>
          a.kind === "mockup" ||
          a.tags.includes("cta") ||
          a.tags.includes("app") ||
          a.tags.includes("hook") ||
          isProductAsset(a),
      );
      if (mocks.length) pool = mocks;
    } else if (pack.orderMode === "ai" && isHook) {
      const hooks = ordered.filter(
        (a) =>
          !isProductAsset(a) &&
          (a.tags.includes("hook") ||
            a.tags.includes("cover") ||
            a.kind === "background"),
      );
      const nonProduct = ordered.filter((a) => !isProductAsset(a));
      if (hooks.length) pool = hooks;
      else if (nonProduct.length) pool = nonProduct;
    } else if (beat && pack.orderMode === "ai") {
      const tokens = beat.split(/\W+/).filter((t) => t.length > 3);
      const tagged = ordered.filter((a) => {
        const blob = `${a.label} ${a.description || ""} ${a.tags.join(" ")}`.toLowerCase();
        return (
          a.tags.some((t) => beat.includes(t) || tokens.includes(t)) ||
          tokens.some((t) => blob.includes(t))
        );
      });
      if (tagged.length) pool = tagged;
    }

    const unusedPool = pool.filter((a) => !used.has(a.id));
    const unusedAll = ordered.filter((a) => !used.has(a.id));
    const asset =
      unusedPool[0] ||
      unusedAll[0] ||
      ordered[i % ordered.length] ||
      assets[0]!;
    used.add(asset.id);

    const beatProduct = /product/i.test(beat);
    picks.push(pickFromAsset(asset, i + 1, slideCount, beatProduct));
  }

  return picks;
}

export async function createImagePack(
  projectId: string,
  input: { name: string; description?: string; orderMode?: PackOrderMode },
) {
  const base = slugify(input.name) || "pack";
  let slug = base;
  let n = 1;
  while (await prisma.imagePack.findUnique({ where: { projectId_slug: { projectId, slug } } })) {
    slug = `${base}-${n++}`;
  }
  return prisma.imagePack.create({
    data: {
      projectId,
      name: input.name.trim(),
      slug,
      description: input.description || "",
      orderMode: input.orderMode || "sequential",
    },
    include: { assets: true },
  });
}
