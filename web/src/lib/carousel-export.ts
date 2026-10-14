import JSZip from "jszip";
import { saveAs } from "file-saver";
import {
  wrapCaptionLines,
  type CaptionBoxId,
  type TextPosition,
} from "@/lib/caption-box";
import { getTextStyle, type TextStyleId } from "@/lib/text-styles";
import { resolveCaptionPaint } from "@/lib/caption-accents";
import {
  resolveSlideCopy,
  slideFontScale,
} from "@/lib/generator/parse-pasted-scripts";
import {
  resolveSlideCustomization,
  type SlideCustomization,
  type SlideTextAlign,
} from "@/lib/generator/types";

function canvasFontUniform(
  style: ReturnType<typeof getTextStyle>,
  size: number,
  weight = 600,
) {
  return style.canvasFont(size).replace(
    /^(italic\s+)?(\d+)\s+/,
    (_, it) => `${it || ""}${weight} `,
  );
}

export type ExportSlide = {
  index: number;
  text: string;
  heading?: string;
  body?: string;
  backgroundUrl?: string;
  textPosition?: TextPosition | "none" | string;
  /** Vertical position as % of canvas height (5–85). Overrides textPosition presets. */
  positionY?: number;
  boxWidth?: number;
  fontSizeScale?: number;
  textAlign?: SlideTextAlign;
  customization?: SlideCustomization;
  isProduct?: boolean;
};

/** Background dim — off by default so pack art stays vivid. */
export type DimLevel = "none" | "soft" | "dark";

const W = 1080;
const H = 1920;

/** Reuse decoded backgrounds across preview + publish renders. */
const imageCache = new Map<string, Promise<HTMLImageElement>>();

function loadImage(url: string): Promise<HTMLImageElement> {
  const cached = imageCache.get(url);
  if (cached) return cached;
  const pending = new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => {
      imageCache.delete(url);
      reject(new Error(`Failed to load image: ${url}`));
    };
    img.src = url;
  });
  imageCache.set(url, pending);
  return pending;
}

function canvasToBlob(
  canvas: HTMLCanvasElement,
  mime: "image/png" | "image/jpeg",
  quality = 0.88,
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) =>
        blob
          ? resolve(blob)
          : reject(new Error(`${mime} encode failed`)),
      mime,
      mime === "image/jpeg" ? quality : undefined,
    );
  });
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

async function ensureFonts(style: ReturnType<typeof getTextStyle>) {
  if (typeof document === "undefined" || !document.fonts?.load) return;
  try {
    await document.fonts.load(style.canvasFont(64));
  } catch {
    /* fallback fonts still render */
  }
}

function applyDim(ctx: CanvasRenderingContext2D, dim: DimLevel) {
  if (dim === "none") return;
  const overlay = ctx.createLinearGradient(0, 0, 0, H);
  if (dim === "soft") {
    overlay.addColorStop(0, "rgba(0,0,0,0.12)");
    overlay.addColorStop(0.5, "rgba(0,0,0,0.18)");
    overlay.addColorStop(1, "rgba(0,0,0,0.28)");
  } else {
    overlay.addColorStop(0, "rgba(0,0,0,0.28)");
    overlay.addColorStop(0.45, "rgba(0,0,0,0.38)");
    overlay.addColorStop(1, "rgba(0,0,0,0.5)");
  }
  ctx.fillStyle = overlay;
  ctx.fillRect(0, 0, W, H);
}

export type RenderSlideOpts = {
  textStyleId?: TextStyleId | string;
  captionBoxId?: CaptionBoxId | string;
  /** Default: none (no automatic dimming) */
  dim?: DimLevel;
};

