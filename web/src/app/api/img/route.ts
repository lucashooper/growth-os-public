import { NextResponse } from "next/server";
import { needsImageProxy, normalizeMediaUrl, weservUrl } from "@/lib/media-url";
import { fetchTikTokOEmbed } from "@/services/tiktok-oembed";

export const runtime = "nodejs";
export const maxDuration = 15;

const BLOCKED_HOSTS = new Set([
  "localhost",
  "127.0.0.1",
  "0.0.0.0",
  "[::1]",
]);

function isPrivateHost(hostname: string) {
  if (BLOCKED_HOSTS.has(hostname.toLowerCase())) return true;
  if (/^10\.\d+\.\d+\.\d+$/.test(hostname)) return true;
  if (/^192\.168\.\d+\.\d+$/.test(hostname)) return true;
  if (/^172\.(1[6-9]|2\d|3[0-1])\.\d+\.\d+$/.test(hostname)) return true;
  return false;
}

async function handleGET(req: Request) {
  const url = new URL(req.url);
  const video = normalizeMediaUrl(url.searchParams.get("video"));
  if (video.includes("tiktok.com") && video.includes("/video/")) {
    const card = await fetchTikTokOEmbed(video);
    if (card?.coverUrl) {
      return NextResponse.redirect(weservUrl(card.coverUrl), 302);
    }
    return NextResponse.json({ error: "oembed thumbnail missing" }, { status: 404 });
  }

  const target = normalizeMediaUrl(url.searchParams.get("u"));
  if (!target.startsWith("https://")) {
    return NextResponse.json({ error: "https url required" }, { status: 400 });
  }

  let parsed: URL;
  try {
    parsed = new URL(target);
  } catch {
    return NextResponse.json({ error: "invalid url" }, { status: 400 });
  }

  if (isPrivateHost(parsed.hostname) || !needsImageProxy(target)) {
    return NextResponse.json({ error: "host not allowed" }, { status: 403 });
  }

  return NextResponse.redirect(weservUrl(target), 302);
}

export { handleGET as GET };
