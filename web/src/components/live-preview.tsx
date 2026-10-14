"use client";

import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { MediaImg } from "@/components/media-img";
import { Button } from "@/components/ui/button";
import { wrapCaptionLines } from "@/lib/caption-box";
import { resolveCaptionPaint } from "@/lib/caption-accents";
import { slideFontScale } from "@/lib/generator/parse-pasted-scripts";
import { getTextStyle } from "@/lib/text-styles";
import { cn } from "@/lib/utils";

export type LivePreviewSlide = {
  index: number;
  text: string;
  heading?: string;
  body?: string;
  backgroundUrl?: string;
};

export function LivePreview({
  slides,
  captionBoxId = "highlight",
  textStyleId = "tiktok-sans",
  onOpenEditor,
  className,
}: {
  slides: LivePreviewSlide[];
  captionBoxId?: string;
  textStyleId?: string;
  onOpenEditor?: () => void;
  className?: string;
}) {
  const [index, setIndex] = useState(0);
  const list = slides.length ? slides : [{ index: 1, text: "" }];
  const safeIndex = Math.min(index, list.length - 1);
  const current = list[safeIndex]!;
  const text = (current.text || current.heading || current.body || "").trim();

  const captionPaint = useMemo(
    () => resolveCaptionPaint(textStyleId, captionBoxId),
    [textStyleId, captionBoxId],
  );
  const textStyle = useMemo(() => getTextStyle(textStyleId), [textStyleId]);
  const fontScale = useMemo(() => slideFontScale(text.length), [text.length]);

  const lines = useMemo(() => {
    if (!text) return [];
    const padX = captionPaint.mode === "box" ? captionPaint.paddingX : 0;
    const maxW = 260 - padX * 2;
    const charW = fontScale.bodyPreviewPx * 0.52;
    return wrapCaptionLines(text, (t) => t.length * charW, Math.max(80, maxW), 14);
  }, [text, captionPaint.mode, captionPaint.paddingX, fontScale.bodyPreviewPx]);

  const go = (dir: -1 | 1) => {
    setIndex((i) => Math.min(list.length - 1, Math.max(0, i + dir)));
  };

  return (
    <div className={cn("flex h-full min-h-0 flex-col", className)}>
      <div className="flex min-h-0 flex-1 items-center justify-center px-4 pt-2">
        <div className="relative aspect-[9/16] h-full max-h-full w-auto max-w-full overflow-hidden rounded-2xl border border-white/[0.08] bg-black">
          <MediaImg
            src={current.backgroundUrl}
            className="absolute inset-0 h-full w-full object-cover"
            fallbackSeed={text || `slide-${current.index}`}
          />
          {text ? (
            <div className="absolute inset-0 z-10 flex items-center justify-center px-[12%]">
              <div
                className="max-h-[85%] w-full overflow-visible px-3.5 py-2.5 text-center font-semibold leading-snug [text-rendering:geometricPrecision] [-webkit-font-smoothing:antialiased]"
                style={{
                  fontFamily: textStyle.fontFamily,
                  fontSize: fontScale.bodyPreviewPx,
                  fontWeight: 600,
                  lineHeight: 1.375,
                  color: captionPaint.textColor,
                  backgroundColor:
                    captionPaint.mode === "box"
                      ? captionPaint.boxBackground
                      : undefined,
                  borderRadius:
                    captionPaint.mode === "box"
                      ? captionPaint.borderRadius
                      : undefined,
                  boxShadow:
                    captionPaint.mode === "box"
                      ? captionPaint.boxShadowCss || undefined
                      : undefined,
                  textShadow:
                    captionPaint.mode === "box" ? "none" : captionPaint.textShadow,
                }}
              >
                {lines.map((line, i) => (
                  <span key={`${i}-${line.slice(0, 12)}`} className="block">
                    {line || "\u00A0"}
                  </span>
                ))}
              </div>
            </div>
          ) : null}
          <div className="pointer-events-none absolute bottom-5 left-0 right-0 z-10 flex justify-center gap-1.5">
            {list.map((_, i) => (
              <span
                key={i}
                className={cn(
                  "h-1.5 rounded-full transition",
                  i === safeIndex ? "w-4 bg-white" : "w-1.5 bg-white/35",
                )}
              />
            ))}
          </div>
        </div>
      </div>

      <div className="shrink-0 px-4 pb-4 pt-3">
        <div className="flex items-center justify-center gap-2">
          <button
            type="button"
            aria-label="Previous slide"
            disabled={safeIndex <= 0}
            onClick={() => go(-1)}
            className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/[0.08] bg-white/[0.04] text-zinc-200 transition enabled:hover:bg-white/[0.08] disabled:opacity-30"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <div className="flex items-center gap-1.5 px-1">
            {list.map((_, i) => (
              <button
                key={i}
                type="button"
                aria-label={`Slide ${i + 1}`}
                onClick={() => setIndex(i)}
                className={cn(
                  "h-1.5 rounded-full transition",
                  i === safeIndex ? "w-4 bg-primary" : "w-1.5 bg-white/25 hover:bg-white/40",
                )}
              />
            ))}
          </div>
          <button
            type="button"
            aria-label="Next slide"
            disabled={safeIndex >= list.length - 1}
            onClick={() => go(1)}
            className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/[0.08] bg-white/[0.04] text-zinc-200 transition enabled:hover:bg-white/[0.08] disabled:opacity-30"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
        <p className="mt-2 text-center text-[11px] text-zinc-500">
          Slide {safeIndex + 1} / {list.length}
        </p>
        {onOpenEditor ? (
          <Button
            variant="secondary"
            className="mt-3 w-full"
            onClick={onOpenEditor}
          >
            Open in Generator →
          </Button>
        ) : null}
      </div>
    </div>
  );
}