export async function renderSlidePng(
  slide: ExportSlide,
  textStyleId?: TextStyleId | string,
  captionBoxId?: CaptionBoxId | string,
  dim: DimLevel = "none",
  opts?: {
    mime?: "image/png" | "image/jpeg";
    quality?: number;
    skipFonts?: boolean;
  },
): Promise<Blob> {
  const style = getTextStyle(textStyleId);
  const paint = resolveCaptionPaint(textStyleId, captionBoxId);
  const boxEnabled = paint.mode === "box";
  if (!opts?.skipFonts) await ensureFonts(style);

  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;

  ctx.fillStyle = "#0a0a0c";
  ctx.fillRect(0, 0, W, H);

  if (slide.backgroundUrl) {
    try {
      const img = await loadImage(slide.backgroundUrl);
      const scale = Math.max(W / img.width, H / img.height);
      const dw = img.width * scale;
      const dh = img.height * scale;
      ctx.drawImage(img, (W - dw) / 2, (H - dh) / 2, dw, dh);
    } catch {
      const g = ctx.createLinearGradient(0, 0, W, H);
      g.addColorStop(0, "#1a1a22");
      g.addColorStop(1, "#0d1117");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
    }
  }

  const mime = opts?.mime ?? "image/png";
  const quality = opts?.quality ?? 0.88;

  if (!slide.text?.trim()) {
    return canvasToBlob(canvas, mime, quality);
  }

  applyDim(ctx, dim);

  const layout = resolveSlideCustomization(slide.customization, {
    isProduct: Boolean(slide.isProduct),
    legacyPositionY:
      typeof slide.positionY === "number" ? slide.positionY : undefined,
  });
  if (typeof slide.boxWidth === "number") layout.boxWidth = slide.boxWidth;
  if (typeof slide.fontSizeScale === "number")
    layout.fontSizeScale = slide.fontSizeScale;
  if (slide.textAlign === "left" || slide.textAlign === "center")
    layout.textAlign = slide.textAlign;

  const copy = resolveSlideCopy(slide);
  const fullText = [copy.heading, copy.body].filter(Boolean).join("\n");
  const scaleType = slideFontScale(fullText.length);
  const m = layout.fontSizeScale;
  const hasHeading = Boolean(copy.heading?.trim());
  const hasBody = Boolean(copy.body?.trim());

  const scale = W / 390;
  const boxPadX = boxEnabled ? paint.paddingX * scale : 0;
  const boxPadY = boxEnabled ? paint.paddingY * scale : 0;
  const boxRadius = paint.borderRadius * scale;
  const contentW = (W * layout.boxWidth) / 100;
  const maxTextW = contentW - boxPadX * 2;

  const headingSize = Math.round(scaleType.bodyCanvasPx * m);
  const bodySize = headingSize;

  const alignX =
    layout.textAlign === "left"
      ? Math.round((W - contentW) / 2 + boxPadX)
      : Math.round(W / 2);
  ctx.textAlign = layout.textAlign === "left" ? "left" : "center";
  ctx.textBaseline = "middle";

  const headingLines = hasHeading
    ? (() => {
        ctx.font = canvasFontUniform(style, headingSize);
        return wrapCaptionLines(
          copy.heading!,
          (t) => ctx.measureText(t).width,
          maxTextW,
          6,
        );
      })()
    : [];

  const bodyLines = hasBody
    ? (() => {
        ctx.font = canvasFontUniform(style, bodySize);
        return wrapCaptionLines(
          copy.body,
          (t) => ctx.measureText(t).width,
          maxTextW,
          14,
        );
      })()
    : !hasHeading
      ? (() => {
          ctx.font = canvasFontUniform(style, bodySize);
          return wrapCaptionLines(
            fullText,
            (t) => ctx.measureText(t).width,
            maxTextW,
            14,
          );
        })()
      : [];

  const drawHeadingOnly = hasHeading && !hasBody;
  const hLines = drawHeadingOnly
    ? (() => {
        ctx.font = canvasFontUniform(style, headingSize);
        return wrapCaptionLines(
          copy.heading!,
          (t) => ctx.measureText(t).width,
          maxTextW,
          6,
        );
      })()
    : headingLines;

  const headingLineH = headingSize * 1.375;
  const bodyLineH = bodySize * 1.375;
  const gap =
    hLines.length && bodyLines.length ? scaleType.gapCanvasPx * Math.min(m, 1.2) : 0;
  const blockH =
    hLines.length * headingLineH + gap + bodyLines.length * bodyLineH;

  let maxLineW = 0;
  ctx.font = canvasFontUniform(style, headingSize);
  for (const line of hLines) {
    maxLineW = Math.max(maxLineW, ctx.measureText(line).width);
  }
  ctx.font = canvasFontUniform(style, bodySize);
  for (const line of bodyLines) {
    maxLineW = Math.max(maxLineW, ctx.measureText(line).width);
  }

  const yPct = layout.positionY;
  const maxBlockH = H * 0.85;
  const safeBlockH = Math.min(blockH, maxBlockH);
  let blockTop = Math.round((H * yPct) / 100);
  if (blockTop + safeBlockH > H * 0.92) {
    blockTop = Math.round(H * 0.92 - safeBlockH);
  }
  blockTop = Math.max(Math.round(H * 0.06), blockTop);

  const drawLine = (line: string, y: number, size: number) => {
    ctx.font = canvasFontUniform(style, size);
    if (boxEnabled) {
      ctx.shadowColor = "transparent";
      ctx.shadowBlur = 0;
      ctx.fillStyle = paint.textColor;
      ctx.fillText(line, alignX, Math.round(y));
    } else {
      ctx.shadowColor = paint.canvasShadow;
      ctx.shadowBlur = paint.canvasShadowBlur;
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = paint.canvasShadowOffsetY ?? 2;
      if (style.canvasStroke && style.canvasStrokeWidth) {
        ctx.lineWidth = style.canvasStrokeWidth;
        ctx.strokeStyle = style.canvasStroke;
        ctx.lineJoin = "round";
        ctx.strokeText(line, alignX, y);
      }
      ctx.fillStyle = paint.textColor;
      ctx.fillText(line, alignX, y);
    }
  };

  if (boxEnabled) {
    const bw = Math.round(Math.min(contentW, maxLineW + boxPadX * 2));
    const bx =
      layout.textAlign === "left"
        ? Math.round((W - contentW) / 2)
        : Math.round(W / 2 - bw / 2);
    const by = Math.round(blockTop - boxPadY + bodySize * 0.06);
    const bh = Math.round(blockH + boxPadY * 2 - bodySize * 0.08);

    ctx.save();
    if (paint.canvasBoxShadowBlur) {
      ctx.shadowColor = paint.canvasBoxShadow || "rgba(0,0,0,0.22)";
      ctx.shadowBlur = paint.canvasBoxShadowBlur;
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = paint.canvasBoxShadowOffsetY ?? 2;
    } else {
      ctx.shadowBlur = 0;
    }
    ctx.fillStyle = paint.boxBackground;
    roundRect(ctx, bx, by, bw, bh, Math.round(boxRadius));
    ctx.fill();
    ctx.restore();
  }

  let y = blockTop + (hLines.length ? headingLineH : bodyLineH) / 2;
  for (const line of hLines) {
    drawLine(line, y, headingSize);
    y += headingLineH;
  }
  if (hLines.length && bodyLines.length) {
    y += gap - headingLineH / 2 + bodyLineH / 2;
  }
  for (const line of bodyLines) {
    drawLine(line, y, bodySize);
    y += bodyLineH;
  }
  ctx.shadowBlur = 0;

  return canvasToBlob(canvas, mime, quality);
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Failed to encode slide"));
    reader.readAsDataURL(blob);
  });
}

