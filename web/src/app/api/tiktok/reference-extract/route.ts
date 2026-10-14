import { NextResponse } from "next/server";
import { AuthError, guardProjectId } from "@/lib/api-auth";
import { logger } from "@/lib/logger";
import { withApi } from "@/lib/api-route";
import {
  buildReferenceTitle,
  resolveTikTokCarousel,
  slideTextToString,
  transcribeCarouselSlides,
} from "@/services/tiktok-carousel-import";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Resolve TikTok carousel via TikWM + vision OCR for on-image text. */
async function handlePOST(req: Request) {
  try {
    const body = (await req.json()) as { url?: string; projectId?: string };
    if (!body.url?.trim() || !body.projectId) {
      return NextResponse.json(
        { error: "url and projectId required" },
        { status: 400 },
      );
    }
    await guardProjectId(body.projectId);

    const url = body.url.trim();
    if (!/tiktok\.com/i.test(url)) {
      return NextResponse.json(
        { error: "Please paste a TikTok URL" },
        { status: 400 },
      );
    }

    let carousel;
    try {
      carousel = await resolveTikTokCarousel(url);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.warn("api", "TikTok carousel resolve failed", { url: url.slice(0, 80), message });
      return NextResponse.json(
        {
          error:
            "Could not find carousel slides at this link — try a public photo carousel URL.",
        },
        { status: 400 },
      );
    }

    if (!carousel.slideImageUrls.length) {
      return NextResponse.json(
        { error: "Could not find carousel slides at this link" },
        { status: 400 },
      );
    }

    const structuredSlides = await transcribeCarouselSlides(carousel.slideImageUrls);
    const slides = structuredSlides.map(slideTextToString).filter(Boolean);
    const hook =
      structuredSlides[0]?.hookOrHeading ||
      slides[0] ||
      carousel.title.slice(0, 160) ||
      "Hook from TikTok";

    const title = buildReferenceTitle(
      carousel.authorHandle,
      carousel.title,
      structuredSlides[0],
    );

    return NextResponse.json({
      title,
      hook,
      slides,
      structuredSlides,
      caption: carousel.caption,
      coverUrl: carousel.coverUrl || carousel.slideImageUrls[0] || "",
      slideImages: carousel.slideImageUrls,
      slideCount: carousel.slideImageUrls.length,
      authorHandle: carousel.authorHandle,
      sourceUrl: carousel.sourceUrl,
    });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    const message = err instanceof Error ? err.message : "Extract failed";
    logger.error("api", "TikTok reference extract failed", {
      error: message,
      stack: err instanceof Error ? err.stack?.slice(0, 500) : undefined,
    });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export const POST = withApi(
  handlePOST,
  "POST src/app/api/tiktok/reference-extract/route.ts",
);
