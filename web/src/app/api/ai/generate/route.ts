import { NextResponse } from "next/server";
import { completeLogged } from "@/lib/ai/logged";
import type { AIProviderId } from "@/lib/ai";
import { AuthError, guardProjectId } from "@/lib/api-auth";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/db";
import { ensureBrandPacks, ensureContentFlows } from "@/services/brand-packs";
import { scoreCarousel } from "@/services/visual-templates";
import { parseAiJsonObject } from "@/lib/ai/parse-json";
import { withApi } from "@/lib/api-route";

import {
  assignPackImages,
  ensureImagePacks,
  serializePack,
} from "@/services/image-packs";
import { softProductCta } from "@/lib/soft-cta";
import {
  formatPrompt,
  isLifestylePack,
} from "@/lib/generator/format-prompt";

export const runtime = "nodejs";
export const maxDuration = 60;

type Body = {
  projectId: string;
  projectName: string;
  projectDescription: string;
  topic: string;
  /** Simple mode intent */
  intent?: string;
  goal?: string;
  storyStructure?: string;
  writingLength: string;
  ctaStyle?: string;
  audience: string;
  slides?: number;
  count?: number;
  accountHandle?: string;
  /** If omitted, auto-pick top performers */
  referencePostIds?: string[];
  autoReferences?: boolean;
  brandPackSlug?: string;
  flowSlug?: string;
  visualTemplate?: string;
  /** Image pack slug or "auto" */
  imagePackSlug?: string;
  /** storytelling | informational */
  carouselFormat?: "storytelling" | "informational";
  formatReferenceId?: string;
  opportunityReason?: string;
  provider?: AIProviderId;
};

export type GeneratedCarousel = {
  hook: string;
  slides: string[];
  caption: string;
  ctaSlide: number;
  narrative?: string;
  hashtags?: string[];
  imageAssetIds?: string[];
};

const INTENT_MAP: Record<
  string,
  { goal: string; storyStructure: string; ctaStyle: string }
> = {
  "Viral Story": { goal: "Viral", storyStructure: "Curiosity", ctaStyle: "Soft CTA" },
  "Educational Carousel": {
    goal: "Education",
    storyStructure: "Curiosity",
    ctaStyle: "Soft ask",
  },
  "Founder Story": {
    goal: "Trust",
    storyStructure: "Founder Story",
    ctaStyle: "Soft CTA",
  },
  "App Promotion": {
    goal: "Downloads",
    storyStructure: "Before/After",
    ctaStyle: "Direct download",
  },
  "Personal Story": {
    goal: "Emotional",
    storyStructure: "POV",
    ctaStyle: "Soft ask",
  },
  Motivational: {
    goal: "Emotional",
    storyStructure: "Timeline",
    ctaStyle: "Question",
  },
};

const lengthGuide: Record<string, string> = {
  Short: "1 short sentence per slide.",
  Medium: "1–2 short sentences per slide.",
  Detailed: "2 short sentences max per slide.",
};

