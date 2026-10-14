import "server-only";

import { logger } from "@/lib/logger";

export type CarouselSlideText = {
  slideNumber: number;
  hookOrHeading: string;
  body: string;
};

export type ResolvedTikTokCarousel = {
  slideImageUrls: string[];
  authorHandle: string;
  title: string;
  caption: string;
  coverUrl: string;
  sourceUrl: string;
};

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

const TIKWM_ENDPOINTS = (url: string) => [
  `https://www.tikwm.com/api/?url=${encodeURIComponent(url)}`,
  `https://tikwm.com/api/?url=${encodeURIComponent(url)}`,
];

function decodeEntities(s: string) {
  return s
    .replace(/\\u0026/g, "&")
    .replace(/\\u003c/g, "<")
    .replace(/\\u003e/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .trim();
}

function handleFromUrl(url: string): string {
  const m = url.match(/tiktok\.com\/@([^/?#]+)/i);
  return m?.[1] ? `@${m[1].replace(/^@/, "")}` : "";
}

function uniqImages(urls: string[], max = 12): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of urls) {
    const u = decodeEntities(String(raw || "")).trim();
    if (!u || !/^https?:\/\//i.test(u)) continue;
    const key = u.split("?")[0] || u;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(u);
    if (out.length >= max) break;
  }
  return out;
}

function collectTikwmImages(data: Record<string, unknown>): string[] {
  const urls: string[] = [];
  const push = (v: unknown) => {
    if (typeof v === "string" && v.startsWith("http")) urls.push(v);
    else if (v && typeof v === "object") {
      const o = v as Record<string, unknown>;
      for (const key of ["url", "link", "downloadLink", "cover", "origin_cover"]) {
        if (typeof o[key] === "string") urls.push(o[key] as string);
      }
      const list = o.url_list ?? o.urlList;
      if (Array.isArray(list)) {
        for (const item of list) push(item);
      }
    }
  };

  for (const key of ["images", "slideshowImageLinks", "imagePostImages"]) {
    const arr = data[key];
    if (Array.isArray(arr)) for (const item of arr) push(item);
  }

  const imagePost = data.image_post ?? data.imagePost;
  if (imagePost && typeof imagePost === "object") {
    const images = (imagePost as Record<string, unknown>).images;
    if (Array.isArray(images)) for (const img of images) push(img);
  }

  return uniqImages(urls);
}

/** Resolve carousel slide image URLs via TikWM (avoids TikTok explore-page redirect). */
export async function resolveTikTokCarousel(
  sourceUrl: string,
): Promise<ResolvedTikTokCarousel> {
  const cleanUrl = sourceUrl.trim();
  let lastErr = "TikWM request failed";

  for (const endpoint of TIKWM_ENDPOINTS(cleanUrl)) {
    try {
      const res = await fetch(endpoint, {
        headers: { "User-Agent": UA, Accept: "application/json" },
        signal: AbortSignal.timeout(16_000),
      });
      if (!res.ok) {
        lastErr = `TikWM HTTP ${res.status}`;
        continue;
      }

      const json = (await res.json()) as {
        code?: number;
        msg?: string;
        data?: Record<string, unknown>;
      };

      if (json.code !== 0 && json.code !== undefined) {
        lastErr = json.msg || `TikWM code ${json.code}`;
        logger.warn("sync", "TikWM non-zero code", {
          code: json.code,
          msg: json.msg,
          url: cleanUrl.slice(0, 80),
        });
        continue;
      }

      const data = json.data || {};
      const slideImageUrls = collectTikwmImages(data);

      const author =
        (data.author as Record<string, unknown> | undefined) ||
        (data.author_info as Record<string, unknown> | undefined);
      const uniqueId =
        String(author?.unique_id || author?.uniqueId || "").trim() ||
        handleFromUrl(cleanUrl).replace(/^@/, "");

      const authorHandle = uniqueId ? `@${uniqueId.replace(/^@/, "")}` : handleFromUrl(cleanUrl);

      const title = decodeEntities(
        String(data.title || data.desc || data.description || "").trim(),
      );
      const caption = title;
      const coverUrl =
        String(data.cover || data.origin_cover || slideImageUrls[0] || "").trim();

      if (!slideImageUrls.length) {
        lastErr = "No carousel images in TikWM response";
        continue;
      }

      logger.info("sync", "Resolved carousel via TikWM", {
        slides: slideImageUrls.length,
        author: authorHandle,
        title: title.slice(0, 60),
      });

      return {
        slideImageUrls,
        authorHandle,
        title,
        caption,
        coverUrl,
        sourceUrl: cleanUrl,
      };
    } catch (err) {
      lastErr = err instanceof Error ? err.message : String(err);
      logger.warn("sync", "TikWM fetch failed", {
        endpoint,
        message: lastErr,
      });
    }
  }

  throw new Error(lastErr || "Could not resolve TikTok carousel");
}

function parseSlideJson(raw: string): CarouselSlideText[] | null {
  const cleaned = raw
    .trim()
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "");

  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    const m = cleaned.match(/\[[\s\S]*\]/);
    if (!m) return null;
    try {
      parsed = JSON.parse(m[0]);
    } catch {
      return null;
    }
  }

  const arr = Array.isArray(parsed)
    ? parsed
    : parsed && typeof parsed === "object" && Array.isArray((parsed as { slides?: unknown }).slides)
      ? (parsed as { slides: unknown[] }).slides
      : null;

  if (!arr?.length) return null;

  return arr
    .map((item, i) => {
      const row = item as Record<string, unknown>;
      const hookOrHeading = String(
        row.hookOrHeading ?? row.heading ?? row.hook ?? row.title ?? "",
      ).trim();
      const body = String(row.body ?? row.text ?? row.subtext ?? "").trim();
      const slideNumber =
        typeof row.slideNumber === "number" ? row.slideNumber : i + 1;
      return { slideNumber, hookOrHeading, body };
    })
    .filter((s) => s.hookOrHeading || s.body);
}

async function visionViaOpenAI(
  imageUrls: string[],
): Promise<CarouselSlideText[] | null> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) return null;

  const model = process.env.OPENAI_VISION_MODEL?.trim() || "gpt-4o-mini";
  const content: Array<
    | { type: "text"; text: string }
    | { type: "image_url"; image_url: { url: string; detail: "low" } }
  > = [
    {
      type: "text",
      text: `Transcribe on-image overlay text from ${imageUrls.length} TikTok carousel slides (in order). Return ONLY a JSON array: [{"slideNumber":1,"hookOrHeading":"...","body":"..."}]. Slide 1 hookOrHeading is the main hook; body is supporting text on the same slide. Use empty string when a field has no text.`,
    },
  ];

  for (const url of imageUrls) {
    content.push({
      type: "image_url",
      image_url: { url, detail: "low" },
    });
  }

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      temperature: 0.1,
      max_tokens: 2500,
      messages: [
        {
          role: "system",
          content:
            "You are an OCR and TikTok script transcriber. For each slide image provided in sequence, extract the exact overlay text. Return a clean JSON array formatted as: [{ slideNumber: 1, hookOrHeading: string, body: string }]. No markdown.",
        },
        { role: "user", content },
      ],
    }),
    signal: AbortSignal.timeout(45_000),
  });

  if (!res.ok) {
    const errText = await res.text();
    logger.warn("sync", "OpenAI vision OCR failed", {
      status: res.status,
      body: errText.slice(0, 400),
    });
    return null;
  }

  const data = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const text = data.choices?.[0]?.message?.content?.trim() || "";
  return parseSlideJson(text);
}

