import "server-only";

import { prisma } from "@/lib/db";
import { completeLogged } from "@/lib/ai/logged";
import { isDurableMediaUrl } from "@/services/persist-durable-cover";
import {
  extractCarouselFormat,
  formatPrompt,
  isLifestylePack,
} from "@/lib/generator/format-prompt";
import { matchImagePackFromTranscript } from "@/lib/image-pack-match";
import {
  formatPackDisplayName,
  resolveImagePackForAgent,
} from "@/services/agent-pack-selection";

export type AgentVisualSlide = {
  index: number;
  text: string;
  backgroundUrl: string;
};

export type AgentDraftCard = {
  id: string;
  title: string;
  hook: string;
  hookText: string;
  previewUrl: string;
  coverUrl: string;
  variantTag?: string;
  slides?: string[];
  visualSlides?: AgentVisualSlide[];
  captionBoxId?: string;
  textStyleId?: string;
};

export type AgentTurnResult = {
  reply: string;
  draftIds: string[];
  drafts: AgentDraftCard[];
  toolsUsed: string[];
  statusHint?: string;
};

function normalizeUsername(raw: string) {
  return raw.replace(/^@/, "").trim().toLowerCase();
}

function parseSlides(slidesJson: string | null | undefined): string[] {
  try {
    const v = JSON.parse(slidesJson || "[]");
    return Array.isArray(v) ? v.map(String) : [];
  } catch {
    return [];
  }
}

/** Fetch synced posts / durable slide templates for a connected account. */
export async function getAccountTemplates(opts: {
  projectId: string;
  username: string;
}) {
  const username = normalizeUsername(opts.username);
  const all = await prisma.connectedAccount.findMany({
    where: { projectId: opts.projectId },
  });
  const resolved =
    all.find((a) => normalizeUsername(a.username) === username) || null;

  if (!resolved) {
    return {
      account: null as null,
      templates: [] as Array<{
        id: string;
        externalId: string | null;
        hook: string;
        coverUrl: string;
        slides: string[];
        views: number;
      }>,
    };
  }

  const posts = await prisma.post.findMany({
    where: {
      projectId: opts.projectId,
      accountId: resolved.id,
      status: "published",
    },
    orderBy: [{ views: "desc" }, { publishedAt: "desc" }],
    take: 24,
  });

  const templates = posts.map((p) => {
    const slides = parseSlides(p.slidesJson);
    const cover =
      (isDurableMediaUrl(p.coverUrl) ? p.coverUrl : "") ||
      slides.find((s) => isDurableMediaUrl(s)) ||
      p.coverUrl ||
      "";
    return {
      id: p.id,
      externalId: p.externalId,
      hook: p.hook,
      coverUrl: cover,
      slides: slides.length ? slides : cover ? [cover] : [p.hook],
      views: p.views,
    };
  });

  return {
    account: {
      id: resolved.id,
      username: resolved.username,
      nickname: resolved.nickname,
    },
    templates,
  };
}


