import "server-only";

import { fetchTikTokViaBrowser } from "@/services/tiktok-browser";
import {
  emptyResult,
  extractHashtags,
  type CompetitorTarget,
  type DeepProvider,
  type ProviderResult,
} from "@/services/intel/providers/types";
import { contentFingerprint } from "@/services/intel/browser-pool";

export const tiktokDeepProvider: DeepProvider = {
  id: "tiktok",

  supports(target) {
    return Boolean(target.handle?.replace(/^@/, "").trim());
  },

  async syncCompetitor(target: CompetitorTarget): Promise<ProviderResult> {
    const handle = target.handle.replace(/^@/, "").trim();
    try {
      const result = await fetchTikTokViaBrowser(handle, { scrollRounds: 6 });
      if (result.error && !result.profile && result.videos.length === 0) {
        return emptyResult("tiktok", result.error);
      }

      const videos = result.videos.map((v) => {
        const publishedAt = v.createTime
          ? new Date(v.createTime * 1000)
          : null;
        const hashtags = extractHashtags(v.description || "");
        return {
          externalId: v.id,
          hook:
            v.description.trim().split("\n")[0]?.slice(0, 120) ||
            `TikTok video ${v.id}`,
          caption: v.description,
          coverUrl: v.coverUrl,
          shareUrl:
            v.shareUrl || `https://www.tiktok.com/@${handle}/video/${v.id}`,
          views: v.views,
          likes: v.likes,
          comments: v.comments,
          shares: v.shares,
          saves: v.saves,
          hashtags,
          hourUtc: publishedAt ? publishedAt.getUTCHours() : null,
          publishedAt: publishedAt?.toISOString() ?? null,
          firstFrameUrl: v.coverUrl,
        };
      });

      const monthAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
      const recent = videos.filter(
        (v) =>
          v.publishedAt && new Date(v.publishedAt).getTime() >= monthAgo,
      );
      const insights: string[] = [];
      if (recent.length >= 12) {
        insights.push(`@${handle} posts aggressively (~${recent.length} in 30d).`);
      } else if (recent.length === 0 && videos.length) {
        insights.push(`@${handle} looks quiet recently — opportunity window.`);
      }
      const emotional = videos.filter((v) =>
        /i |you |nobody|hardest|afraid|anxiety|lonely/i.test(v.hook),
      ).length;
      if (emotional >= 3) {
        insights.push(`@${handle} leans on emotional first-line hooks.`);
      }

      const profile = result.profile;
      const structured = {
        handle,
        followers: profile?.followers ?? 0,
        following: profile?.following ?? 0,
        hearts: profile?.hearts ?? 0,
        videoCount: profile?.videoCount ?? 0,
        bio: profile?.bio ?? "",
        avatar: profile?.avatarUrl ?? "",
        postsCollected: videos.length,
        avgViews: videos.length
          ? Math.round(videos.reduce((s, v) => s + v.views, 0) / videos.length)
          : 0,
      };

      return {
        source: "tiktok",
        collectedAt: new Date().toISOString(),
        ok: Boolean(profile) || videos.length > 0,
        error: videos.length === 0 ? result.error : undefined,
        rawData: {
          profile,
          videoIds: videos.map((v) => v.externalId),
          itemListResponses: result.itemListResponses,
        },
        structuredData: structured,
        insights,
        videos,
        assets: videos
          .filter((v) => v.coverUrl)
          .slice(0, 30)
          .map((v) => ({
            kind: "thumbnail",
            url: v.coverUrl,
            externalId: v.externalId,
            title: v.hook,
            meta: { views: v.views, likes: v.likes },
          })),
        fingerprint: contentFingerprint(
          JSON.stringify({
            followers: structured.followers,
            ids: videos.slice(0, 10).map((v) => v.externalId),
          }),
        ),
      };
    } catch (err) {
      return emptyResult(
        "tiktok",
        err instanceof Error ? err.message : "TikTok sync failed",
      );
    }
  },
};
