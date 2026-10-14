"use client";

import { useEffect, useMemo, useState } from "react";
import { mediaFallbacks } from "@/lib/media-url";
import { getPlaceholderImage } from "@/lib/placeholder-image";
import { cn } from "@/lib/utils";

export function MediaImg({
  src,
  shareUrl,
  alt = "",
  className,
  fallbackSeed,
}: {
  src?: string | null;
  shareUrl?: string | null;
  alt?: string;
  className?: string;
  fallbackSeed?: string;
}) {
  const candidates = useMemo(
    () => mediaFallbacks(src, shareUrl),
    [src, shareUrl],
  );
  const placeholder = fallbackSeed ? getPlaceholderImage(fallbackSeed) : "";
  const [index, setIndex] = useState(0);
  const current = candidates[index] || placeholder;

  useEffect(() => {
    setIndex(0);
  }, [src, shareUrl]);

  if (!current) {
    return <div className={cn("bg-surface-2", className)} />;
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={current}
      alt={alt}
      className={className}
      loading="lazy"
      decoding="async"
      referrerPolicy="no-referrer"
      onError={() => {
        if (index + 1 < candidates.length) {
          setIndex(index + 1);
          return;
        }
        if (placeholder && current !== placeholder) {
          setIndex(candidates.length);
        }
      }}
    />
  );
}
