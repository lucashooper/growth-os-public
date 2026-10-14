/**
 * Display helpers for TikTok / ByteDance images.
 * Direct CDN links expire and are hotlink-blocked. Netlify cannot fetch them
 * reliably (datacenter IPs get 403/502). Use wsrv.nl in the browser instead.
 */

const PROXY_HOST_SUFFIXES = [
  "tiktokcdn.com",
  "tiktokcdn-us.com",
  "tiktokcdn-eu.com",
  "byteoversea.com",
  "ibyteimg.com",
  "byteimg.com",
  "muscdn.com",
  "tiktok.com",
  "ttwstatic.com",
];

export function normalizeMediaUrl(url?: string | null): string {
  let src = (url || "").trim().replace(/\\u002F/g, "/").replace(/\\\//g, "/");
  if (src.startsWith("https%3A") || src.startsWith("http%3A")) {
    try {
      src = decodeURIComponent(src);
    } catch {
      /* keep */
    }
  }
  if (src.startsWith("//")) src = `https:${src}`;
  return src;
}

export function needsImageProxy(url: string): boolean {
  if (!url.startsWith("http://") && !url.startsWith("https://")) return false;
  if (url.includes("/api/img?")) return false;
  if (url.includes("/api/media/pull/")) return false;
  if (url.includes("/uploads/")) return false;
  if (url.includes("wsrv.nl")) return false;
  try {
    const host = new URL(url).hostname.toLowerCase();
    return PROXY_HOST_SUFFIXES.some(
      (suffix) => host === suffix || host.endsWith(`.${suffix}`),
    );
  } catch {
    return false;
  }
}

export function weservUrl(src: string): string {
  return `https://wsrv.nl/?url=${encodeURIComponent(src)}&output=jpg&n=-1`;
}

export function oembedThumbSrc(shareUrl: string): string {
  return `/api/img?video=${encodeURIComponent(shareUrl)}`;
}

export function mediaSrc(url?: string | null): string {
  const src = normalizeMediaUrl(url);
  if (!src) return "";
  if (src.startsWith("data:") || src.startsWith("/")) return src;
  if (needsImageProxy(src)) return weservUrl(src);
  return src;
}

export function mediaFallbacks(
  url?: string | null,
  shareUrl?: string | null,
): string[] {
  const src = normalizeMediaUrl(url);
  const share = normalizeMediaUrl(shareUrl);
  const out: string[] = [];
  const push = (value: string) => {
    if (value && !out.includes(value)) out.push(value);
  };

  if (src && !needsImageProxy(src)) push(src);
  if (src && needsImageProxy(src)) {
    push(weservUrl(src));
    push(src);
  }
  if (share && /tiktok\.com\/.*\/video\//i.test(share)) {
    push(oembedThumbSrc(share));
  }
  return out;
}
