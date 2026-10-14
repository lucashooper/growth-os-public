import { NextResponse } from "next/server";
import { AuthError, guardProjectId } from "@/lib/api-auth";
import { logger } from "@/lib/logger";
import { withApi } from "@/lib/api-route";

import {
  assignPackImages,
  ensureImagePacks,
  serializePack,
} from "@/services/image-packs";
import { softProductCta } from "@/lib/soft-cta";

export const runtime = "nodejs";

type InputCarousel = {
  title: string;
  slides: { text: string; beat?: string; isProduct?: boolean }[];
};

/**
 * Compose carousels from user-provided slide copy — no AI rewrite.
 * Assigns Image Pack backgrounds; Product slides get soft CTA at Top.
 */
async function handlePOST(req: Request) {
  try {
    const body = (await req.json()) as {
      projectId?: string;
      imagePackSlug?: string;
      projectName?: string;
      carousels?: InputCarousel[];
    };

    if (!body.projectId) {
      return NextResponse.json({ error: "projectId required" }, { status: 400 });
    }
    await guardProjectId(body.projectId);

    const input = (body.carousels || []).filter((c) => c.slides?.length);
    if (!input.length) {
      return NextResponse.json(
        { error: "Paste at least one carousel with slides" },
        { status: 400 },
      );
    }

    const packs = await ensureImagePacks(body.projectId);
    const slug = body.imagePackSlug || "auto";
    const raw =
      (slug !== "auto" ? packs.find((p) => p.slug === slug) : null) ||
      packs.find((p) => p.isDefault) ||
      packs.find((p) => /zeno|philosoph/i.test(p.name + p.slug)) ||
      packs[0];
    const imagePack = raw ? serializePack(raw) : null;

    const carousels = input.map((c) => {
      const rawTexts = c.slides.map((s) => (s.text || "").trim());
      const beats = c.slides.map((s) => (s.beat || "").toLowerCase());
      const assigned = imagePack
        ? assignPackImages(
            {
              orderMode: imagePack.orderMode,
              name: imagePack.name,
              slug: imagePack.slug,
              description: imagePack.description,
              assets: imagePack.assets,
            },
            rawTexts.length,
            beats,
          )
        : [];

      // Sequential packs keep assigned order. AI mode may rematch Product beats to product assets.
      const appName = body.projectName || "insight";
      const visualSlides = rawTexts.map((text, i) => {
        let a = assigned[i];
        const wantProduct = Boolean(
          c.slides[i]?.isProduct || /product/i.test(c.slides[i]?.beat || ""),
        );
        if (wantProduct && imagePack && imagePack.orderMode === "ai") {
          const productAsset =
            imagePack.assets.find(
              (x) =>
                x.kind === "product" ||
                x.tags.includes("product") ||
                x.tags.includes("product-slide"),
            ) || imagePack.assets.find((x) => /product|zeno|app|ui|mock/i.test(x.label));
          if (productAsset) {
            a = {
              index: i + 1,
              assetId: productAsset.id,
              label: productAsset.label,
              url: productAsset.url,
              kind: productAsset.kind,
              suppressText: false,
              overlay: "soft",
              textPosition: "top",
              positionY: 18,
              animation: "fade",
              transition: "fade",
            };
          }
        }
        const isProduct =
          wantProduct ||
          a?.kind === "product" ||
          (a?.textPosition === "top" && a?.overlay === "soft");
        const url = a?.url || "";
        const raw = (text || "").trim();
        const ctaText =
          isProduct && (!raw || /product/i.test(raw))
            ? softProductCta(appName)
            : raw || (isProduct ? softProductCta(appName) : "");
        return {
          index: i + 1,
          text: ctaText,
          backgroundAssetId: a?.assetId || "",
          backgroundUrl: url,
          backgroundImageUrl: url,
          backgroundLabel: a?.label || "",
          backgroundKind: a?.kind || "background",
          isProduct: Boolean(isProduct),
          suppressText: false,
          overlay: a?.overlay || "dark",
          textPosition: isProduct ? "top" : a?.textPosition || "center",
          positionY: isProduct
            ? 18
            : typeof a?.positionY === "number"
              ? a.positionY
              : a?.textPosition === "bottom"
                ? 78
                : 48,
          animation: a?.animation || "fade",
          transition: a?.transition || "fade",
        };
      });

      // Keep original copy in slides[] for editing/export metadata
      const slides = visualSlides.map((v) => v.text);
      const hook = slides.find(Boolean) || c.title;
      const caption = `${c.title}\n\n${slides.filter(Boolean).join("\n\n")}`.slice(0, 2200);

      return {
        hook,
        title: c.title,
        narrative: c.title,
        slides,
        visualSlides,
        caption,
        hashtags: ["#journaling", "#stoicism", "#mindfulness", "#zeno", "#selfimprovement"],
        templateName: imagePack?.name,
        templateId: imagePack?.slug,
        fromScripts: true,
      };
    });

    logger.info("api", "Composed carousels from scripts", {
      projectId: body.projectId,
      count: carousels.length,
      pack: imagePack?.slug,
    });

    const assetLog = [
      `Parsed ${carousels.length} carousel(s) — kept your exact words (no AI rewrite)`,
      `Selected ${imagePack?.name || "image"} pack (${imagePack?.orderMode || "ai"} order)`,
      ...carousels.flatMap((c) =>
        (c.visualSlides || []).map(
          (v) =>
            `${c.title}: slide ${v.index} → ${v.backgroundLabel || "none"}${
              v.suppressText ? " (product · image only)" : ""
            }`,
        ),
      ),
    ];

    return NextResponse.json({
      carousels,
      imagePack: imagePack
        ? { name: imagePack.name, slug: imagePack.slug, count: imagePack.imageCount }
        : null,
      assetLog,
      fromScripts: true,
    });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    const message = err instanceof Error ? err.message : "Compose failed";
    logger.error("api", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export const POST = withApi(handlePOST, "POST src/app/api/ai/compose/route.ts");
