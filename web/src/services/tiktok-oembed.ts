import "server-only";

export type TikTokEmbedCard = {
  id: string;
  hook: string;
  coverUrl: string;
  shareUrl: string;
  authorName: string;
  authorUrl: string;
  views?: number;
  likes?: number;
  comments?: number;
  kind: "tiktok_embed";
};

const cache = new Map<string, TikTokEmbedCard>();

export function extractTikTokUrls(text: string): string[] {
  const urls = new Set<string>();
  const re =
    /https?:\/\/(?:www\.|vm\.)?tiktok\.com\/[^\s)\]>"']+/gi;
  for (const m of text.matchAll(re)) {
    let u = m[0].replace(/[.,;]+$/, "");
    // Normalize markdown-ish trailing
    u = u.replace(/\\+$/, "");
    urls.add(u);
  }
  // Also catch bare www.tiktok.com links
  const bare = /(?:www\.)?tiktok\.com\/@[^\s)\]>"']+/gi;
  for (const m of text.matchAll(bare)) {
    const u = m[0].startsWith("http") ? m[0] : `https://${m[0]}`;
    urls.add(u.replace(/[.,;]+$/, ""));
  }
  return [...urls].slice(0, 8);
}

export async function fetchTikTokOEmbed(url: string): Promise<TikTokEmbedCard | null> {
  if (cache.has(url)) return cache.get(url)!;
  try {
    const endpoint = `https://www.tiktok.com/oembed?url=${encodeURIComponent(url)}`;
    const res = await fetch(endpoint, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
      },
      signal: AbortSignal.timeout(12000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      title?: string;
      author_name?: string;
      author_url?: string;
      thumbnail_url?: string;
      thumbnail_width?: number;
      thumbnail_height?: number;
    };
    const id = `tt-${Buffer.from(url).toString("base64url").slice(0, 24)}`;
    const card: TikTokEmbedCard = {
      id,
      hook: data.title || "TikTok video",
      coverUrl: data.thumbnail_url || "",
      shareUrl: url,
      authorName: data.author_name || "",
      authorUrl: data.author_url || "",
      kind: "tiktok_embed",
    };
    cache.set(url, card);
    return card;
  } catch {
    return null;
  }
}

export async function enrichTikTokUrls(text: string): Promise<TikTokEmbedCard[]> {
  const urls = extractTikTokUrls(text);
  const cards: TikTokEmbedCard[] = [];
  for (const url of urls) {
    const card = await fetchTikTokOEmbed(url);
    if (card) cards.push(card);
  }
  return cards;
}