/** Render every slide to JPEG in parallel — used by TikTok publish. */
export async function renderSlidesJpegBlobs(
  slides: ExportSlide[],
  textStyleId?: TextStyleId | string,
  captionBoxId?: CaptionBoxId | string,
  dim: DimLevel = "none",
): Promise<Blob[]> {
  const style = getTextStyle(textStyleId);
  await ensureFonts(style);
  const t0 =
    typeof performance !== "undefined" ? performance.now() : Date.now();
  const blobs = await Promise.all(
    slides.map((slide) =>
      renderSlidePng(slide, textStyleId, captionBoxId, dim, {
        mime: "image/jpeg",
        quality: 0.88,
        skipFonts: true,
      }),
    ),
  );
  const ms = Math.round(
    (typeof performance !== "undefined" ? performance.now() : Date.now()) - t0,
  );
  console.info(
    `[perf] carousel-render · ${slides.length} slides JPEG +${ms}ms`,
    { bytes: blobs.map((b) => b.size) },
  );
  return blobs;
}

export async function renderSlidesBase64(
  slides: ExportSlide[],
  textStyleId?: TextStyleId | string,
  captionBoxId?: CaptionBoxId | string,
  dim: DimLevel = "none",
): Promise<string[]> {
  const blobs = await renderSlidesJpegBlobs(
    slides,
    textStyleId,
    captionBoxId,
    dim,
  );
  return Promise.all(blobs.map((blob) => blobToDataUrl(blob)));
}