/** Pull a real topic — never the raw voice command string. */
function extractTopic(transcript: string, fallback: string): string {
  const about = transcript.match(
    /(?:about|on|topic|for)\s+["']?(.+?)["']?(?:\.|$)/i,
  );
  if (about?.[1] && about[1].trim().length > 4) {
    return about[1].trim().slice(0, 120);
  }
  const cleaned = transcript
    .replace(/@[\w.]+/g, " ")
    .replace(
      /\b(hello|generate|generates|create|make|give me|pull|take|from|variants?|slideshows?|slides?|carousels?|image\s*packs?|image\s*bag|pack|with|the|a|an|five|ten|\d+|tiktok|please|and|then|using)\b/gi,
      " ",
    )
    .replace(/\b(Philosopher|Girl-Aesthetic|Insight|Zeno|Storytelling|Informational)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (cleaned.length >= 8 && cleaned.length <= 100 && !/bag|variant/i.test(cleaned)) {
    return cleaned;
  }
  return (fallback || "a quiet nightly habit that cleared my mind").slice(0, 120);
}

function fallbackSlideCopy(
  topic: string,
  product: string,
  n: number,
  format: "storytelling" | "informational" = "informational",
): string[] {
  const informational = [
    topic,
    "Name the overload — write the 3 tasks that feel heaviest before you open any app.",
    "Timebox the spiral — 60-second voice note, then delete it.",
    "Protect sleep — lights down 45 minutes before bed, same window every night.",
    `That's the protocol — I log it in ${product} every night.`,
    "One input before noon — pick the single task that would make the day a win.",
    "Park the loop — write the worry on paper, close the notebook, walk 8 minutes.",
    "Cap the scroll — 12-minute timer, then phone in another room.",
    "Same shutdown hour — no new tabs after that clock hits.",
    "Review one line from yesterday before you start today.",
  ];
  const storytelling = [
    topic,
    "I didn't need more motivation — I needed a smaller start.",
    "Three lines at night. One priority in the morning.",
    "The fog cleared once I tracked the streak.",
    `That's why I built ${product}.`,
    "Keep the streak visible — what gets counted gets kept.",
    "Smaller inputs. Calmer evenings. Clearer mornings.",
    "The protocol is boring. That's why it works.",
    "Protect the first hour. Everything else can wait.",
    "Quiet confidence is a practice, not a mood.",
  ];
  const base = format === "storytelling" ? storytelling : informational;
  while (base.length < n) {
    base.push(
      `${base.length}. One concrete step — do it for 7 days and keep the log.`,
    );
  }
  return base.slice(0, n);
}

function cleanAgentSlideText(text: unknown): string {
  const raw = String(text ?? "")
    .replace(/https?:\/\/\S+/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim();
  if (/^s\d+$/i.test(raw) || /^slide\s*\d+$/i.test(raw)) return "";
  return raw;
}

/** Clone template assets into draft carousel(s) in the Generator queue. */
export async function generateSlideVariants(opts: {
  projectId: string;
  /** Optional — when omitted, generates from topic + image pack alone */
  templatePostId?: string | null;
  count: number;
  slidesPerCarousel?: number;
  topic?: string;
  imagePackSlug?: string;
  /** Raw voice transcript — never written into slide captions */
  transcript?: string;
}) {
  const count = Math.max(1, Math.min(opts.count || 1, 20));
  const slidesPer = Math.max(3, Math.min(opts.slidesPerCarousel || 5, 10));
  const template = opts.templatePostId
    ? await prisma.post.findFirst({
        where: { id: opts.templatePostId, projectId: opts.projectId },
      })
    : null;
  if (opts.templatePostId && !template) {
    throw new Error("Template post not found");
  }

  const project = await prisma.project.findUnique({
    where: { id: opts.projectId },
    select: { name: true, description: true },
  });

  const { ensureImagePacks, serializePack, assignPackImages } = await import(
    "@/services/image-packs"
  );
  const packs = await ensureImagePacks(opts.projectId);
  const packList = packs.map((p) => ({
    slug: p.slug,
    name: p.name,
    description: p.description,
  }));
  const resolvedMatch =
    (opts.imagePackSlug
      ? packList.find((p) => p.slug === opts.imagePackSlug)
      : undefined) ||
    (opts.transcript
      ? matchImagePackFromTranscript(opts.transcript, packList)
      : undefined);
  const resolvedSlug = resolvedMatch?.slug ?? opts.imagePackSlug;

  const packRaw =
    (resolvedSlug ? packs.find((p) => p.slug === resolvedSlug) : null) ||
    packs.find((p) => p.isDefault) ||
    packs[0];
  const pack = packRaw ? serializePack(packRaw) : null;
  const packUrls = (pack?.assets || [])
    .filter((a) => a.includedInSequence !== false)
    .map((a) => a.url)
    .filter((u) => u && !/tiktokcdn|p16-sign/i.test(u));

  const topic = extractTopic(
    opts.topic || opts.transcript || "",
    template?.hook || "a small habit that changed everything",
  );
  const carouselFormat = extractCarouselFormat(
    `${opts.transcript || ""} ${opts.topic || ""}`,
  );
  const lifestyle = isLifestylePack(pack);
  const productName = project?.name || "this";

  let formatFewShot = "";
  try {
    const { listFormatReferences, formatRefPromptBlock } = await import(
      "@/services/format-references"
    );
    const refs = await listFormatReferences(opts.projectId, carouselFormat);
    formatFewShot = formatRefPromptBlock(refs);
  } catch {
    /* table may not exist yet */
  }

  type CarouselGen = {
    hook?: string;
    slides?: string[];
    caption?: string;
  };
  let generated: CarouselGen[] = [];

  try {
    const ai = await completeLogged(
      {
        messages: [
          {
            role: "system",
            content: `You write TikTok carousel scripts for ${productName}.
Return ONE JSON object only. First character must be {. No markdown, no <think>, no URLs, no image filenames in slide text.
Images are assigned separately — never put image links in hook/slides/caption.
Never echo the user's spoken command — write fresh hooks and slide copy about the TOPIC.

Image pack (fixed — do not change): ${pack?.name || "auto"} (${pack?.slug || "auto"}).
If the user mentioned "Insight" / "Insight philosophy", this is the Insight brand pack — not generic philosopher/statue imagery.
${formatPrompt(carouselFormat, lifestyle, slidesPer)}
${formatFewShot ? `\n${formatFewShot}` : ""}`,
          },
          {
            role: "user",
            content: `Topic: ${topic}
App: ${productName} — ${(project?.description || "").slice(0, 160)}
Format: ${carouselFormat}${lifestyle ? " · lifestyle/girly tone ON" : ""}
Pack mood: ${pack?.name || "auto"} — ${(pack?.description || "").slice(0, 100)}
${template?.hook ? `Inspired by viral hook (structure only, rewrite): ${template.hook}` : "Write original hooks — no template post was provided."}

Generate exactly ${count} distinct ${slidesPer}-slide carousel variant(s) testing different hook angles on the same topic.
Each slides[] entry MUST be real readable copy (never placeholders like s1/s2).
The FINAL slide must be a soft product CTA (lowercase, low-pressure), e.g. "i log my thoughts here — i use ${productName.toLowerCase()}" or "check in with yourself daily (i use ${productName.toLowerCase()})". Never hard-sell.
${lifestyle ? `Tone reminder: lowercase, first-person, chaotic-helpful. Ban: over-indexing, cognitive debt, sensory fasting, optimizing, framework, mechanisms.` : ""}
JSON schema example:
{"carousels":[{"hook":"${lifestyle ? "things i do when every small task feels like a mountain" : "I accidentally changed my life with one habit"}","slides":[${lifestyle ? `"things i do when every small task feels like a mountain","1. ice cube in the palm — hold it when your brain is spiraling until it melts","2. voice note the spiral — 60 seconds then delete","3. three lines before bed about what felt heavy","i check in here every night — i use ${productName.toLowerCase()}"` : `"I accidentally changed my life with one habit","I started writing three lines every night","The fog lifted within a week","I track the streak so it sticks","i log my thoughts here — i use ${productName.toLowerCase()}"`}],"caption":"One habit. Full quiet. #journal #mindfulness"}]}
Each carousels[].slides array must have exactly ${slidesPer} entries.`,
          },
        ],
        temperature: 0.8,
        maxTokens: Math.min(8192, 1800 + count * 1400),
        json: true,
      },
      { action: "agent_slide_variants", projectId: opts.projectId },
    );
    const raw = ai.content.trim().replace(/^```json\s*|\s*```$/g, "");
    const parsed = JSON.parse(raw) as { carousels?: CarouselGen[] };
    if (Array.isArray(parsed.carousels)) {
      generated = parsed.carousels.slice(0, count);
    }
  } catch {
    /* fall through */
  }

  while (generated.length < count) {
    const n = generated.length + 1;
    generated.push({
      hook: `${topic} — angle ${n}`,
      slides: fallbackSlideCopy(topic, productName, slidesPer, carouselFormat),
      caption: `${topic} #journal #mindfulness`,
    });
  }

  const drafts: AgentDraftCard[] = [];
  for (const c of generated) {
    const hook = cleanAgentSlideText(c.hook) || topic;
    let slideTexts = (c.slides?.length ? c.slides : [hook])
      .map(cleanAgentSlideText)
      .filter(Boolean)
      .slice(0, slidesPer);
    while (slideTexts.length < slidesPer) {
      slideTexts.push(slideTexts[slideTexts.length - 1] || hook);
    }
    // Never persist raw voice command
    if (
      opts.transcript &&
      slideTexts.some(
        (s) =>
          s.length > 40 &&
          opts.transcript!.toLowerCase().includes(s.toLowerCase().slice(0, 30)),
      )
    ) {
      slideTexts = fallbackSlideCopy(hook, productName, slidesPer, carouselFormat);
    }

    const assigned = pack
      ? assignPackImages(
          {
            orderMode: pack.orderMode,
            name: pack.name,
            slug: pack.slug,
            description: pack.description,
            assets: pack.assets,
          },
          slideTexts.length,
          [],
          undefined,
        )
      : [];

    const visualSlides = slideTexts.map((text, i) => {
      const a = assigned[i];
      const url =
        (a?.url && !/tiktokcdn|p16-sign/i.test(a.url) ? a.url : "") ||
        packUrls[i % Math.max(packUrls.length, 1)] ||
        "";
      return {
        index: i + 1,
        text,
        backgroundUrl: url,
        backgroundImageUrl: url,
        backgroundLabel: a?.label || "",
        role: a?.kind || "background",
      };
    });
    const cover = visualSlides[0]?.backgroundImageUrl || "";
    const caption = cleanAgentSlideText(c.caption) ||
      `${hook} #journal #mindfulness #selfimprovement`.slice(0, 180);

    const post = await prisma.post.create({
      data: {
        projectId: opts.projectId,
        accountId: template?.accountId ?? null,
        hook: hook.slice(0, 200),
        caption,
        slidesJson: JSON.stringify(slideTexts),
        status: "draft",
        theme: "agent-variant",
        coverUrl: cover,
        metaJson: JSON.stringify({
          visualSlides,
          imagePackSlug: pack?.slug,
          source: "voice-agent",
          postType: "CAROUSEL",
          slideCount: slidesPer,
          carouselFormat,
          captionBoxId: "highlight",
          textStyleId: "tiktok-sans",
        }),
        views: 0,
        likes: 0,
        comments: 0,
        saves: 0,
        shares: 0,
        downloads: 0,
        ctr: 0,
      },
    });
    drafts.push({
      id: post.id,
      title: hook.slice(0, 80),
      hook: post.hook,
      hookText: post.hook,
      previewUrl: cover,
      coverUrl: cover,
      variantTag:
        count === 1
          ? `${slidesPer}-slide carousel`
          : `Variant ${drafts.length + 1}`,
      slides: slideTexts,
      visualSlides: visualSlides.map((s) => ({
        index: s.index,
        text: s.text,
        backgroundUrl: s.backgroundUrl || s.backgroundImageUrl || "",
      })),
      captionBoxId: "highlight",
      textStyleId: "tiktok-sans",
    });
  }

  return drafts;
}

/** Generate variants then stagger-schedule across accounts. */
export async function createAndScheduleCampaign(opts: {
  projectId: string;
  templatePostId: string;
  variantCount: number;
  slidesPerCarousel?: number;
  targetAccountIds: string[];
  startDate?: Date;
  staggerHours?: number;
  topic?: string;
  imagePackSlug?: string;
  transcript?: string;
  uploadAsDraft?: boolean;
}) {
  const drafts = await generateSlideVariants({
    projectId: opts.projectId,
    templatePostId: opts.templatePostId,
    count: opts.variantCount,
    slidesPerCarousel: opts.slidesPerCarousel,
    topic: opts.topic,
    imagePackSlug: opts.imagePackSlug,
    transcript: opts.transcript,
  });

  const { scheduleStaggerBatch } = await import("@/services/scheduler");
  const startAt =
    opts.startDate || new Date(Date.now() + 2 * 60 * 60 * 1000);
  const scheduled = await scheduleStaggerBatch({
    projectId: opts.projectId,
    postIds: drafts.map((d) => d.id),
    accountIds: opts.targetAccountIds,
    startAt,
    intervalHours: opts.staggerHours ?? 4,
    randomJitterMinutes: 25,
    uploadAsDraft: opts.uploadAsDraft !== false,
    distributeEvenly: true,
    source: "voice-campaign",
  });

  return { drafts, scheduled };
}

function extractUsername(transcript: string): string | null {
  const at = transcript.match(/@([a-zA-Z0-9._]+)/);
  if (at) return at[1];
  const named = transcript.match(
    /\b(?:from|account|template(?:s)?\s+(?:from|of)?)\s+(?:my\s+)?([a-zA-Z0-9._]{2,30})\s+account\b/i,
  );
  if (named) return named[1];
  const audrey = transcript.match(/\baudrey\b/i);
  if (audrey) return "audreysynced";
  return null;
}

function extractCount(transcript: string): number {
  const m = transcript.match(/\b(\d{1,2})\b/);
  if (m) return Math.min(20, Math.max(1, Number(m[1])));
  if (/ten|10\b/i.test(transcript)) return 10;
  return 5;
}

function extractSlideCount(transcript: string): number {
  const m = transcript.match(/\b(\d{1,2})\s*[- ]?slides?\b/i);
  if (m) return Math.min(10, Math.max(3, Number(m[1])));
  if (/\bfive\s+slides?\b/i.test(transcript)) return 5;
  if (/\bthree\s+slides?\b/i.test(transcript)) return 3;
  if (/\bseven\s+slides?\b/i.test(transcript)) return 7;
  return 5;
}

function wantsMultipleVariants(transcript: string): boolean {
  return /\bvariants?\b|\bangles?\b|\bversions?\b/i.test(transcript);
}

function extractDays(transcript: string): number {
  const m = transcript.match(/\b(\d+)\s*days?\b/i);
  if (m) return Math.min(14, Math.max(1, Number(m[1])));
  if (/week/i.test(transcript)) return 7;
  return 3;
}

/**
 * Voice / text agent turn: image-pack slideshows, optional template variants, scheduling.
 */
export async function runAgentTurn(opts: {
  projectId: string;
  transcript: string;
  slideCount?: number;
  imagePackSlug?: string;
}): Promise<AgentTurnResult> {
  const transcript = opts.transcript.trim();
  if (!transcript) {
    return {
      reply: "I didn't catch that — try again or type a command.",
      draftIds: [],
      drafts: [],
      toolsUsed: [],
    };
  }

  const toolsUsed: string[] = [];
  const wantsSchedule = /schedule|queue|stagger|across.*(account|day)/i.test(
    transcript,
  );
  const wantsVariants =
    /variant|slideshow|slide|carousel|template|create|generate|clone|image pack|campaign|make|build/i.test(
      transcript,
    );

  if (!wantsVariants && !wantsSchedule) {
    return {
      reply:
        'Try: “Create a 5-slide slideshow with the Insight Philosophy image pack” or “Generate 3 carousel variants about morning routines.”',
      draftIds: [],
      drafts: [],
      toolsUsed: [],
    };
  }

  // Resolve image pack first — this is the primary input for slideshow creation.
  const { ensureImagePacks } = await import("@/services/image-packs");
  const packs = await ensureImagePacks(opts.projectId);
  const packList = packs.map((p) => ({
    slug: p.slug,
    name: p.name,
    description: p.description,
  }));
  const imagePackMatch = await resolveImagePackForAgent({
    transcript,
    packs: packList,
    explicitSlug: opts.imagePackSlug,
    projectId: opts.projectId,
  });
  const imagePackSlug = imagePackMatch?.slug;
  const imagePackLabel = imagePackMatch
    ? formatPackDisplayName(imagePackMatch.name)
    : undefined;

  if (!imagePackMatch && packs.length === 0) {
    return {
      reply:
        "Add an image pack in Generator & Assets first, then ask me to create a slideshow.",
      draftIds: [],
      drafts: [],
      toolsUsed,
    };
  }

  let username = extractUsername(transcript);
  const templateIdMatch = transcript.match(/template\s+([a-z0-9]{20,36})\b/i);
  const explicitTemplateId = templateIdMatch?.[1];
  const mentionsAccount = Boolean(username) || /@\w+|from my (latest|tiktok|post)/i.test(transcript);

  if (!username && mentionsAccount) {
    const accounts = await prisma.connectedAccount.findMany({
      where: { projectId: opts.projectId },
      take: 5,
    });
    username = accounts[0] ? normalizeUsername(accounts[0].username) : null;
  }

  let template: {
    id: string;
    hook: string;
    coverUrl: string;
  } | null = null;
  let accountLabel = username || "image pack";

  if (explicitTemplateId) {
    const post = await prisma.post.findFirst({
      where: { id: explicitTemplateId, projectId: opts.projectId },
    });
    if (post) {
      template = {
        id: post.id,
        hook: post.hook,
        coverUrl: post.coverUrl,
      };
    }
  }

  // Only pull TikTok templates when the user asked for them (or for scheduling).
  if (!template && (mentionsAccount || wantsSchedule) && username) {
    toolsUsed.push("getAccountTemplates");
    const { account, templates } = await getAccountTemplates({
      projectId: opts.projectId,
      username,
    });
    if (account && templates.length > 0) {
      accountLabel = normalizeUsername(account.username);
      const picked =
        templates.find((t) => t.coverUrl && isDurableMediaUrl(t.coverUrl)) ||
        templates[0]!;
      template = picked;
    } else if (wantsSchedule) {
      return {
        reply: `I couldn't find synced posts for @${username} to schedule from. Sync that account, or ask me to create a slideshow from an image pack first.`,
        draftIds: [],
        drafts: [],
        toolsUsed,
      };
    }
    // For plain create/generate: continue without templates — image pack is enough.
  }

  const count = wantsMultipleVariants(transcript)
    ? extractCount(transcript)
    : 1;
  const slidesPer = Math.max(
    3,
    Math.min(opts.slideCount || extractSlideCount(transcript), 10),
  );
  const topic = extractTopic(
    transcript,
    template?.hook || "a small habit that changed everything",
  );

  if (wantsSchedule) {
    const allAccounts = await prisma.connectedAccount.findMany({
      where: { projectId: opts.projectId, status: "active" },
    });
    const targetIds = allAccounts.map((a) => a.id);
    if (!targetIds.length) {
      return {
        reply:
          "Connect a TikTok account to schedule posts. I can still create slideshow drafts from your image pack without one.",
        draftIds: [],
        drafts: [],
        toolsUsed,
      };
    }

    if (!template) {
      // Create drafts from pack, then the user can schedule — or create without template id path
      toolsUsed.push("generateSlideVariants");
      const drafts = await generateSlideVariants({
        projectId: opts.projectId,
        templatePostId: null,
        count,
        slidesPerCarousel: slidesPer,
        topic,
        imagePackSlug,
        transcript,
      });
      return {
        reply: `Created ${drafts.length} drafts with the ${imagePackLabel || "default"} pack. Connect/sync TikTok to auto-schedule, or open Queue to schedule manually.`,
        draftIds: drafts.map((d) => d.id),
        drafts,
        toolsUsed,
      };
    }

    const days = extractDays(transcript);
    const staggerHours = Math.max(
      2,
      Math.round((days * 24) / Math.max(count, 1)),
    );

    toolsUsed.push("createAndScheduleCampaign");
    const result = await createAndScheduleCampaign({
      projectId: opts.projectId,
      templatePostId: template.id,
      variantCount: count,
      slidesPerCarousel: slidesPer,
      targetAccountIds: targetIds,
      staggerHours,
      topic,
      imagePackSlug,
      transcript,
      uploadAsDraft: true,
    });

    return {
      reply: `Created ${result.drafts.length} variants from @${accountLabel} and scheduled ${result.scheduled.count} TikTok draft uploads across ${targetIds.length} accounts over ~${days} days.`,
      draftIds: result.drafts.map((d) => d.id),
      drafts: result.drafts,
      toolsUsed,
      statusHint: `Scheduled ${result.scheduled.count} drafts`,
    };
  }

  toolsUsed.push("generateSlideVariants");
  const drafts = await generateSlideVariants({
    projectId: opts.projectId,
    templatePostId: template?.id ?? null,
    count,
    slidesPerCarousel: slidesPer,
    topic,
    imagePackSlug,
    transcript,
  });

  const reply =
    count === 1
      ? `Created 1 carousel with ${slidesPer} slides using the ${imagePackLabel || "default"} pack — tap the card below to edit in Generator.`
      : `Created ${drafts.length} slideshow drafts with the ${imagePackLabel || "default"} pack — open any card below to edit in Generator.`;

  return {
    reply,
    draftIds: drafts.map((d) => d.id),
    drafts,
    toolsUsed,
  };
}
