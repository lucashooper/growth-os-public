import "server-only";

/**
 * Publishing service seam.
 * MVP: export packs for manual TikTok/IG posting.
 * Later: platform adapters (TikTok Content Posting API, Meta, etc.).
 */

export type PublishPlatform = "tiktok" | "instagram" | "threads" | "linkedin";

export type ExportPack = {
  topic: string;
  caption: string;
  hashtags: string[];
  slides: Array<{
    index: number;
    text: string;
    backgroundUrl?: string;
    backgroundAssetId?: string;
    overlay?: string;
    textPosition?: string;
    animation?: string;
    transition?: string;
  }>;
  score?: unknown;
  readyFor: string[];
};

export function buildCaptionFile(pack: ExportPack): string {
  const tags = pack.hashtags.join(" ");
  return `${pack.caption}\n\n${tags}`.trim();
}

export function buildPublishManifest(pack: ExportPack) {
  return {
    version: 1,
    createdAt: new Date().toISOString(),
    mode: "manual_export",
    platforms: pack.readyFor,
    topic: pack.topic,
    caption: pack.caption,
    hashtags: pack.hashtags,
    slides: pack.slides.map((s) => ({
      index: s.index,
      text: s.text,
      backgroundUrl: s.backgroundUrl,
      backgroundAssetId: s.backgroundAssetId,
      overlay: s.overlay,
      textPosition: s.textPosition,
      animation: s.animation,
      transition: s.transition,
    })),
    note: "Platform auto-publish is not enabled. Use Export → Publish manually on TikTok.",
  };
}

/**
 * Platform publish entrypoint.
 * TikTok photo carousels: use /api/tiktok/publish after OAuth (video.publish).
 */
export async function publishToPlatform(
  platform: PublishPlatform,
  _pack: ExportPack,
): Promise<{ ok: false; reason: string } | { ok: true; note: string }> {
  if (platform === "tiktok") {
    return {
      ok: true,
      note: "Use POST /api/tiktok/publish with OAuth-connected account + rendered slide PNGs.",
    };
  }
  return {
    ok: false,
    reason: `${platform} publishing is not implemented yet.`,
  };
}