function cleanSlideText(text: unknown): string {
  const raw = String(text ?? "")
    .replace(/https?:\/\/\S+/gi, "")
    .replace(/www\.\S+/gi, "")
    .replace(/\b[\w./-]+\.(jpg|jpeg|png|webp|gif|avif)(\?\S*)?/gi, "")
    .replace(/supabase\.co\/storage\S*/gi, "")
    .replace(/tiktokcdn[\w.-]*\S*/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim();
  // Reject LLM placeholder tokens like "s1", "s2", "slide1"
  if (/^s\d+$/i.test(raw) || /^slide\s*\d+$/i.test(raw)) return "";
  return raw;
}

function parseGenerateJson(raw: string): { carousels?: GeneratedCarousel[] } {
  return parseAiJsonObject<{ carousels?: GeneratedCarousel[] }>(raw);
}

async function completeGenerateJson(
  req: Parameters<typeof completeLogged>[0],
  logOpts: Parameters<typeof completeLogged>[1],
  projectId: string,
) {
  let result = await completeLogged(req, logOpts);
  try {
    return { result, parsed: parseGenerateJson(result.content) };
  } catch (parseErr) {
    logger.warn("ai", "generate_carousel JSON parse failed — retrying", {
      projectId,
      provider: result.provider,
      model: result.model,
      responsePreview: result.content.slice(0, 600),
      parseError:
        parseErr instanceof Error ? parseErr.message : String(parseErr),
    });
    result = await completeLogged(
      {
        ...req,
        temperature: Math.min(req.temperature ?? 0.65, 0.45),
        messages: [
          ...req.messages,
          {
            role: "user",
            content:
              "Reply with ONLY one JSON object matching the schema. No prose, no markdown, no thinking tags. First character must be {.",
          },
        ],
      },
      { ...logOpts, action: "generate_carousel_retry" },
    );
    return { result, parsed: parseGenerateJson(result.content) };
  }
}

function isSafePackUrl(url: string) {
  if (!url) return false;
  if (/tiktokcdn|p16-sign|muscdn|byteoversea|ttlivecdn/i.test(url)) return false;
  return true;
}

async function pickReferencePosts(projectId: string, ids?: string[]) {
  if (ids?.length) {
    return prisma.post.findMany({ where: { id: { in: ids } } });
  }
  return prisma.post.findMany({
    where: { projectId, status: "published" },
    orderBy: { views: "desc" },
    take: 3,
  });
}

async function handlePOST(req: Request) {
  try {
    const body = (await req.json()) as Body;
    if (!body.projectId) {
      return NextResponse.json({ error: "projectId required" }, { status: 400 });
    }
    await guardProjectId(body.projectId);

    const {
      assertUsageAllowed,
      UsageLimitError,
      workspaceIdForProject,
    } = await import("@/services/usage");
    const workspaceId = await workspaceIdForProject(body.projectId);
    if (workspaceId) {
      try {
        await assertUsageAllowed(workspaceId, "agent");
      } catch (err) {
        if (err instanceof UsageLimitError) {
          return NextResponse.json({ error: err.message }, { status: 429 });
        }
        throw err;
      }
    }

    const intent = body.intent || "Educational Carousel";
    const mapped = INTENT_MAP[intent] || INTENT_MAP["Educational Carousel"];
    const goal = body.goal || mapped.goal;
    const storyStructure = body.storyStructure || mapped.storyStructure;
    const ctaStyle = body.ctaStyle || mapped.ctaStyle;
    const writingLength = body.writingLength || "Medium";
    const carouselFormat =
      body.carouselFormat === "informational" ? "informational" : "storytelling";
    const count = Math.min(Math.max(body.count ?? 1, 1), 5);

    // autoReferences false + empty ids = intentionally no references
    const manualRefs = body.autoReferences === false;
    const [packs, flows, referencePosts, imagePacks] = await Promise.all([
      ensureBrandPacks(body.projectId),
      ensureContentFlows(body.projectId),
      manualRefs
        ? body.referencePostIds?.length
          ? prisma.post.findMany({
              where: { id: { in: body.referencePostIds } },
            })
          : Promise.resolve([])
        : pickReferencePosts(body.projectId, body.referencePostIds),
      ensureImagePacks(body.projectId),
    ]);

    const flow =
      flows.find((f) => f.slug === body.flowSlug) ||
      flows.find((f) => f.isDefault) ||
      flows[0];
    const pack =
      packs.find((p) => p.slug === (body.brandPackSlug || "auto")) ||
      packs.find((p) => p.isDefault) ||
      packs[0];
    const imagePackSlug = body.imagePackSlug || body.visualTemplate || "auto";
    const skipPack = imagePackSlug === "none";
    const imagePackRaw = skipPack
      ? null
      : (imagePackSlug !== "auto"
          ? imagePacks.find((p) => p.slug === imagePackSlug)
          : null) ||
        imagePacks.find((p) => p.isDefault) ||
        imagePacks[0];
    const imagePackFull = imagePackRaw ? serializePack(imagePackRaw) : null;
    const imagePack = imagePackFull
      ? {
          ...imagePackFull,
          assets: imagePackFull.assets.filter((a) => isSafePackUrl(a.url)),
        }
      : null;

    const beats = flow ? (JSON.parse(flow.beatsJson || "[]") as string[]) : [];
    // Format modes lock to 5 slides for tight JSON + structure
    const slides = 5;

    const referenceBlock = referencePosts.length
      ? referencePosts
          .slice(0, 3)
          .map((p) => {
            const hook = (p.hook || "").replace(/\s+/g, " ").slice(0, 80);
            return `“${hook}” · ${p.views}v · ${p.likes}♡`;
          })
          .join("\n")
      : "None — invent from topic.";

    let formatFewShot = "";
    if (body.formatReferenceId) {
      try {
        const { getFormatReference, formatRefPromptBlock } = await import(
          "@/services/format-references"
        );
        const ref = await getFormatReference(
          body.formatReferenceId,
          body.projectId,
        );
        if (ref) {
          formatFewShot = `ARCHETYPE / SAVED REFERENCE (guiding few-shot — match hook syntax + slide progression exactly in STRUCTURE; write FRESH words):\n${formatRefPromptBlock([ref])}`;
        }
      } catch {
        /* optional */
      }
    }
    if (!formatFewShot) {
      try {
        const { listFormatReferences, formatRefPromptBlock } = await import(
          "@/services/format-references"
        );
        const refs = await listFormatReferences(body.projectId, carouselFormat);
        formatFewShot = formatRefPromptBlock(refs);
      } catch {
        /* table may not exist yet */
      }
    }

    const lifestyle = isLifestylePack(imagePack);
    const system = `You write TikTok carousel scripts for ${body.projectName}.
Return ONE JSON object only. First character must be {. No markdown, no <think>, no URLs, no image filenames in slide text.
Images are assigned separately — never put image links in hook/slides/caption.
${lengthGuide[writingLength] || lengthGuide.Medium}
${formatPrompt(carouselFormat, lifestyle)}
${formatFewShot ? `\n${formatFewShot}` : ""}`;

    const user = `Topic: ${body.topic}
App: ${body.projectName} — ${(body.projectDescription || "").slice(0, 160)}
Format: ${carouselFormat}${lifestyle ? " · lifestyle/girly tone ON" : ""}
Length: ${writingLength}
Pack mood: ${imagePack?.name ?? "auto"} — ${(imagePack?.description || "").slice(0, 100)}
Refs:
${referenceBlock}

Generate exactly ${count} distinct carousel variant(s) testing different hook angles on the same topic.
Each slides[] entry MUST be real readable copy (never placeholders like s1/s2).
The FINAL slide must be a soft product CTA (lowercase, low-pressure), e.g. "i log my thoughts here — i use ${body.projectName.toLowerCase()}" or "check in with yourself daily (i use ${body.projectName.toLowerCase()})". Never hard-sell.
${lifestyle ? `Tone reminder: lowercase, first-person, chaotic-helpful. Ban: over-indexing, cognitive debt, sensory fasting, optimizing, framework, mechanisms.` : ""}
JSON schema example:
{"carousels":[{"hook":"${lifestyle ? "things i do when every small task feels like a mountain" : "I accidentally changed my life with one habit"}","slides":[${lifestyle ? `"things i do when every small task feels like a mountain","1. ice cube in the palm — hold it when your brain is spiraling until it melts","2. voice note the spiral — 60 seconds then delete","3. three lines before bed about what felt heavy","i check in here every night — i use ${body.projectName.toLowerCase()}"` : `"I accidentally changed my life with one habit","I started writing three lines every night","The fog lifted within a week","I track the streak so it sticks","i log my thoughts here — i use ${body.projectName.toLowerCase()}"`}],"caption":"One habit. Full quiet. #journal #mindfulness","ctaSlide":5}]}`;

    const { result, parsed } = await completeGenerateJson(
      {
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        temperature: count > 1 ? 0.8 : 0.65,
        maxTokens: Math.min(8192, 2200 + count * 1600),
        json: false,
      },
      {
        action: "generate_carousel",
        projectId: body.projectId,
        provider: body.provider,
        meta: {
          intent,
          goal,
          carouselFormat,
          flow: flow?.slug,
          brandPack: pack?.slug,
          imagePack: imagePack?.slug,
          referenceIds: referencePosts.map((p) => p.id),
          variantCount: count,
        },
      },
      body.projectId,
    );

    const refsAvgViews =
      referencePosts.reduce((s, p) => s + (p.views || 0), 0) /
      Math.max(referencePosts.length, 1);
    const projectPosts = await prisma.post.findMany({
      where: { projectId: body.projectId, status: "published" },
      select: { views: true },
      take: 50,
    });
    const projectAvgViews =
      projectPosts.reduce((s, p) => s + (p.views || 0), 0) /
      Math.max(projectPosts.length, 1);

    const carousels = (parsed.carousels ?? []).slice(0, count).map((c) => {
      const rawSlides = (c.slides?.length ? c.slides : [c.hook])
        .map(cleanSlideText)
        .filter(Boolean);
      const slideList = (
        rawSlides.length
          ? rawSlides
          : [cleanSlideText(c.hook) || "A small habit changed everything."]
      ).slice(0, slides);
      while (slideList.length < slides) {
        slideList.push(slideList[slideList.length - 1] || "Keep going.");
      }
      const assigned =
        imagePack ?
          assignPackImages(
            {
              orderMode: imagePack.orderMode,
              name: imagePack.name,
              slug: imagePack.slug,
              description: imagePack.description,
              assets: imagePack.assets,
            },
            slideList.length,
            beats,
            undefined,
          )
        : [];
      const visualSlides = slideList.map((text, i) => {
        const a = assigned[i];
        const isProductAsset =
          a?.kind === "product" ||
          (a?.label || "").toLowerCase().includes("product");
        const isLastCta = i === slideList.length - 1;
        const isProduct = isProductAsset || isLastCta;
        const safeUrl =
          a?.url && isSafePackUrl(a.url) ? a.url : "";
        let cleaned = cleanSlideText(text);
        if (isProduct) {
          const looksLikeCta =
            cleaned.length > 0 &&
            (/i use |i built |check in|log my|that'?s why/i.test(cleaned) ||
              cleaned.length < 90);
          if (!looksLikeCta || !cleaned) {
            cleaned = softProductCta(body.projectName || "insight");
          }
        }
        return {
          index: i + 1,
          text: cleaned,
          backgroundAssetId: a?.assetId || "",
          backgroundUrl: safeUrl,
          backgroundImageUrl: safeUrl,
          backgroundLabel: a?.label || "",
          backgroundKind: a?.kind || "background",
          role: a?.kind || "background",
          isProduct,
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
      // Keep carousel.slides in sync for export/preview
      const syncedSlides = visualSlides.map((v) => v.text);
      const score = scoreCarousel({
        hook: cleanSlideText(c.hook) || syncedSlides.find(Boolean) || slideList[0],
        slides: syncedSlides.filter(Boolean).length ? syncedSlides : slideList,
        refsAvgViews,
        projectAvgViews,
        engagementHint: flow?.avgEngagement ?? 0,
      });
      const hashtags =
        c.hashtags?.length ?
          c.hashtags
        : ["#journaling", "#mindfulness", "#productivity", "#stoicism", "#selfimprovement"];
      const schema = visualSlides.map((v) => ({
        text: v.text,
        backgroundImageUrl: v.backgroundImageUrl,
        role: v.role,
      }));
      for (const s of schema) {
        if (typeof s.text !== "string" || typeof s.backgroundImageUrl !== "string") {
          throw new Error("Invalid slide schema after generate");
        }
        if (/https?:\/\//i.test(s.text)) {
          throw new Error("Slide text contained a URL after sanitize");
        }
      }
      return {
        ...c,
        hook: cleanSlideText(c.hook) || syncedSlides.find(Boolean) || slideList[0],
        caption: cleanSlideText(c.caption).slice(0, 220),
        slides: syncedSlides,
        visualSlides,
        ctaSlide: c.ctaSlide || slides,
        hashtags,
        score,
        templateId: imagePack?.slug,
        templateName: imagePack?.name,
        carouselFormat,
        assetPicks: assigned.map((a) => `${a.label} (${a.assetId})`),
        generatedSlideSchema: schema,
      };
    });
    if (!carousels.length) throw new Error("No carousels returned");

    const resolvedImageUrls = carousels.flatMap((c) =>
      (c.visualSlides || []).map((v: { backgroundImageUrl?: string }) => v.backgroundImageUrl || ""),
    );
    logger.info("ai", "Generated narrative carousels", {
      count: carousels.length,
      intent,
      carouselFormat,
      selectedImagePack: imagePack?.slug || null,
      resolvedImageUrls,
      generatedSlideSchema: carousels[0].generatedSlideSchema,
      flow: flow?.slug,
      template: carousels[0].templateId,
      refs: referencePosts.length,
      score: carousels[0].score?.score,
    });

    const thinking = [
      `Format: ${carouselFormat}`,
      `Selecting images from ${carousels[0].templateName || "Image Pack"}…`,
      `Writing ${count} variant${count === 1 ? "" : "s"}…`,
    ];
    const flowReason = "";

    return NextResponse.json({
      carousels,
      thinking,
      flowReason,
      assetLog: [
        `Selected ${carousels[0].templateName || "image"} pack (${imagePack?.orderMode || "ai"} order)`,
        ...((carousels[0].assetPicks as string[]) || []).slice(0, 5).map((p) => `Using ${p}`),
        "Using top-performing CTA pattern",
      ],
      imagePack,
      provider: result.provider,
      model: result.model,
      autoReferences: referencePosts.map((p) => ({
        id: p.id,
        hook: p.hook,
        coverUrl: p.coverUrl,
        shareUrl: p.shareUrl,
        views: p.views,
        likes: p.likes,
        comments: p.comments,
        publishedAt: p.publishedAt,
        status: p.status,
      })),
      brandPack: pack
        ? {
            id: pack.id,
            name: pack.name,
            slug: pack.slug,
            colors: JSON.parse(pack.colorsJson || "{}"),
            fonts: JSON.parse(pack.fontsJson || "{}"),
            previewCss: pack.previewCss,
            assets: JSON.parse(pack.assetsJson || "[]"),
          }
        : null,
      flow: flow
        ? {
            id: flow.id,
            name: flow.name,
            slug: flow.slug,
            beats,
            avgEngagement: flow.avgEngagement,
            sampleSize: flow.sampleSize,
            reason: flowReason,
          }
        : null,
      meta: {
        intent,
        goal,
        storyStructure,
        writingLength,
        ctaStyle,
        audience: body.audience,
        referencePostIds: referencePosts.map((p) => p.id),
        brandPackSlug: pack?.slug,
        flowSlug: flow?.slug,
        imagePackSlug: imagePack?.slug,
      },
      exportPack: {
        topic: body.topic,
        caption: carousels[0].caption,
        hashtags: carousels[0].hashtags,
        slides: carousels[0].visualSlides,
        score: carousels[0].score,
        readyFor: ["tiktok_manual"],
      },
    });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    const message = err instanceof Error ? err.message : "Generation failed";
    logger.error("ai", "generate_carousel route failed", {
      error: message,
      stack: err instanceof Error ? err.stack?.slice(0, 600) : undefined,
    });
    return NextResponse.json({ error: message, retryable: true }, { status: 500 });
  }
}

export const POST = withApi(handlePOST, "POST src/app/api/ai/generate/route.ts");
