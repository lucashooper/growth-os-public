/**
 * Parsers for TikTok public profile HTML / embedded JSON.
 * TikTok changes shapes often — we try multiple known layouts.
 */

export type TikTokProfile = {
  username: string;
  nickname: string;
  avatarUrl: string;
  bio: string;
  secUid: string;
  followers: number;
  following: number;
  hearts: number;
  videoCount: number;
};

export type TikTokVideo = {
  id: string;
  description: string;
  createTime: number | null;
  views: number;
  likes: number;
  comments: number;
  shares: number;
  saves: number;
  coverUrl: string;
  shareUrl: string;
  /** TikTok uniqueId of the author when known. */
  authorHandle?: string;
  /** Playable / downloadable video URL when available (Apify / TikWM). */
  videoUrl?: string;
  /** Photo-mode carousel image URLs (ephemeral until persisted). */
  imageUrls?: string[];
};

function authorFromItem(obj: Record<string, unknown>): string {
  const author = (obj.author ||
    obj.authorInfo ||
    obj.authorMeta ||
    obj.owner ||
    {}) as Record<string, unknown>;
  return str(
    author.uniqueId ||
      author.unique_id ||
      author.uniqueid ||
      author.name ||
      author.nickName ||
      obj.authorUniqueId,
  ).replace(/^@/, "");
}

export function videoBelongsToAccount(video: TikTokVideo, username: string) {
  const expected = username.replace(/^@/, "").trim().toLowerCase();
  if (!expected) return false;
  const author = (video.authorHandle || "").replace(/^@/, "").trim().toLowerCase();
  const fromUrl = video.shareUrl.match(/tiktok\.com\/@([^/?]+)/i)?.[1];
  const urlHandle =
    fromUrl && fromUrl !== "" && fromUrl !== "."
      ? fromUrl.replace(/^@/, "").toLowerCase()
      : "";

  if (urlHandle && urlHandle !== expected) return false;
  // uniqueId-style author that belongs to someone else
  if (author && /^[a-z0-9._]+$/.test(author) && author !== expected) return false;
  // Related/FYP blobs often have no author and a placeholder @/ URL
  if (!urlHandle && author !== expected) return false;
  return true;
}

export function filterVideosForAccount(videos: TikTokVideo[], username: string) {
  return videos.filter((v) => videoBelongsToAccount(v, username));
}

function num(v: unknown): number {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "" && !Number.isNaN(Number(v))) {
    return Number(v);
  }
  return 0;
}

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}