function safeFolder(name: string) {
  return name.replace(/[<>:"/\\|?*]+/g, "").trim().slice(0, 60) || "Carousel";
}

export async function exportCarouselZip(opts: {
  topic: string;
  slides: ExportSlide[];
  caption: string;
  hashtags: string[];
  textStyleId?: TextStyleId | string;
  captionBoxId?: CaptionBoxId | string;
  dim?: DimLevel;
  onProgress?: (msg: string) => void;
}) {
  const folder = safeFolder(opts.topic);
  const zip = new JSZip();
  const root = zip.folder(folder)!;
  const dim = opts.dim ?? "none";

  for (const slide of opts.slides) {
    opts.onProgress?.(`Rendering slide ${slide.index}…`);
    const png = await renderSlidePng(slide, opts.textStyleId, opts.captionBoxId, dim);
    root.file(`slide${slide.index}.png`, png);
  }

  root.file("caption.txt", opts.caption.trim());
  root.file(
    "hashtags.txt",
    opts.hashtags.map((h) => (h.startsWith("#") ? h : `#${h}`)).join(" "),
  );
  root.file(
    "metadata.json",
    JSON.stringify(
      {
        topic: opts.topic,
        slideCount: opts.slides.length,
        textStyle: opts.textStyleId || "tiktok-sans",
        captionBox: opts.captionBoxId || "highlight",
        dim,
        exportedAt: new Date().toISOString(),
        note: "Drag slide PNGs into TikTok, or use Publish to TikTok when OAuth is connected.",
      },
      null,
      2,
    ),
  );

  opts.onProgress?.("Building zip…");
  const blob = await zip.generateAsync({ type: "blob" });
  saveAs(blob, `${folder}.zip`);
  opts.onProgress?.("Done");
}

/** Export many carousels into one zip (folder per post). */
export async function exportCarouselBatchZip(opts: {
  batchName: string;
  carousels: {
    topic: string;
    slides: ExportSlide[];
    caption: string;
    hashtags: string[];
  }[];
  textStyleId?: TextStyleId | string;
  captionBoxId?: CaptionBoxId | string;
  dim?: DimLevel;
  onProgress?: (msg: string) => void;
}) {
  const zip = new JSZip();
  const root = zip.folder(safeFolder(opts.batchName))!;
  const dim = opts.dim ?? "none";

  for (let i = 0; i < opts.carousels.length; i++) {
    const c = opts.carousels[i]!;
    const folder = root.folder(
      `${String(i + 1).padStart(2, "0")}-${safeFolder(c.topic)}`,
    )!;
    for (const slide of c.slides) {
      opts.onProgress?.(
        `Carousel ${i + 1}/${opts.carousels.length} · slide ${slide.index}…`,
      );
      const png = await renderSlidePng(slide, opts.textStyleId, opts.captionBoxId, dim);
      folder.file(`slide${slide.index}.png`, png);
    }
    folder.file("caption.txt", c.caption.trim());
    folder.file(
      "hashtags.txt",
      c.hashtags.map((h) => (h.startsWith("#") ? h : `#${h}`)).join(" "),
    );
  }

  opts.onProgress?.("Building zip…");
  const blob = await zip.generateAsync({ type: "blob" });
  saveAs(blob, `${safeFolder(opts.batchName)}.zip`);
  opts.onProgress?.("Done");
}