async function fetchImageBase64(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": UA, Accept: "image/*" },
      signal: AbortSignal.timeout(12_000),
    });
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < 100 || buf.length > 4_000_000) return null;
    return buf.toString("base64");
  } catch {
    return null;
  }
}

async function visionViaGemini(
  imageUrls: string[],
): Promise<CarouselSlideText[] | null> {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) return null;

  const model = process.env.GEMINI_VISION_MODEL?.trim() || "gemini-2.0-flash";
  const parts: Array<{ text?: string; inlineData?: { mimeType: string; data: string } }> = [
    {
      text: `Transcribe on-image overlay text from ${imageUrls.length} TikTok carousel slides in order. Return ONLY JSON array: [{"slideNumber":1,"hookOrHeading":"...","body":"..."}].`,
    },
  ];

  for (const url of imageUrls.slice(0, 10)) {
    const b64 = await fetchImageBase64(url);
    if (b64) {
      parts.push({
        inlineData: { mimeType: "image/jpeg", data: b64 },
      });
    }
  }

  if (parts.length < 2) return null;

  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: {
        parts: [
          {
            text: "You are an OCR and TikTok script transcriber. Extract exact overlay text per slide. Return JSON array only.",
          },
        ],
      },
      contents: [{ role: "user", parts }],
      generationConfig: {
        temperature: 0.1,
        maxOutputTokens: 2500,
        responseMimeType: "application/json",
      },
    }),
    signal: AbortSignal.timeout(50_000),
  });

  if (!res.ok) {
    logger.warn("sync", "Gemini vision OCR failed", {
      status: res.status,
      body: (await res.text()).slice(0, 400),
    });
    return null;
  }

  const data = (await res.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  };
  const text =
    data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
  return parseSlideJson(text);
}

/** OCR on-image text from carousel slide URLs using vision AI. */
export async function transcribeCarouselSlides(
  imageUrls: string[],
): Promise<CarouselSlideText[]> {
  const urls = uniqImages(imageUrls, 10);
  if (!urls.length) return [];

  const openai = await visionViaOpenAI(urls);
  if (openai?.length) {
    logger.info("sync", "OCR via OpenAI", { slides: openai.length });
    return openai;
  }

  const gemini = await visionViaGemini(urls);
  if (gemini?.length) {
    logger.info("sync", "OCR via Gemini", { slides: gemini.length });
    return gemini;
  }

  logger.warn("sync", "Vision OCR unavailable — configure OPENAI_API_KEY or GEMINI_API_KEY");
  return urls.map((_, i) => ({
    slideNumber: i + 1,
    hookOrHeading: i === 0 ? "Slide 1 (OCR unavailable — edit after save)" : `Slide ${i + 1} (edit after save)`,
    body: "",
  }));
}

export function slideTextToString(slide: CarouselSlideText): string {
  const heading = slide.hookOrHeading.trim();
  const body = slide.body.trim();
  if (heading && body) return `${heading}\n${body}`;
  return heading || body;
}

export function buildReferenceTitle(
  authorHandle: string,
  title: string,
  firstSlide?: CarouselSlideText,
): string {
  const hook =
    firstSlide?.hookOrHeading?.trim() ||
    title.split(/[|\n#]/)[0]?.trim().slice(0, 60) ||
    "TikTok reference";
  const handle = authorHandle || "";
  if (handle && hook) return `${handle} — ${hook}`.slice(0, 120);
  return (handle || hook || "TikTok reference").slice(0, 120);
}