/** TikTok often stores images as `{ url_list: ["https://..."] }` not a string. */
export function imageUrl(v: unknown): string {
  if (typeof v === "string") {
    const raw = v.trim().replace(/\\u002F/g, "/").replace(/\\\//g, "/");
    if (raw.startsWith("//")) return `https:${raw}`;
    if (raw.startsWith("http://") || raw.startsWith("https://")) return raw;
    return "";
  }
  if (v && typeof v === "object") {
    const o = v as Record<string, unknown>;
    const list = o.url_list || o.urlList || o.UrlList;
    if (Array.isArray(list) && list.length) return imageUrl(list[0]);
    return imageUrl(o.url || o.uri || o.src);
  }
  return "";
}

/** Deep-walk object looking for first match of a predicate. */
function findNode(
  root: unknown,
  pred: (node: Record<string, unknown>) => boolean,
  depth = 0,
): Record<string, unknown> | null {
  if (!root || typeof root !== "object" || depth > 12) return null;
  if (Array.isArray(root)) {
    for (const item of root) {
      const found = findNode(item, pred, depth + 1);
      if (found) return found;
    }
    return null;
  }
  const obj = root as Record<string, unknown>;
  if (pred(obj)) return obj;
  for (const value of Object.values(obj)) {
    const found = findNode(value, pred, depth + 1);
    if (found) return found;
  }
  return null;
}

function collectVideos(root: unknown, out: Map<string, TikTokVideo>, depth = 0) {
  if (!root || typeof root !== "object" || depth > 14) return;
  if (Array.isArray(root)) {
    for (const item of root) collectVideos(item, out, depth + 1);
    return;
  }
  const obj = root as Record<string, unknown>;
  const id = str(obj.id || obj.aweme_id || obj.video_id);
  const stats = (obj.stats || obj.statistics || {}) as Record<string, unknown>;
  const hasPlay =
    stats.playCount !== undefined ||
    stats.play_count !== undefined ||
    obj.playCount !== undefined;
  const maybeCover =
    imageUrl((obj.video as Record<string, unknown> | undefined)?.cover) ||
    imageUrl(obj.cover);
  const looksLikeVideo =
    id.length >= 5 && (hasPlay || Boolean(maybeCover) || Boolean(obj.desc));

  if (id && looksLikeVideo) {
    const desc = str(obj.desc || obj.description || obj.title);
    const video = (obj.video || {}) as Record<string, unknown>;
    const cover =
      imageUrl(video.cover) ||
      imageUrl(video.originCover) ||
      imageUrl(video.dynamicCover) ||
      imageUrl(obj.cover) ||
      imageUrl((obj.videoMeta as Record<string, unknown> | undefined)?.coverUrl);

    const createTime = num(obj.createTime || obj.create_time) || null;
    const authorHandle = authorFromItem(obj);
    out.set(id, {
      id,
      description: desc,
      createTime: createTime && createTime < 1e12 ? createTime : createTime ? Math.floor(createTime / 1000) : null,
      views: num(stats.playCount ?? stats.play_count ?? obj.playCount),
      likes: num(stats.diggCount ?? stats.digg_count ?? obj.diggCount),
      comments: num(stats.commentCount ?? stats.comment_count ?? obj.commentCount),
      shares: num(stats.shareCount ?? stats.share_count ?? obj.shareCount),
      saves: num(stats.collectCount ?? stats.collect_count ?? obj.collectCount),
      coverUrl: cover,
      authorHandle: authorHandle || undefined,
      shareUrl:
        str(obj.shareUrl) ||
        (authorHandle
          ? `https://www.tiktok.com/@${authorHandle}/video/${id}`
          : ""),
    });
  }

  for (const value of Object.values(obj)) {
    collectVideos(value, out, depth + 1);
  }
}

export function extractEmbeddedJsonBlobs(html: string): unknown[] {
  const blobs: unknown[] = [];

  const universal = html.match(
    /<script[^>]*id="__UNIVERSAL_DATA_FOR_REHYDRATION__"[^>]*>([\s\S]*?)<\/script>/i,
  );
  if (universal?.[1]) {
    try {
      blobs.push(JSON.parse(universal[1]));
    } catch {
      /* ignore */
    }
  }

  const sigi = html.match(
    /<script[^>]*id="SIGI_STATE"[^>]*>([\s\S]*?)<\/script>/i,
  );
  if (sigi?.[1]) {
    try {
      blobs.push(JSON.parse(sigi[1]));
    } catch {
      /* ignore */
    }
  }

  // window['SIGI_STATE']=... or similar
  const assign = html.match(/SIGI_STATE\s*=\s*(\{[\s\S]*?\});?\s*<\/script>/i);
  if (assign?.[1]) {
    try {
      blobs.push(JSON.parse(assign[1]));
    } catch {
      /* ignore */
    }
  }

  return blobs;
}

export function parseProfileFromBlobs(
  blobs: unknown[],
  fallbackUsername: string,
): TikTokProfile | null {
  for (const blob of blobs) {
    const userInfo = findNode(blob, (n) => {
      const u = (n.user || n.userInfo || n) as Record<string, unknown>;
      const stats = (n.stats || n.statsV2 || u.stats) as Record<string, unknown> | undefined;
      return Boolean(
        (u.uniqueId || u.unique_id) &&
          (stats?.followerCount !== undefined ||
            stats?.follower_count !== undefined ||
            u.followerCount !== undefined),
      );
    });

    if (!userInfo) continue;

    const user = (userInfo.user ||
      (userInfo.userInfo as Record<string, unknown> | undefined)?.user ||
      userInfo) as Record<string, unknown>;
    const stats = (userInfo.stats ||
      userInfo.statsV2 ||
      user.stats ||
      {}) as Record<string, unknown>;

    const username = str(user.uniqueId || user.unique_id || fallbackUsername);
    return {
      username,
      nickname: str(user.nickname || user.nickName || username),
      avatarUrl:
        imageUrl(user.avatarLarger) ||
        imageUrl(user.avatarMedium) ||
        imageUrl(user.avatarThumb) ||
        imageUrl(user.avatar_larger) ||
        imageUrl(user.avatar_medium),
      bio: str(user.signature || user.bio || user.desc),
      secUid: str(user.secUid || user.sec_uid),
      followers: num(stats.followerCount ?? stats.follower_count ?? user.followerCount),
      following: num(stats.followingCount ?? stats.following_count ?? user.followingCount),
      hearts: num(stats.heart ?? stats.heartCount ?? stats.diggCount ?? user.heart),
      videoCount: num(stats.videoCount ?? stats.video_count ?? user.videoCount),
    };
  }

  return null;
}

export function parseVideosFromBlobs(
  blobs: unknown[],
  username?: string,
): TikTokVideo[] {
  const map = new Map<string, TikTokVideo>();
  for (const blob of blobs) collectVideos(blob, map);
  const all = [...map.values()].sort(
    (a, b) => (b.createTime ?? 0) - (a.createTime ?? 0),
  );
  return username ? filterVideosForAccount(all, username) : all;
}

/** Regex fallback when JSON blobs are missing / blocked. */
export function parseProfileFromHtmlRegex(
  html: string,
  username: string,
): Partial<TikTokProfile> {
  const pick = (re: RegExp) => {
    const m = html.match(re);
    return m ? Number(m[1]) : undefined;
  };
  const pickStr = (re: RegExp) => {
    const m = html.match(re);
    return m?.[1] ? JSON.parse(`"${m[1]}"`) : undefined;
  };

  return {
    username,
    followers: pick(/"followerCount"\s*:\s*(\d+)/),
    following: pick(/"followingCount"\s*:\s*(\d+)/),
    hearts: pick(/"heart"\s*:\s*(\d+)/) ?? pick(/"heartCount"\s*:\s*(\d+)/),
    videoCount: pick(/"videoCount"\s*:\s*(\d+)/),
    nickname: (() => {
      try {
        return pickStr(/"nickname"\s*:\s*"((?:\\.|[^"\\])*)"/);
      } catch {
        return undefined;
      }
    })(),
    avatarUrl: (() => {
      const m =
        html.match(/"avatarLarger"\s*:\s*"([^"]+)"/) ||
        html.match(/"avatarMedium"\s*:\s*"([^"]+)"/);
      if (!m?.[1]) return undefined;
      return m[1].replace(/\\u002F/g, "/").replace(/\\\//g, "/");
    })(),
    secUid: (() => {
      const m = html.match(/"secUid"\s*:\s*"([^"]+)"/);
      return m?.[1];
    })(),
  };
}
