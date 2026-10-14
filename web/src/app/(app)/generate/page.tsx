"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  BookOpen,
  CalendarClock,
  ClipboardList,
  LayoutTemplate,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Copy,
  Download,
  LayoutList,
  Loader2,
  Minus,
  MoreHorizontal,
  Plus,
  RefreshCw,
  SlidersHorizontal,
  Sparkles,
  Star,
  Trash2,
  TrendingUp,
  Wand2,
} from "lucide-react";
import { FadeIn } from "@/components/fade-in";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Collapsible } from "@/components/ui/collapsible";
import {
  GlassPopover,
  GlassSelect,
  GLASS_TRIGGER,
  glassItemClass,
} from "@/components/ui/glass-select";
import { LoadingBlock, ErrorBlock } from "@/components/empty-state";
import { PostCard, type PostCardData } from "@/components/post-card";
import { PostDrawer } from "@/components/post-drawer";
import { ScheduleModal } from "@/components/schedule-modal";
import { ThinkingStatus, GENERATOR_THINKING_STAGES } from "@/components/thinking-status";
import { useProject } from "@/lib/project-context";
import { apiFetch } from "@/lib/api-client";
import { cn, formatNumber } from "@/lib/utils";
import {
  exportCarouselBatchZip,
  exportCarouselZip,
  type DimLevel,
} from "@/lib/carousel-export";
import {
  CAPTION_BOX_STYLES,
  wrapCaptionLines,
  TIKTOK_SAFE,
  type TextPosition,
} from "@/lib/caption-box";
import {
  clampPositionY,
  positionYFromPreset,
  resolveCaptionPaint,
  PRODUCT_POSITION_Y,
} from "@/lib/caption-accents";
import {
  parseScriptBatch,
  summarizeParsedScripts,
} from "@/lib/parse-scripts";
import {
  composeSlideText,
  resolveSlideCopy,
  slideFontScale,
  splitSlideCopy,
} from "@/lib/generator/parse-pasted-scripts";
import {
  clampBoxWidth,
  clampFontSizeScale,
  LAYOUT_DEFAULTS,
  resolveSlideCustomization,
  type SlideCustomization,
} from "@/lib/generator/types";
import { TEXT_STYLES, getTextStyle } from "@/lib/text-styles";
import { softProductCta, isProductSlideHint } from "@/lib/soft-cta";
import { TikTokPublishModal } from "@/components/tiktok-publish-modal";
import { ImportTikTokReferenceModal } from "@/components/import-tiktok-reference-modal";
import { MediaImg } from "@/components/media-img";
import { useWorkspaceCache } from "@/lib/workspace-cache";

type OpportunityWhy = { label: string; detail: string };

type Opportunity = {
  title: string;
  confidence: number;
  confidenceLabel: string;
  expectedViewsMin: number;
  expectedViewsMax: number;
  similarPostCount: number;
  reason: string;
  intent: string;
  suggestedFlow: string;
  angle: string;
  why: OpportunityWhy[];
};

type VisualSlide = {
  index: number;
  text: string;
  heading?: string;
  body?: string;
  backgroundUrl?: string;
  shareUrl?: string;
  backgroundLabel?: string;
  backgroundAssetId?: string;
  backgroundKind?: string;
  overlay?: string;
  textPosition?: string;
  /** Vertical position as % of frame height (legacy; prefer customization.positionY) */
  positionY?: number;
  customization?: SlideCustomization;
  suppressText?: boolean;
  isProduct?: boolean;
};

type RecentDraft = {
  id: string;
  hook: string;
  caption: string;
  coverUrl?: string;
  status: string;
  createdAt: string;
  slides: string[];
  meta?: {
    visualSlides?: VisualSlide[];
    narrative?: string;
    textStyleId?: string;
    captionBoxId?: string;
    dimLevel?: DimLevel;
    fromScripts?: boolean;
  };
};

type Score = {
  score: number;
  hook: number;
  retention: number;
  saves: number;
  downloads: number;
};

type Carousel = {
  hook: string;
  title?: string;
  slides: string[];
  visualSlides?: VisualSlide[];
  caption: string;
  hashtags?: string[];
  score?: Score;
  templateName?: string;
  narrative?: string;
  /** True when built from Paste your scripts — never AI-rewritten */
  fromScripts?: boolean;
};

type ImagePack = {
  id: string;
  name: string;
  slug: string;
  description: string;
  orderMode: "sequential" | "random" | "ai" | string;
  imageCount: number;
  emoji?: string;
  assets: {
    id: string;
    label: string;
    url?: string;
    path?: string;
    includedInSequence?: boolean;
  }[];
};

type Account = { id: string; username: string; nickname?: string; oauthConnected?: boolean };
type ContentFlow = {
  slug: string;
  name: string;
  slideCount: number;
  avgEngagement: number;
  sampleSize: number;
};

type CachedOps = {
  opportunities: Opportunity[];
  generatedAt: string;
  inspiredBy: PostCardData[];
  bestFlow?: { slug: string; reason: string } | null;
};

function cacheKey(projectId: string) {
  return `zeno-opportunities:${projectId}`;
}

function isUsableCoverUrl(url?: string | null): url is string {
  return Boolean(url && (url.startsWith("http") || url.startsWith("/")));
}

function Stars({ n }: { n: number }) {
  return (
    <span className="inline-flex gap-0.5 text-amber-400">
      {Array.from({ length: 5 }, (_, i) => (
        <Star key={i} className={cn("h-3 w-3", i < n ? "fill-current" : "opacity-25")} />
      ))}
    </span>
  );
}

type EntryPath = "suggest" | "manual" | "scripts";

function GeneratorPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { project, projectId, loading: projectLoading } = useProject();
  const {
    drafts: cachedDrafts,
    packs: cachedPacks,
    prependDraft,
    removeDraft,
    refresh,
  } = useWorkspaceCache(projectId);
  const [entry, setEntry] = useState<EntryPath>("manual");
  const [scriptPaste, setScriptPaste] = useState("");
  const [activeCarouselIdx, setActiveCarouselIdx] = useState(0);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [accountId, setAccountId] = useState("");
  const [flows, setFlows] = useState<ContentFlow[]>([]);
  const [flowSlug, setFlowSlug] = useState("");
  const [imagePacks, setImagePacks] = useState<ImagePack[]>([]);
  const [imagePackSlug, setImagePackSlug] = useState("none");
  const [textStyleId, setTextStyleId] = useState("tiktok-sans");
  const [captionBoxId, setCaptionBoxId] = useState("highlight");
  const [dimLevel, setDimLevel] = useState<DimLevel>("none");
  const [defaultTextPosition, setDefaultTextPosition] =
    useState<TextPosition>("center");
  const [publishOpen, setPublishOpen] = useState(false);
  const [topic, setTopic] = useState("");
  const [writingLength, setWritingLength] = useState("Medium");
  const [carouselFormat, setCarouselFormat] = useState<"storytelling" | "informational">("informational");
  const [variantCount, setVariantCount] = useState<1 | 3 | 5>(1);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [generatedAt, setGeneratedAt] = useState<string | null>(null);
  const [expandedWhy, setExpandedWhy] = useState<string | null>(null);
  const [thinkingSteps, setThinkingSteps] = useState<string[]>([]);
  const [thinkingIdx, setThinkingIdx] = useState(0);
  const [inspiredBy, setInspiredBy] = useState<PostCardData[]>([]);
  const [changeRefs, setChangeRefs] = useState(false);
  const [refsLocked, setRefsLocked] = useState(true);
  const [allPosts, setAllPosts] = useState<PostCardData[]>([]);
  const [selectedRefs, setSelectedRefs] = useState<string[]>([]);
  const [drawerPost, setDrawerPost] = useState<PostCardData | null>(null);
  const [busy, setBusy] = useState(false);
  const [generatingId, setGeneratingId] = useState<string | null>(null);
  const [suggestBusy, setSuggestBusy] = useState(false);
  const [topicSuggestBusy, setTopicSuggestBusy] = useState(false);
  const [topicChips, setTopicChips] = useState<
    { title: string; flow?: string }[]
  >([]);
  const [cloneModalOpen, setCloneModalOpen] = useState(false);
  const [exportBusy, setExportBusy] = useState(false);
  const [exportMsg, setExportMsg] = useState("");
  const [carousels, setCarousels] = useState<Carousel[]>([]);
  const [previewSlide, setPreviewSlide] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [flowReason, setFlowReason] = useState("");
  const [assetLog, setAssetLog] = useState<string[]>([]);
  const [copied, setCopied] = useState<string | null>(null);
  const [publishMenuOpen, setPublishMenuOpen] = useState(false);
  const [opportunityReason, setOpportunityReason] = useState("");
  const [intent, setIntent] = useState("Educational Carousel");
  const [recentDrafts, setRecentDrafts] = useState<RecentDraft[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [formatReferenceId, setFormatReferenceId] = useState("");
  const [formatRefs, setFormatRefs] = useState<
    {
      id: string;
      title: string;
      format: string;
      hook: string;
      slides?: string[];
      coverUrl?: string;
    }[]
  >([]);
  const [archetypeOpen, setArchetypeOpen] = useState(false);
  const archetypeTriggerRef = useRef<HTMLButtonElement>(null);
  const publishMenuRef = useRef<HTMLButtonElement>(null);

  const load = useCallback(async () => {
    if (!projectId) return;
    const [accRes, postRes, flowRes, packRes, formatRes] = await Promise.all([
      apiFetch<{ accounts: Account[] }>(`/api/accounts?projectId=${projectId}`),
      apiFetch<{ posts: PostCardData[] }>(
        `/api/posts?projectId=${projectId}&status=published`,
      ),
      apiFetch<{ flows: ContentFlow[] }>(`/api/flows?projectId=${projectId}`),
      apiFetch<{ packs: ImagePack[] }>(`/api/image-packs?projectId=${projectId}`),
      apiFetch<{
        references: {
          id: string;
          title: string;
          format: string;
          hook: string;
          slides?: string[];
          coverUrl?: string;
        }[];
      }>(`/api/format-references?projectId=${projectId}`),
    ]);
    if (accRes.ok) {
      setAccounts(accRes.data.accounts);
      setAccountId(accRes.data.accounts[0]?.id ?? "");
    }
    if (postRes.ok) {
      const sorted = [...postRes.data.posts].sort(
        (a, b) => (b.views ?? 0) - (a.views ?? 0),
      );
      setAllPosts(sorted);
    }
    if (flowRes.ok) {
      setFlows(flowRes.data.flows);
      if (flowRes.data.flows[0]) setFlowSlug(flowRes.data.flows[0].slug);
    }
    // Prefer workspace-cached packs when available; otherwise use fresh fetch
    if (packRes.ok && packRes.data.packs?.length) {
      setImagePacks(packRes.data.packs);
    } else if (cachedPacks.length > 0) {
      setImagePacks(cachedPacks as ImagePack[]);
    }
    if (formatRes.ok) {
      setFormatRefs(formatRes.data.references || []);
    }

    // Restore cached opportunities — no AI call
    try {
      const raw = localStorage.getItem(cacheKey(projectId));
      if (raw) {
        const cached = JSON.parse(raw) as CachedOps;
        setOpportunities(cached.opportunities || []);
        setGeneratedAt(cached.generatedAt || null);
        if (cached.bestFlow?.slug) {
          setFlowSlug(cached.bestFlow.slug);
        }
      }
    } catch {
      /* ignore */
    }
  }, [projectId]);

  useEffect(() => {
    void load();
  }, [load]);

  // Sync recent drafts strip from workspace cache
  useEffect(() => {
    setRecentDrafts(
      cachedDrafts.slice(0, 12).map((d) => ({
        id: d.id,
        hook: d.hook,
        caption: "",
        coverUrl: d.coverUrl,
        status: d.status,
        createdAt: d.createdAt || "",
        slides: [],
        meta: d.meta as RecentDraft["meta"],
      })),
    );
  }, [cachedDrafts]);

  // Prefer cached image packs when available
  useEffect(() => {
    if (!cachedPacks.length) return;
    setImagePacks(cachedPacks as ImagePack[]);
  }, [cachedPacks]);

  const setPath = useCallback(
    (path: EntryPath, opts?: { history?: boolean; replace?: boolean }) => {
      setEntry(path);
      const params = new URLSearchParams();
      params.set("path", path);
      if (opts?.history || historyOpen) params.set("history", "1");
      const qs = params.toString();
      const url = `/generate?${qs}`;
      if (opts?.replace) router.replace(url);
      else router.push(url);
    },
    [router, historyOpen],
  );

  // Sync entry/history from URL so Chrome back returns to Generator home
  useEffect(() => {
    const path = searchParams.get("path");
    const hist = searchParams.get("history") === "1";
    const draftId =
      searchParams.get("draft") ||
      searchParams.get("postId") ||
      searchParams.get("post_id");
    if (path === "suggest" || path === "manual" || path === "scripts") {
      setEntry(path);
    } else {
      setEntry("manual");
    }
    setHistoryOpen(hist);

    if (!draftId || !projectId) return;

    let cancelled = false;
    void (async () => {
      const res = await apiFetch<{ post: RecentDraft }>(`/api/posts/${draftId}`);
      // Bail if URL changed (e.g. Build slideshows cleared ?draft=)
      if (cancelled) return;
      if (res.ok) {
        const d = res.data.post;
        const visuals = d.meta?.visualSlides || [];
        const fromScripts = Boolean(d.meta?.fromScripts);
        if (d.meta?.textStyleId) setTextStyleId(d.meta.textStyleId);
        if (d.meta?.captionBoxId) setCaptionBoxId(d.meta.captionBoxId);
        if (d.meta?.dimLevel) setDimLevel(d.meta.dimLevel);
        setCarousels([
          {
            hook: d.hook,
            title: d.hook,
            slides: d.slides?.length ? d.slides : visuals.map((v) => v.text),
            visualSlides: visuals,
            caption: d.caption || d.hook,
            hashtags: [],
            templateName: "Saved draft",
            narrative: d.meta?.narrative,
            fromScripts,
          },
        ]);
        setActiveCarouselIdx(0);
        setPreviewSlide(0);
        setTopic(d.hook);
        setEntry(
          fromScripts
            ? "scripts"
            : path === "suggest"
              ? "suggest"
              : "manual",
        );
        setFlowReason("Reopened saved draft.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [searchParams, projectId]);

  const parsedScriptPreview = useMemo(
    () => parseScriptBatch(scriptPaste),
    [scriptPaste],
  );

  const account = accounts.find((a) => a.id === accountId) ?? accounts[0];
  const active = carousels[activeCarouselIdx] ?? carousels[0] ?? null;
  const visualSlides = active?.visualSlides;
  const selectedPack = useMemo(() => {
    if (!imagePackSlug || imagePackSlug === "none") return null;
    const bySlug = imagePacks.find((p) => p.slug === imagePackSlug);
    if (bySlug) return bySlug;
    const needle = imagePackSlug.toLowerCase();
    const byName = imagePacks.find((p) => p.name.toLowerCase() === needle);
    if (byName) return byName;
    if (imagePackSlug === "auto") {
      return (
        imagePacks.find((p) =>
          (p.assets || []).some((a) => a.url || a.path),
        ) ??
        imagePacks[0] ??
        null
      );
    }
    return null;
  }, [imagePacks, imagePackSlug]);
  const packAssets =
    selectedPack?.assets
      ?.filter((a) => a.includedInSequence !== false)
      .map((a) => ({
        ...a,
        url: a.url || a.path || "",
      }))
      .filter((a) => a.url) ?? [];
  const previewSlides = useMemo(() => {
    const packFrames = packAssets.map((a, i) => ({
      index: i + 1,
      text: "",
      backgroundUrl: a.url,
      backgroundLabel: a.label,
    }));
    if (visualSlides?.length) {
      const hasBg = visualSlides.some((s) => s.backgroundUrl);
      if (hasBg) return visualSlides;
      if (packAssets.length) {
        return visualSlides.map((s, i) => ({
          ...s,
          backgroundUrl: s.backgroundUrl || packAssets[i % packAssets.length]!.url,
          backgroundLabel:
            s.backgroundLabel || packAssets[i % packAssets.length]!.label,
        }));
      }
      return visualSlides;
    }
    if (active?.slides?.length) {
      if (packAssets.length) {
        return active.slides.map((t, i) => ({
          index: i + 1,
          text: t,
          backgroundUrl: packAssets[i % packAssets.length]!.url,
          backgroundLabel: packAssets[i % packAssets.length]!.label,
        }));
      }
      return active.slides.map((t, i) => ({ index: i + 1, text: t }));
    }
    return packFrames.slice(0, 5);
  }, [active, visualSlides, packAssets]);
  const current = previewSlides[previewSlide] ?? previewSlides[0];

  useEffect(() => {
    if (previewSlide >= previewSlides.length) {
      setPreviewSlide(Math.max(0, previewSlides.length - 1));
    }
  }, [previewSlide, previewSlides.length]);

  useEffect(() => {
    setPreviewSlide(0);
  }, [imagePackSlug]);
  const textStyle = getTextStyle(textStyleId);
  const captionPaint = useMemo(
    () => resolveCaptionPaint(textStyleId, captionBoxId),
    [textStyleId, captionBoxId],
  );
  const previewFrameRef = useRef<HTMLDivElement>(null);
  const previewEditRef = useRef<HTMLTextAreaElement>(null);
  const draggingY = useRef(false);
  const [previewEditing, setPreviewEditing] = useState(false);
  const [layoutEditorOpen, setLayoutEditorOpen] = useState(false);

  const slideCopy = useMemo(
    () => resolveSlideCopy((current as VisualSlide) || { text: "" }),
    [current],
  );

  const slideLayout = useMemo(() => {
    const vs = current as VisualSlide | undefined;
    return resolveSlideCustomization(vs?.customization, {
      isProduct: vs ? isProductSlideHint(vs) : false,
      legacyPositionY: vs?.positionY,
    });
  }, [current]);

  const fontScale = useMemo(() => {
    const full = composeSlideText(slideCopy.heading, slideCopy.body);
    const base = slideFontScale(full.length || (current?.text || "").length);
    const m = slideLayout.fontSizeScale;
    return {
      ...base,
      bodyPreviewPx: Math.round(base.bodyPreviewPx * m * 10) / 10,
      headingPreviewPx: Math.round(base.headingPreviewPx * m * 10) / 10,
      bodyCanvasPx: Math.round(base.bodyCanvasPx * m),
      headingCanvasPx: Math.round(base.headingCanvasPx * m),
      gapPreviewPx: Math.round(base.gapPreviewPx * Math.min(m, 1.2)),
    };
  }, [slideCopy, current?.text, slideLayout.fontSizeScale]);

  const previewHeadingLines = useMemo(() => {
    if (!slideCopy.heading?.trim()) return [];
    const padX = captionPaint.mode === "box" ? captionPaint.paddingX : 0;
    const frameW = 260;
    const boxW = (frameW * slideLayout.boxWidth) / 100;
    const maxW = boxW - padX * 2;
    const charW = fontScale.headingPreviewPx * 0.52;
    return wrapCaptionLines(
      slideCopy.heading,
      (t) => t.length * charW,
      Math.max(80, maxW),
      5,
    );
  }, [
    slideCopy.heading,
    captionPaint.mode,
    captionPaint.paddingX,
    fontScale.headingPreviewPx,
    slideLayout.boxWidth,
  ]);

  const previewBodyLines = useMemo(() => {
    const body =
      slideCopy.body?.trim() ||
      (!slideCopy.heading ? current?.text || "" : "");
    if (!body.trim()) return [];
    const padX = captionPaint.mode === "box" ? captionPaint.paddingX : 0;
    const frameW = 260;
    const boxW = (frameW * slideLayout.boxWidth) / 100;
    const maxW = boxW - padX * 2;
    const charW = fontScale.bodyPreviewPx * 0.52;
    return wrapCaptionLines(
      body,
      (t) => t.length * charW,
      Math.max(80, maxW),
      14,
    );
  }, [
    slideCopy.body,
    slideCopy.heading,
    current?.text,
    captionPaint.mode,
    captionPaint.paddingX,
    fontScale.bodyPreviewPx,
    slideLayout.boxWidth,
  ]);

  const previewLines = useMemo(() => {
    if (previewHeadingLines.length || previewBodyLines.length) {
      return [...previewHeadingLines, ...previewBodyLines];
    }
    const raw = current?.text || "Your slide will appear here";
    const padX = captionPaint.mode === "box" ? captionPaint.paddingX : 0;
    const maxW = 260 - TIKTOK_SAFE.previewSide * 2 - padX * 2;
    const charW = fontScale.bodyPreviewPx * 0.52;
    return wrapCaptionLines(raw, (t) => t.length * charW, maxW, 14);
  }, [
    previewHeadingLines,
    previewBodyLines,
    current?.text,
    captionPaint.mode,
    captionPaint.paddingX,
    fontScale.bodyPreviewPx,
  ]);

  const currentTextPosition = useMemo((): TextPosition | "none" => {
    if (current && isProductSlideHint(current as VisualSlide)) {
      const pos = (current as VisualSlide).textPosition;
      if (pos === "top" || pos === "bottom" || pos === "center") return pos;
      return "top";
    }
    if (
      current &&
      "textPosition" in current &&
      current.textPosition === "none" &&
      !(current as VisualSlide).text?.trim()
    ) {
      return "none";
    }
    const pos =
      (current && "textPosition" in current && current.textPosition) ||
      defaultTextPosition;
    if (pos === "top" || pos === "bottom" || pos === "center") return pos;
    return defaultTextPosition;
  }, [current, defaultTextPosition]);

  const currentPositionY = useMemo(() => {
    const vs = current as VisualSlide | undefined;
    if (typeof vs?.positionY === "number") {
      return clampPositionY(vs.positionY);
    }
    if (vs?.customization?.positionY != null) {
      return slideLayout.positionY;
    }
    const isProduct = vs ? isProductSlideHint(vs) : false;
    return positionYFromPreset(currentTextPosition, isProduct);
  }, [current, slideLayout.positionY, currentTextPosition]);

  function applyTextPositionToAll(pos: TextPosition) {
    setDefaultTextPosition(pos);
    const y = positionYFromPreset(pos, false);
    setCarousels((prev) =>
      prev.map((c, ci) => {
        if (ci !== activeCarouselIdx) return c;
        if (!c.visualSlides?.length) return c;
        return {
          ...c,
          visualSlides: c.visualSlides.map((s) =>
            isProductSlideHint(s)
              ? {
                  ...s,
                  textPosition: "top",
                  positionY: PRODUCT_POSITION_Y,
                  suppressText: false,
                  customization: {
                    ...s.customization,
                    positionY: PRODUCT_POSITION_Y,
                  },
                }
              : {
                  ...s,
                  textPosition: pos,
                  positionY: y,
                  suppressText: false,
                  customization: { ...s.customization, positionY: y },
                },
          ),
        };
      }),
    );
  }

  function setSlideTextPosition(slideIndex: number, pos: TextPosition) {
    const y = positionYFromPreset(pos, false);
    setCarousels((prev) =>
      prev.map((c, ci) => {
        if (ci !== activeCarouselIdx) return c;
        if (c.visualSlides?.length) {
          return {
            ...c,
            visualSlides: c.visualSlides.map((s) =>
              s.index === slideIndex
                ? {
                    ...s,
                    textPosition: pos,
                    positionY: y,
                    suppressText: false,
                    customization: { ...s.customization, positionY: y },
                  }
                : s,
            ),
          };
        }
        return {
          ...c,
          visualSlides: c.slides.map((t, i) => ({
            index: i + 1,
            text: t,
            textPosition: i + 1 === slideIndex ? pos : defaultTextPosition,
            positionY:
              i + 1 === slideIndex
                ? y
                : positionYFromPreset(defaultTextPosition),
          })),
        };
      }),
    );
  }

  function setSlidePositionY(slideIndex: number, y: number) {
    const clamped = clampPositionY(y);
    const preset: TextPosition =
      clamped <= 30 ? "top" : clamped >= 68 ? "bottom" : "center";
    setCarousels((prev) =>
      prev.map((c, ci) => {
        if (ci !== activeCarouselIdx) return c;
        if (c.visualSlides?.length) {
          return {
            ...c,
            visualSlides: c.visualSlides.map((s) =>
              s.index === slideIndex
                ? {
                    ...s,
                    positionY: clamped,
                    textPosition: preset,
                    suppressText: false,
                    customization: {
                      ...s.customization,
                      positionY: clamped,
                    },
                  }
                : s,
            ),
          };
        }
        return {
          ...c,
          visualSlides: c.slides.map((t, i) => ({
            index: i + 1,
            text: t,
            positionY:
              i + 1 === slideIndex
                ? clamped
                : positionYFromPreset(defaultTextPosition),
            textPosition:
              i + 1 === slideIndex ? preset : defaultTextPosition,
            customization:
              i + 1 === slideIndex ? { positionY: clamped } : undefined,
          })),
        };
      }),
    );
  }

  function patchSlideCustomization(
    slideIndex: number,
    patch: Partial<SlideCustomization>,
  ) {
    setCarousels((prev) =>
      prev.map((c, ci) => {
        if (ci !== activeCarouselIdx) return c;
        const ensureVisuals: VisualSlide[] = c.visualSlides?.length
          ? c.visualSlides
          : c.slides.map((t, i) => ({
              index: i + 1,
              text: t,
              textPosition: defaultTextPosition,
              positionY: positionYFromPreset(defaultTextPosition),
            }));
        return {
          ...c,
          visualSlides: ensureVisuals.map((s) => {
            if (s.index !== slideIndex) return s;
            const isProduct = isProductSlideHint(s);
            const next = resolveSlideCustomization(
              { ...s.customization, ...patch },
              { isProduct, legacyPositionY: s.positionY },
            );
            const preset: TextPosition =
              next.positionY <= 30
                ? "top"
                : next.positionY >= 68
                  ? "bottom"
                  : "center";
            return {
              ...s,
              positionY: next.positionY,
              textPosition: preset,
              customization: next,
              suppressText: false,
            };
          }),
        };
      }),
    );
  }

  function resetSlideLayout(slideIndex: number) {
    const vs = (active?.visualSlides || []).find((s) => s.index === slideIndex);
    const isProduct = vs ? isProductSlideHint(vs) : false;
    const defaults = resolveSlideCustomization(null, { isProduct });
    patchSlideCustomization(slideIndex, defaults);
  }

  function onPreviewCaptionPointerDown(e: ReactPointerEvent<HTMLDivElement>) {
    if (previewEditing) return;
    if (!current || currentTextPosition === "none") {
      return;
    }
    // Allow drag even when empty (placeholder visible); edit via double-click
    e.preventDefault();
    draggingY.current = true;
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  }

  function onPreviewCaptionPointerMove(e: ReactPointerEvent<HTMLDivElement>) {
    if (previewEditing) return;
    if (!draggingY.current || !previewFrameRef.current || !current) return;
    const rect = previewFrameRef.current.getBoundingClientRect();
    const pct = ((e.clientY - rect.top) / rect.height) * 100;
    setSlidePositionY(current.index, pct);
  }

  function onPreviewCaptionPointerUp() {
    draggingY.current = false;
  }

  function beginPreviewEdit(e?: React.MouseEvent) {
    e?.stopPropagation();
    e?.preventDefault();
    if (!current || currentTextPosition === "none") return;
    draggingY.current = false;
    setPreviewEditing(true);
  }

  function commitPreviewEdit() {
    setPreviewEditing(false);
  }

  useEffect(() => {
    setPreviewEditing(false);
  }, [previewSlide, activeCarouselIdx]);

  useEffect(() => {
    if (!previewEditing) return;
    const el = previewEditRef.current;
    if (!el) return;
    el.focus();
    const len = el.value.length;
    el.setSelectionRange(len, len);
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [previewEditing, current?.text]);

  function setSlideText(slideIndex: number, text: string) {
    const { heading, body } = splitSlideCopy(text);
    setCarousels((prev) =>
      prev.map((c, ci) => {
        if (ci !== activeCarouselIdx) return c;
        if (c.visualSlides?.length) {
          return {
            ...c,
            slides: c.slides.map((t, i) =>
              i + 1 === slideIndex ? text : t,
            ),
            visualSlides: c.visualSlides.map((s) =>
              s.index === slideIndex
                ? {
                    ...s,
                    text,
                    heading,
                    body: body || (!heading ? text : ""),
                    suppressText: false,
                  }
                : s,
            ),
          };
        }
        return {
          ...c,
          slides: c.slides.map((t, i) =>
            i + 1 === slideIndex ? text : t,
          ),
        };
      }),
    );
  }

  async function analyseOpportunities(force = false): Promise<Opportunity[]> {
    if (!projectId) return opportunities;
    if (!force && opportunities.length && generatedAt) return opportunities;

    setSuggestBusy(true);
    setError(null);
    setThinkingSteps(GENERATOR_THINKING_STAGES);
    setThinkingIdx(0);
    const tick = setInterval(() => setThinkingIdx((i) => i + 1), 900);
    try {
      const res = await fetch("/api/ai/opportunities", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Analysis failed");

      const ops = (data.opportunities || []) as Opportunity[];
      const at = data.generatedAt || new Date().toISOString();
      setOpportunities(ops);
      setGeneratedAt(at);
      if (data.bestFlow?.slug) setFlowSlug(data.bestFlow.slug);

      localStorage.setItem(
        cacheKey(projectId),
        JSON.stringify({
          opportunities: ops,
          generatedAt: at,
          inspiredBy: data.inspiredBy || [],
          bestFlow: data.bestFlow,
        } satisfies CachedOps),
      );
      return ops;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Analysis failed");
      return [];
    } finally {
      clearInterval(tick);
      setSuggestBusy(false);
      setThinkingIdx(99);
    }
  }

  async function surpriseTopics() {
    setTopicSuggestBusy(true);
    setError(null);
    try {
      const ops =
        opportunities.length > 0
          ? opportunities
          : await analyseOpportunities(true);
      const chips = ops.slice(0, 4).map((o) => ({
        title: o.title,
        flow: o.suggestedFlow,
      }));
      setTopicChips(
        chips.length
          ? chips
          : [
              { title: "3 habits to beat 2PM fog" },
              { title: "Why monk mode failed me" },
              { title: "The slow morning protocol" },
              { title: "Quiet confidence is a skill" },
            ],
      );
    } finally {
      setTopicSuggestBusy(false);
    }
  }

  async function generate(overrideTopic?: string, opp?: Opportunity) {
    if (!project || !projectId) return;
    const promptTopic = (overrideTopic || topic).trim();
    if (!promptTopic) {
      setError("Enter a topic or analyse opportunities first");
      return;
    }
    if (opp) setGeneratingId(opp.title);
    setBusy(true);
    setError(null);
    setTopic(promptTopic);
    if (opp) {
      setIntent(opp.intent || intent);
      setOpportunityReason(opp.reason);
      if (opp.suggestedFlow) setFlowSlug(opp.suggestedFlow);
    }

    const steps = GENERATOR_THINKING_STAGES;
    setThinkingSteps(steps);
    setThinkingIdx(0);
    const tick = setInterval(
      () => setThinkingIdx((i) => Math.min(i + 1, steps.length - 1)),
      900,
    );

    try {
      const res = await fetch("/api/ai/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          projectName: project.name,
          projectDescription: project.description,
          topic: promptTopic,
          intent: opp?.intent || intent,
          audience: "",
          writingLength,
          slides: 5,
          count: variantCount,
          carouselFormat,
          accountHandle: account ? `@${account.username}` : undefined,
          autoReferences: false,
          referencePostIds: inspiredBy.map((p) => p.id),
          brandPackSlug: "auto",
          flowSlug: flowSlug || undefined,
          imagePackSlug,
          opportunityReason: opp?.reason || opportunityReason,
          ...(formatReferenceId ? { formatReferenceId } : {}),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Generation failed");

      const next = withTextPositions(data.carousels as Carousel[], defaultTextPosition);
      setCarousels(next);
      setPreviewSlide(0);
      setFlowReason(data.flowReason || data.flow?.reason || "");
      setAssetLog(data.assetLog || []);
      // Never auto-apply Inspired-by references after generate.

      for (const c of next) {
        const coverUrl = c.visualSlides?.find((v) => v.backgroundUrl)?.backgroundUrl;
        const saveRes = await apiFetch<{ post: { id: string } }>("/api/posts", {
          method: "POST",
          body: JSON.stringify({
            projectId,
            accountId: account?.id,
            hook: c.hook,
            caption: c.caption,
            slides: c.slides,
            status: "draft",
            theme: `${opp?.intent || intent}:generated`.toLowerCase(),
            coverUrl,
            meta: {
              ...data.meta,
              narrative: c.narrative,
              visualSlides: c.visualSlides,
              score: c.score,
              textStyleId,
              captionBoxId,
              dimLevel,
            },
            saveToLibrary: true,
          }),
        });
        if (saveRes.ok) {
          prependDraft({
            id: saveRes.data.post.id,
            hook: c.hook,
            status: "draft",
            coverUrl,
          });
        }
      }
      void load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Generation failed");
    } finally {
      clearInterval(tick);
      setThinkingIdx(99);
      setBusy(false);
      if (opp) {
        setGeneratingId(null);
        setPath("manual", { replace: true });
      }
    }
  }

  function withTextPositions(list: Carousel[], pos: TextPosition): Carousel[] {
    const y = positionYFromPreset(pos, false);
    return list.map((c) => ({
      ...c,
      visualSlides: c.visualSlides?.map((s) =>
        isProductSlideHint(s)
          ? {
              ...s,
              textPosition: "top",
              positionY: PRODUCT_POSITION_Y,
              suppressText: false,
              customization: {
                ...s.customization,
                positionY: PRODUCT_POSITION_Y,
              },
            }
          : {
              ...s,
              textPosition: pos,
              positionY: y,
              suppressText: false,
              customization: { ...s.customization, positionY: y },
            },
      ),
    }));
  }

  function slidesForExport(c: Carousel) {
    return (
      c.visualSlides ||
      c.slides.map((t, i) => ({
        index: i + 1,
        text: t,
        backgroundUrl: undefined as string | undefined,
        textPosition: defaultTextPosition,
        positionY: positionYFromPreset(defaultTextPosition),
      }))
    ).map((s) => {
      const isProduct = isProductSlideHint(s as VisualSlide);
      const layout = resolveSlideCustomization(
        (s as VisualSlide).customization,
        {
          isProduct,
          legacyPositionY: (s as VisualSlide).positionY,
        },
      );
      const textPosition =
        s.textPosition === "none"
          ? "top"
          : "textPosition" in s && s.textPosition
            ? s.textPosition
            : defaultTextPosition;
      const positionY = layout.positionY;
      return {
        index: s.index,
        text: s.text,
        heading: (s as VisualSlide).heading,
        body: (s as VisualSlide).body,
        backgroundUrl: "backgroundUrl" in s ? s.backgroundUrl : undefined,
        textPosition,
        positionY,
        isProduct,
        boxWidth: layout.boxWidth,
        fontSizeScale: layout.fontSizeScale,
        textAlign: layout.textAlign,
        customization: layout,
      };
    });
  }

  async function doExport() {
    if (!active) return;
    setExportBusy(true);
    setExportMsg("");
    try {
      await exportCarouselZip({
        topic: active.title || topic || active.hook,
        slides: slidesForExport(active),
        caption: active.caption,
        hashtags: active.hashtags || [],
        textStyleId,
        captionBoxId,
        dim: dimLevel,
        onProgress: setExportMsg,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Export failed");
    } finally {
      setExportBusy(false);
      setExportMsg("");
    }
  }

  async function doExportAll() {
    if (!carousels.length) return;
    setExportBusy(true);
    setExportMsg("");
    try {
      await exportCarouselBatchZip({
        batchName: "Zeno-Philosophy-batch",
        carousels: carousels.map((c) => ({
          topic: c.title || c.hook,
          slides: slidesForExport(c),
          caption: c.caption,
          hashtags: c.hashtags || [],
        })),
        textStyleId,
        captionBoxId,
        dim: dimLevel,
        onProgress: setExportMsg,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Export failed");
    } finally {
      setExportBusy(false);
      setExportMsg("");
    }
  }

  async function composeFromScripts() {
    if (!projectId) return;
    const parsed = parseScriptBatch(scriptPaste);
    if (!parsed.length) {
      setError(
        "Couldn’t parse scripts. Use numbered titles and “Slide 1”, “Slide 2 (Product)”, etc.",
      );
      return;
    }
    // Drop any leftover AI-generated carousel so results can't be confused
    setCarousels([]);
    setAssetLog([]);
    setFlowReason("");
    setBusy(true);
    setError(null);
    setThinkingSteps([
      "Analyzing performance data...",
      "Matching image pack aesthetic...",
      "Crafting 5-slide hook & narrative...",
      "Finalizing carousel...",
    ]);
    setThinkingIdx(0);
    const tick = setInterval(
      () => setThinkingIdx((i) => Math.min(i + 1, 3)),
      700,
    );
    try {
      // Clear ?draft= so a reopened draft effect can't overwrite this batch
      router.replace("/generate?path=scripts");

      const res = await fetch("/api/ai/compose", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          imagePackSlug,
          projectName: project?.name,
          carousels: parsed.map((c) => ({
            title: c.title,
            slides: c.slides.map((s) => ({
              text: s.text,
              beat: s.beat,
              isProduct: s.isProduct,
            })),
          })),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Compose failed");

      // Client is source of truth for copy — never trust a rewrite
      const merged: Carousel[] = parsed.map((p, i) => {
        const api = (data.carousels as Carousel[])[i];
        const visualSlides = p.slides.map((s, j) => {
          const bg = api?.visualSlides?.[j];
          const isProduct = s.isProduct || Boolean(bg?.isProduct);
          const text =
            isProduct && (!s.text.trim() || /product/i.test(s.text))
              ? softProductCta(project?.name || "insight")
              : s.text;
          return {
            index: s.index,
            text,
            heading: s.heading,
            body: s.body ?? text,
            backgroundUrl: bg?.backgroundUrl,
            backgroundLabel: bg?.backgroundLabel,
            backgroundAssetId: bg?.backgroundAssetId,
            backgroundKind: bg?.backgroundKind || (isProduct ? "product" : undefined),
            isProduct,
            suppressText: false,
            textPosition: isProduct ? "top" : defaultTextPosition,
            overlay: bg?.overlay,
          } satisfies VisualSlide;
        });
        return {
          hook: p.slides.find((s) => s.text)?.text || p.title,
          title: p.title,
          narrative: p.title,
          slides: visualSlides.map((v) => v.text),
          visualSlides,
          caption:
            api?.caption ||
            `${p.title}\n\n${visualSlides
              .map((s) => s.text)
              .filter(Boolean)
              .join("\n\n")}`.slice(0, 2200),
          hashtags: api?.hashtags || [
            "#journaling",
            "#stoicism",
            "#mindfulness",
            "#zeno",
            "#selfimprovement",
          ],
          templateName: api?.templateName || data.imagePack?.name,
          fromScripts: true,
        };
      });

      const next = withTextPositions(merged, defaultTextPosition);
      setCarousels(next);
      setActiveCarouselIdx(0);
      setPreviewSlide(0);
      setTopic(parsed[0]?.title || "Script batch");
      setAssetLog(
        data.assetLog?.length
          ? data.assetLog
          : [
              `Built ${next.length} carousel(s) from your scripts — exact words kept`,
            ],
      );
      setFlowReason(
        `Built ${next.length} posts from your scripts using ${
          data.imagePack?.name || "Image Pack"
        }. Copy was not rewritten.`,
      );

      for (const c of next) {
        const coverUrl = c.visualSlides?.find((v) => v.backgroundUrl)?.backgroundUrl;
        const saveRes = await apiFetch<{ post: { id: string } }>("/api/posts", {
          method: "POST",
          body: JSON.stringify({
            projectId,
            accountId: account?.id,
            hook: c.hook,
            caption: c.caption,
            slides: c.slides,
            status: "draft",
            theme: "script-compose",
            coverUrl,
            meta: {
              narrative: c.narrative || c.title,
              visualSlides: c.visualSlides,
              title: c.title,
              fromScripts: true,
              textStyleId,
              captionBoxId,
              dimLevel,
            },
            saveToLibrary: true,
          }),
        });
        if (saveRes.ok) {
          prependDraft({
            id: saveRes.data.post.id,
            hook: c.hook,
            status: "draft",
            coverUrl,
          });
        }
      }
      void load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Compose failed");
    } finally {
      clearInterval(tick);
      setThinkingIdx(99);
      setBusy(false);
    }
  }

  function openRecentDraft(d: RecentDraft) {
    const visuals = d.meta?.visualSlides || [];
    setCarousels([
      {
        hook: d.hook,
        title: d.hook,
        slides: d.slides?.length ? d.slides : visuals.map((v) => v.text),
        visualSlides: visuals,
        caption: d.caption || d.hook,
        hashtags: [],
        templateName: "Saved draft",
        narrative: d.meta?.narrative,
      },
    ]);
    setActiveCarouselIdx(0);
    setPreviewSlide(0);
    setTopic(d.hook);
    setEntry("scripts");
    setHistoryOpen(true);
    setFlowReason("Reopened saved draft from Generator history.");
    router.push(`/generate?path=scripts&history=1&draft=${d.id}`);
  }

  async function deleteDraft(id: string, e?: React.MouseEvent) {
    e?.stopPropagation();
    e?.preventDefault();
    // Optimistic: remove instantly from UI, roll back on failure
    const snapshot = cachedDrafts.find((d) => d.id === id);
    removeDraft(id);
    setRecentDrafts((prev) => prev.filter((d) => d.id !== id));
    const draftParam = searchParams.get("draft");
    if (draftParam === id) {
      setCarousels([]);
      router.push("/generate?history=1");
    }
    const res = await apiFetch(`/api/posts/${id}`, { method: "DELETE" });
    if (!res.ok) {
      if (snapshot) {
        prependDraft(snapshot);
        setRecentDrafts((prev) => {
          if (prev.some((d) => d.id === snapshot.id)) return prev;
          return [
            {
              id: snapshot.id,
              hook: snapshot.hook,
              caption: "",
              coverUrl: snapshot.coverUrl,
              status: snapshot.status,
              createdAt: snapshot.createdAt || "",
              slides: [],
              meta: snapshot.meta as RecentDraft["meta"],
            },
            ...prev,
          ].slice(0, 12);
        });
      }
      setError(typeof res.error === "string" ? res.error : "Delete failed");
    }
  }

  async function copyText(label: string, text: string) {
    await navigator.clipboard.writeText(text);
    setCopied(label);
    setTimeout(() => setCopied(null), 1500);
  }

  async function refreshFormatRefs() {
    if (!projectId) return;
    const res = await apiFetch<{
      references: {
        id: string;
        title: string;
        format: string;
        hook: string;
        slides?: string[];
        coverUrl?: string;
      }[];
    }>(`/api/format-references?projectId=${projectId}`, { skipCache: true });
    if (res.ok) setFormatRefs(res.data.references || []);
  }

  const selectedArchetype = formatRefs.find((r) => r.id === formatReferenceId);
  const archetypesForFormat = formatRefs.filter(
    (r) => !r.format || r.format === carouselFormat,
  );

  const formatAndArchetypeControls = (
    <div>
      <p className="mb-2 text-sm font-semibold text-ink">Format</p>
      <div className="flex flex-wrap gap-1.5">
        {(
          [
            ["storytelling", "Storytelling", BookOpen],
            ["informational", "Informational", LayoutList],
          ] as const
        ).map(([id, label, Icon]) => (
          <button
            key={id}
            type="button"
            onClick={() => {
              setCarouselFormat(id);
              // Clear archetype if it belongs to the other format
              const keep = formatRefs.find(
                (r) => r.id === formatReferenceId && r.format === id,
              );
              if (!keep) setFormatReferenceId("");
            }}
            className={cn(
              "inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-left text-xs",
              carouselFormat === id
                ? "border-primary/40 bg-primary/15 text-primary"
                : "border-border text-muted",
            )}
          >
            <Icon className="h-3.5 w-3.5 shrink-0" strokeWidth={1.75} />
            {label}
          </button>
        ))}
      </div>

      <div className="mt-3">
        <p className="mb-1.5 text-[10px] font-medium uppercase tracking-wide text-muted">
          Choose Template Archetype
        </p>
        <div className="relative">
          <button
            ref={archetypeTriggerRef}
            type="button"
            onClick={() => setArchetypeOpen((v) => !v)}
            className={cn(
              GLASS_TRIGGER,
              "rounded-xl px-3 py-2.5 text-xs",
              formatReferenceId && "bg-white/[0.06] text-white",
            )}
            aria-expanded={archetypeOpen}
            aria-haspopup="listbox"
          >
            <span className="flex min-w-0 items-center gap-2.5">
              {selectedArchetype?.coverUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={selectedArchetype.coverUrl}
                  alt=""
                  className="h-9 w-7 shrink-0 rounded object-cover"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <span className="flex h-9 w-7 shrink-0 items-center justify-center rounded bg-surface-2 text-muted">
                  <LayoutTemplate className="h-3.5 w-3.5" strokeWidth={1.75} />
                </span>
              )}
              <span className="min-w-0">
                <span className="block truncate font-medium text-ink">
                  {selectedArchetype
                    ? selectedArchetype.title || selectedArchetype.hook
                    : "None — freeform"}
                </span>
                {selectedArchetype ? (
                  <span className="mt-0.5 block truncate text-[10px] text-muted">
                    {(selectedArchetype.slides?.length || 0) > 0
                      ? `${selectedArchetype.slides!.length} slides`
                      : "Saved reference"}
                    {selectedArchetype.hook
                      ? ` · ${selectedArchetype.hook.slice(0, 48)}`
                      : ""}
                  </span>
                ) : (
                  <span className="mt-0.5 block text-[10px] text-muted">
                    Pick a saved {carouselFormat} reference as few-shot
                  </span>
                )}
              </span>
            </span>
            <ChevronDown
              className={cn(
                "h-3.5 w-3.5 shrink-0 opacity-70 transition",
                archetypeOpen && "rotate-180",
              )}
            />
          </button>

          <GlassPopover
            open={archetypeOpen}
            onClose={() => setArchetypeOpen(false)}
            triggerRef={archetypeTriggerRef}
            className="overflow-hidden"
          >
            <div role="listbox">
              <button
                type="button"
                role="option"
                className={cn(glassItemClass(!formatReferenceId), "text-xs")}
                onClick={() => {
                  setFormatReferenceId("");
                  setArchetypeOpen(false);
                }}
              >
                None — freeform (no archetype)
              </button>
              <div className="my-1 flex max-h-56 gap-2 overflow-x-auto px-1.5 py-2">
                {archetypesForFormat.length === 0 ? (
                  <p className="px-1.5 py-2 text-xs text-zinc-500">
                    No {carouselFormat} references yet.
                  </p>
                ) : (
                  archetypesForFormat.map((r) => {
                    const slideCount = Array.isArray(r.slides)
                      ? r.slides.length
                      : 0;
                    const active = r.id === formatReferenceId;
                    return (
                      <button
                        key={r.id}
                        type="button"
                        role="option"
                        aria-selected={active}
                        onClick={() => {
                          setFormatReferenceId(r.id);
                          setArchetypeOpen(false);
                        }}
                        className={cn(
                          "w-[132px] shrink-0 rounded-lg border p-2 text-left transition-colors duration-150",
                          active
                            ? "border-white/[0.14] bg-white/[0.08] text-white"
                            : "border-white/[0.08] hover:bg-white/[0.06] hover:text-white",
                        )}
                      >
                        <div className="mb-1.5 aspect-[9/16] max-h-20 overflow-hidden rounded-md bg-white/[0.04]">
                          {r.coverUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={r.coverUrl}
                              alt=""
                              className="h-full w-full object-cover"
                              referrerPolicy="no-referrer"
                            />
                          ) : (
                            <div className="flex h-full items-center justify-center text-[10px] text-zinc-500">
                              No thumb
                            </div>
                          )}
                        </div>
                        <p className="line-clamp-2 text-[11px] font-medium text-zinc-200">
                          {r.title || r.hook || "Untitled"}
                        </p>
                        {slideCount > 0 ? (
                          <span className="mt-1 inline-block rounded-full bg-white/[0.06] px-1.5 py-0.5 text-[9px] text-zinc-400">
                            {slideCount} slides
                          </span>
                        ) : null}
                      </button>
                    );
                  })
                )}
              </div>
              <button
                type="button"
                className={cn(glassItemClass(false), "flex items-center gap-1.5 text-xs font-medium text-primary hover:text-white")}
                onClick={() => {
                  setArchetypeOpen(false);
                  setCloneModalOpen(true);
                }}
              >
                <Plus className="h-3.5 w-3.5" />
                Import New Reference
              </button>
            </div>
          </GlassPopover>
        </div>
        {selectedArchetype ? (
          <p className="mt-1.5 text-[11px] text-muted">
            Using archetype hook syntax + slide progression as the few-shot
            template.
          </p>
        ) : null}
      </div>
    </div>
  );

  if (projectLoading || !project) {
    return <LoadingBlock label="Loading workspace…" />;
  }

  const compactStyleControls = (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      <GlassSelect
        aria-label="Font family"
        value={textStyleId}
        onChange={setTextStyleId}
        options={TEXT_STYLES.map((t) => ({ value: t.id, label: t.name }))}
      />
      <GlassSelect
        aria-label="Highlight box"
        value={captionBoxId}
        onChange={setCaptionBoxId}
        options={CAPTION_BOX_STYLES.map((b) => ({ value: b.id, label: b.name }))}
      />
      <GlassSelect
        aria-label="Text position"
        value={defaultTextPosition}
        onChange={(v) => applyTextPositionToAll(v as TextPosition)}
        options={[
          { value: "top", label: "Top" },
          { value: "center", label: "Middle" },
          { value: "bottom", label: "Bottom" },
        ]}
      />
      <GlassSelect
        aria-label="Background dim"
        value={dimLevel}
        onChange={(v) => setDimLevel(v as DimLevel)}
        options={[
          { value: "none", label: "Dim off" },
          { value: "soft", label: "Dim soft" },
          { value: "dark", label: "Dim dark" },
        ]}
      />
    </div>
  );

  const imagePackPicker = (
    <div>
      <p className="mb-2 text-sm font-semibold text-ink">Image Pack</p>
      <p className="mb-2 text-[11px] text-muted">
        Select background visuals…
      </p>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setImagePackSlug("none")}
          className={cn(
            "flex items-center gap-2 rounded-xl border px-2.5 py-2 text-left text-xs transition",
            imagePackSlug === "none"
              ? "border-primary/40 bg-primary/10 text-ink"
              : "border-border text-muted hover:border-white/20 hover:text-ink",
          )}
        >
          <span className="flex h-9 w-7 shrink-0 items-center justify-center rounded bg-surface-2 text-[9px] font-medium text-muted">
            —
          </span>
          <span className="font-medium">None — text only</span>
        </button>
        {imagePacks.map((p) => {
          const thumb =
            p.assets.find(
              (a) => a.includedInSequence !== false && (a.url || a.path),
            )?.url ||
            p.assets.find((a) => a.url || a.path)?.url;
          const selected = imagePackSlug === p.slug;
          return (
            <button
              key={p.slug}
              type="button"
              onClick={() => setImagePackSlug(p.slug)}
              className={cn(
                "flex max-w-[220px] items-center gap-2 rounded-xl border px-2.5 py-2 text-left text-xs transition",
                selected
                  ? "border-primary/40 bg-primary/10 text-ink"
                  : "border-border text-muted hover:border-white/20 hover:text-ink",
              )}
            >
              {thumb ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={thumb}
                  alt=""
                  className="h-9 w-7 shrink-0 rounded object-cover"
                />
              ) : (
                <span className="flex h-9 w-7 shrink-0 items-center justify-center rounded bg-surface-2 text-[10px]">
                  {p.emoji || p.name.slice(0, 1)}
                </span>
              )}
              <span className="min-w-0">
                <span className="block truncate font-medium text-ink">
                  {p.name}
                </span>
                <span className="mt-0.5 block text-[10px] text-muted">
                  {p.imageCount} images
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );

  const inspiredByCollapsible = (
    <Collapsible
      title="Inspired by"
      subtitle={
        inspiredBy.length
          ? `${inspiredBy.length} reference post${inspiredBy.length === 1 ? "" : "s"}`
          : "None"
      }
      defaultOpen={false}
    >
      <div className="mb-2 flex flex-wrap items-center justify-end gap-2">
        <button
          type="button"
          className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5 text-[11px] text-muted hover:text-ink"
          onClick={() => {
            setInspiredBy([]);
            setSelectedRefs([]);
            setRefsLocked(true);
            setChangeRefs(false);
          }}
          title="Use no reference posts"
        >
          <Minus className="h-3 w-3" />
          None
        </button>
        <button
          type="button"
          className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5 text-[11px] text-primary hover:bg-primary/10"
          onClick={() => {
            setChangeRefs((v) => !v);
            if (!changeRefs) setRefsLocked(true);
          }}
        >
          <Plus className="h-3 w-3" />
          {changeRefs ? "Done" : "Add"}
        </button>
      </div>

      {!changeRefs && inspiredBy.length === 0 && (
        <p className="mb-2 text-[11px] text-muted">
          No references applied. Add posts if you want the AI to clone a style.
        </p>
      )}

      <div className="space-y-2">
        {(changeRefs ? allPosts.slice(0, 12) : inspiredBy.slice(0, 5)).map(
          (p) => {
            const selected = inspiredBy.some((x) => x.id === p.id);
            return (
              <div
                key={p.id}
                className={cn(
                  "flex items-start gap-1 rounded-xl",
                  changeRefs && selected && "ring-1 ring-primary/50",
                )}
              >
                <button
                  type="button"
                  className="min-w-0 flex-1 rounded-xl text-left"
                  onClick={() => {
                    if (changeRefs) {
                      setRefsLocked(true);
                      if (selected) {
                        setInspiredBy((prev) =>
                          prev.filter((x) => x.id !== p.id),
                        );
                        setSelectedRefs((prev) =>
                          prev.filter((x) => x !== p.id),
                        );
                      } else {
                        setInspiredBy((prev) =>
                          [...prev, p].slice(0, 5),
                        );
                        setSelectedRefs((prev) =>
                          [...prev, p.id].slice(0, 5),
                        );
                      }
                    } else {
                      setDrawerPost(p);
                    }
                  }}
                >
                  <PostCard post={p} compact />
                </button>
                <button
                  type="button"
                  className={cn(
                    "mt-2 shrink-0 rounded-lg border border-border p-1.5 text-muted hover:border-primary/40 hover:text-ink",
                    changeRefs && selected && "border-primary/40 text-primary",
                  )}
                  title={
                    changeRefs
                      ? selected
                        ? "Remove from inspired by"
                        : "Add as reference"
                      : "Remove reference"
                  }
                  onClick={(e) => {
                    e.stopPropagation();
                    setRefsLocked(true);
                    if (changeRefs) {
                      if (selected) {
                        setInspiredBy((prev) =>
                          prev.filter((x) => x.id !== p.id),
                        );
                        setSelectedRefs((prev) =>
                          prev.filter((x) => x !== p.id),
                        );
                      } else {
                        setInspiredBy((prev) =>
                          [...prev, p].slice(0, 5),
                        );
                        setSelectedRefs((prev) =>
                          [...prev, p.id].slice(0, 5),
                        );
                      }
                    } else {
                      setInspiredBy((prev) =>
                        prev.filter((x) => x.id !== p.id),
                      );
                      setSelectedRefs((prev) =>
                        prev.filter((x) => x !== p.id),
                      );
                    }
                  }}
                >
                  {changeRefs && !selected ? (
                    <Plus className="h-3.5 w-3.5" />
                  ) : (
                    <Minus className="h-3.5 w-3.5" />
                  )}
                </button>
              </div>
            );
          },
        )}
      </div>
    </Collapsible>
  );

  return (
    <div className="flex h-full flex-col bg-bg">
      <PageHeader title="Generator">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setCloneModalOpen(true)}
            className="gap-1.5"
          >
            <Copy className="h-3.5 w-3.5" />
            Import TikTok Reference
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              const next = !historyOpen;
              setHistoryOpen(next);
              const params = new URLSearchParams(searchParams.toString());
              if (next) params.set("history", "1");
              else params.delete("history");
              const qs = params.toString();
              router.push(qs ? `/generate?${qs}` : "/generate");
            }}
          >
            Recent drafts ({recentDrafts.length})
          </Button>
          {active && (
            <Button
              className="gap-2"
              size="sm"
              disabled={busy}
              onClick={() => generate()}
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
              Regenerate
            </Button>
          )}
        </PageHeader>

      {historyOpen && (
        <div className="border-b border-border bg-surface/30 px-4 py-3 sm:px-6">
          <p className="mb-2 text-[10px] font-medium uppercase tracking-wide text-muted">
            Previously generated
          </p>
          {recentDrafts.length === 0 ? (
            <p className="text-xs text-muted">No drafts yet — build or generate a carousel first.</p>
          ) : (
            <div className="flex gap-2 overflow-x-auto pb-1">
              {recentDrafts.map((d) => (
                <div
                  key={d.id}
                  className="group relative min-w-[180px] max-w-[220px] shrink-0"
                >
                  <button
                    type="button"
                    onClick={() => openRecentDraft(d)}
                    className="w-full rounded-xl border border-border bg-bg p-2.5 text-left hover:border-primary/40"
                  >
                    <div className="mb-2 aspect-[9/16] max-h-24 overflow-hidden rounded-lg bg-surface-2">
                      {(() => {
                        const thumb =
                          (isUsableCoverUrl(d.coverUrl) && d.coverUrl) ||
                          (isUsableCoverUrl(
                            d.meta?.visualSlides?.[0]?.backgroundUrl,
                          ) &&
                            d.meta?.visualSlides?.[0]?.backgroundUrl) ||
                          null;
                        return thumb ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={thumb}
                            alt=""
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <img
                            src={`data:image/svg+xml,%3Csvg width='200' height='300' xmlns='http://www.w3.org/2000/svg'%3E%3Cdefs%3E%3ClinearGradient id='g' x1='0' y1='0' x2='1' y2='1'%3E%3Cstop offset='0' stop-color='%234facfe'/%3E%3Cstop offset='1' stop-color='%2300f2fe'/%3E%3C/linearGradient%3E%3C/defs%3E%3Crect width='200' height='300' fill='url(%23g)'/%3E%3Ccircle cx='100' cy='150' r='25' fill='white' opacity='0.25'/%3E%3C/svg%3E`}
                            alt=""
                            className="h-full w-full object-cover"
                          />
                        );
                      })()}
                    </div>
                    <p className="line-clamp-2 text-[11px] font-medium text-ink">{d.hook}</p>
                    <p className="mt-1 text-[10px] text-muted">
                      {d.status} · {new Date(d.createdAt).toLocaleDateString()}
                    </p>
                  </button>
                  <button
                    type="button"
                    title="Delete draft"
                    onClick={(e) => void deleteDraft(d.id, e)}
                    className="absolute right-2 top-2 rounded-md bg-black/70 p-1.5 text-white opacity-0 transition hover:bg-danger group-hover:opacity-100"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {error && (
        <div className="px-6 pt-3">
          <ErrorBlock message={error} onRetry={() => setError(null)} />
        </div>
      )}

      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-h-0 overflow-y-auto px-4 py-5 sm:px-6">
          <div className="mb-5 flex flex-wrap gap-1 rounded-xl border border-white/[0.06] bg-white/[0.03] p-1">
            {(
              [
                { id: "manual" as const, label: "AI Generator", Icon: Sparkles },
                {
                  id: "suggest" as const,
                  label: "Today's Opportunities",
                  Icon: TrendingUp,
                },
                {
                  id: "scripts" as const,
                  label: "Paste Raw Script",
                  Icon: ClipboardList,
                },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => {
                  setGeneratingId(null);
                  setPath(tab.id);
                }}
                className={cn(
                  "inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium transition",
                  entry === tab.id
                    ? "bg-white/[0.08] text-ink"
                    : "text-muted hover:text-ink",
                )}
              >
                <tab.Icon className="h-3.5 w-3.5" />
                {tab.label}
              </button>
            ))}
          </div>

          {entry === "suggest" && (
            <FadeIn className="mb-8 space-y-4">
              {generatingId && (
                <button
                  type="button"
                  className="text-xs text-muted transition hover:text-ink"
                  onClick={() => setGeneratingId(null)}
                >
                  ← All Opportunities
                </button>
              )}
              {!generatingId && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <h2 className="text-base font-semibold text-ink">
                        Today&apos;s opportunities
                      </h2>
                      <p className="text-xs text-muted">Cached until you refresh</p>
                    </div>
                  </div>
                  {imagePackPicker}
                  {compactStyleControls}
                </div>
              )}

              {!opportunities.length && !suggestBusy && (
                <div className="rounded-2xl border border-dashed border-border bg-surface/20 p-6 text-center">
                  <p className="text-sm font-medium text-ink">Not generated yet</p>
                  <p className="mt-2 text-xs text-muted">Estimated:</p>
                  <ul className="mx-auto mt-1 max-w-xs space-y-0.5 text-left text-xs text-muted">
                    <li>• Uses 1 AI analysis</li>
                    <li>• ~10 seconds</li>
                    <li>• Looks at your posts + competitors + trends</li>
                  </ul>
                  <Button
                    className="mt-5 gap-2"
                    size="lg"
                    onClick={() => analyseOpportunities(true)}
                  >
                    <Sparkles className="h-4 w-4" />
                    Analyse today&apos;s opportunities
                  </Button>
                </div>
              )}

              {suggestBusy && (
                <ThinkingStatus
                  stageIndex={thinkingIdx}
                  stages={thinkingSteps.length ? thinkingSteps : GENERATOR_THINKING_STAGES}
                  className="rounded-xl border border-border bg-surface/40 px-3"
                />
              )}

              {opportunities.length > 0 && !suggestBusy && (
                <>
                  {!generatingId && (
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted">
                      <span>
                        ✓ Last generated:{" "}
                        {generatedAt
                          ? new Date(generatedAt).toLocaleString(undefined, {
                              month: "short",
                              day: "numeric",
                              hour: "2-digit",
                              minute: "2-digit",
                            })
                          : "—"}
                      </span>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="gap-1.5"
                        onClick={() => analyseOpportunities(true)}
                      >
                        <RefreshCw className="h-3.5 w-3.5" /> Refresh
                      </Button>
                    </div>
                  )}

                  <div className="space-y-3">
                    {opportunities.map((o) => {
                      const key = o.title;
                      const open = expandedWhy === key;
                      const isActive = generatingId === key;
                      const collapsed = Boolean(generatingId) && !isActive;
                      return (
                        <div
                          key={key}
                          className={cn(
                            "overflow-hidden rounded-xl border bg-surface/30 p-4",
                            isActive
                              ? "w-full border-primary/40"
                              : "border-border",
                          )}
                          style={{
                            transition: "all 0.3s ease",
                            maxHeight: collapsed ? 0 : 800,
                            opacity: collapsed ? 0 : 1,
                            marginBottom: collapsed ? 0 : undefined,
                            paddingTop: collapsed ? 0 : undefined,
                            paddingBottom: collapsed ? 0 : undefined,
                            borderWidth: collapsed ? 0 : undefined,
                            pointerEvents: collapsed ? "none" : undefined,
                          }}
                          aria-hidden={collapsed}
                        >
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-semibold text-ink">
                                &ldquo;{o.title}&rdquo;
                              </p>
                              <p className="mt-1 text-[11px] text-muted">{o.reason}</p>
                            </div>
                            <div className="text-right">
                              <p className="text-2xl font-semibold tabular-nums text-primary">
                                {o.confidence}%
                              </p>
                              <p className="text-[10px] font-medium text-ink">
                                {o.confidenceLabel || "High"}
                              </p>
                              <p className="mt-1 text-[10px] text-muted">
                                Expected {formatNumber(o.expectedViewsMin)}–
                                {formatNumber(o.expectedViewsMax)} views
                              </p>
                              <p className="text-[10px] text-muted">
                                Based on {o.similarPostCount} similar posts
                              </p>
                            </div>
                          </div>

                          <button
                            type="button"
                            className="mt-2 flex items-center gap-1 text-[11px] text-primary hover:underline"
                            onClick={() => setExpandedWhy(open ? null : key)}
                          >
                            Why am I recommending this?
                            <ChevronDown
                              className={cn("h-3 w-3 transition", open && "rotate-180")}
                            />
                          </button>
                          {open && (
                            <ul className="mt-2 space-y-1.5 rounded-lg bg-bg/50 p-3 text-[11px] text-muted">
                              {(o.why || []).map((w) => (
                                <li key={w.label}>
                                  <span className="font-medium text-ink">✓ {w.label}</span>
                                  {" — "}
                                  {w.detail}
                                </li>
                              ))}
                            </ul>
                          )}

                          {isActive && (
                            <div className="mt-4 space-y-2">
                              <ThinkingStatus
                                stageIndex={thinkingIdx}
                                stages={
                                  thinkingSteps.length
                                    ? thinkingSteps
                                    : GENERATOR_THINKING_STAGES
                                }
                                className="rounded-xl border border-border bg-surface/40 px-3"
                              />
                            </div>
                          )}

                          <Button
                            className="mt-3 gap-2"
                            size="sm"
                            disabled={busy}
                            onClick={() => generate(o.title, o)}
                          >
                            {isActive && busy ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <Wand2 className="h-3.5 w-3.5" />
                            )}
                            Generate
                          </Button>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
            </FadeIn>
          )}

          {entry === "manual" && (
            <FadeIn className="mb-6 space-y-4">
              <h2 className="text-base font-semibold text-ink">Your topic</h2>
              <div className="relative">
                <textarea
                  value={topic}
                  onChange={(e) => setTopic(e.target.value)}
                  rows={3}
                  placeholder="e.g. Why your brain remembers embarrassing moments"
                  className="w-full resize-none rounded-xl border border-border bg-bg py-2.5 pl-3 pr-28 text-sm"
                />
                <button
                  type="button"
                  onClick={() => void surpriseTopics()}
                  disabled={topicSuggestBusy}
                  className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-lg border border-white/[0.08] bg-white/[0.04] px-2 py-1 text-[11px] text-ink hover:bg-white/[0.08] disabled:opacity-50"
                >
                  {topicSuggestBusy ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <Sparkles className="h-3 w-3" />
                  )}
                  Auto-suggest
                </button>
              </div>
              {topicChips.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {topicChips.map((chip) => (
                    <button
                      key={chip.title}
                      type="button"
                      onClick={() => {
                        setTopic(chip.title);
                        if (chip.flow) setFlowSlug(chip.flow);
                      }}
                      className="rounded-full border border-white/[0.08] bg-white/[0.04] px-2.5 py-1 text-[11px] text-ink hover:border-primary/40 hover:bg-primary/10"
                    >
                      {chip.title}
                    </button>
                  ))}
                </div>
              )}
              <div>
                <p className="mb-2 text-sm font-semibold text-ink">Writing style</p>
                <div className="flex flex-wrap gap-1.5">
                  {["Short", "Medium", "Detailed"].map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setWritingLength(t)}
                      className={cn(
                        "rounded-full border px-2.5 py-1 text-[11px]",
                        writingLength === t
                          ? "border-primary/40 bg-primary/15 text-primary"
                          : "border-border text-muted",
                      )}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>
              {formatAndArchetypeControls}
              {imagePackPicker}
              <div>
                <p className="mb-2 text-sm font-semibold text-ink">Variants</p>
                <div className="flex flex-wrap gap-1.5">
                  {([1, 3, 5] as const).map((n) => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => setVariantCount(n)}
                      className={cn(
                        "rounded-full border px-2.5 py-1 text-[11px]",
                        variantCount === n
                          ? "border-primary/40 bg-primary/15 text-primary"
                          : "border-border text-muted",
                      )}
                    >
                      {n}
                    </button>
                  ))}
                </div>
              </div>
              {inspiredByCollapsible}
              {compactStyleControls}
              <Button
                disabled={busy || !topic.trim()}
                onClick={() => generate(topic)}
                className="gap-2"
              >
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
                Generate Slideshow
              </Button>
            </FadeIn>
          )}

          {entry === "scripts" && (
            <FadeIn className="mb-6 space-y-4">
              <div>
                <h2 className="text-base font-semibold text-ink">Paste your scripts</h2>
                <p className="text-xs text-muted">
                  Numbered posts + Slide 1 / Slide 2 (Product)… We keep your words.
                </p>
              </div>
              <textarea
                value={scriptPaste}
                onChange={(e) => setScriptPaste(e.target.value)}
                rows={14}
                placeholder={`1. "I accidentally changed my life"\n\nSlide 1 (Writing)\nI accidentally started doing one thing every night.\n\nSlide 2 (Journal)\nAt first, I only wrote three sentences.\n\nSlide 5 (Product)\nThat's why I built Zeno.\n\n2. "The note I wish I'd written years ago"\n…`}
                className="w-full resize-y rounded-xl border border-border bg-bg px-3 py-2.5 font-mono text-xs leading-relaxed"
              />
              {imagePackPicker}
              {scriptPaste.trim() && (
                <div className="rounded-xl border border-border bg-surface/30 p-3">
                  <p className="text-[10px] font-medium uppercase tracking-[0.08em] text-muted">
                    Detected from paste
                  </p>
                  <pre className="mt-1.5 whitespace-pre-wrap font-sans text-xs leading-relaxed text-ink">
                    {summarizeParsedScripts(parsedScriptPreview)}
                  </pre>
                  {parsedScriptPreview.length > 0 && (
                    <p className="mt-2 text-[11px] text-muted">
                      Build keeps this copy exactly — no AI rewrite.
                    </p>
                  )}
                </div>
              )}
              {busy && thinkingSteps.length > 0 && (
                <ThinkingStatus
                  stageIndex={thinkingIdx}
                  stages={thinkingSteps}
                  className="rounded-xl border border-border bg-surface/40 px-3"
                />
              )}
              {compactStyleControls}
              <Button
                disabled={busy || !parsedScriptPreview.length}
                onClick={() => void composeFromScripts()}
                className="gap-2"
                size="lg"
              >
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
                {parsedScriptPreview.length
                  ? `Build ${parsedScriptPreview.length} slideshow${
                      parsedScriptPreview.length === 1 ? "" : "s"
                    }`
                  : "Build slideshows"}
              </Button>
            </FadeIn>
          )}

          {entry && (
            <>
              {entry === "suggest" && inspiredByCollapsible}

              {entry !== "scripts" && (
                <>
                  <button
                    type="button"
                    onClick={() => setAdvancedOpen((o) => !o)}
                    className="mb-6 flex w-full items-center justify-between rounded-xl border border-white/[0.08] bg-white/[0.04] px-3 py-2.5 text-xs text-zinc-300 hover:bg-white/[0.06] hover:text-white"
                  >
                    Advanced
                    <ChevronDown
                      className={cn("h-3.5 w-3.5 transition", advancedOpen && "rotate-180")}
                    />
                  </button>
                  {advancedOpen && (
                    <div className="mb-6 space-y-3 rounded-xl border border-white/[0.08] bg-[#141416]/60 p-3 text-xs backdrop-blur-xl">
                      <div>
                        <label className="text-muted">Flow</label>
                        <GlassSelect
                          aria-label="Flow"
                          value={flowSlug}
                          onChange={setFlowSlug}
                          className="mt-1"
                          options={flows.map((f) => ({
                            value: f.slug,
                            label: f.avgEngagement
                              ? `${f.name} · ${f.avgEngagement}% eng`
                              : f.name,
                          }))}
                        />
                      </div>
                    </div>
                  )}
                </>
              )}
            </>
          )}

          {busy && !generatingId && (
            <ThinkingStatus
              stageIndex={thinkingIdx}
              stages={thinkingSteps.length ? thinkingSteps : GENERATOR_THINKING_STAGES}
              className="mb-6 rounded-xl border border-primary/20 bg-primary/5 px-3"
            />
          )}

          {active && !busy && (
            <FadeIn className="space-y-5">
              {carousels.length > 1 && (
                <div>
                  <p className="mb-2 text-[10px] font-medium uppercase tracking-[0.08em] text-muted">
                    Carousels ({carousels.length}) — tap to switch
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {carousels.map((c, i) => (
                      <button
                        key={`${c.title || c.hook}-${i}`}
                        type="button"
                        onClick={() => {
                          setActiveCarouselIdx(i);
                          setPreviewSlide(0);
                        }}
                        className={cn(
                          "rounded-full border px-2.5 py-1 text-[11px]",
                          activeCarouselIdx === i
                            ? "border-primary/40 bg-primary/15 text-primary"
                            : "border-border text-muted",
                        )}
                      >
                        {i + 1}. {(c.title || c.hook || `Post ${i + 1}`).slice(0, 40)}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {active.score && !active.fromScripts && entry !== "scripts" && (
                <div className="rounded-xl border border-border bg-surface/40 p-4">
                  <p className="text-[10px] font-medium uppercase tracking-[0.08em] text-muted">
                    Predicted performance
                  </p>
                  <p className="mt-1 text-3xl font-semibold tabular-nums text-ink">
                    {active.score.score}{" "}
                    <span className="text-base font-normal text-muted">/ 100</span>
                  </p>
                  <div className="mt-3 grid gap-1.5 text-xs">
                    <div className="flex justify-between">
                      <span>Hook</span>
                      <Stars n={active.score.hook} />
                    </div>
                    <div className="flex justify-between">
                      <span>Retention</span>
                      <Stars n={active.score.retention} />
                    </div>
                    <div className="flex justify-between">
                      <span>Saves</span>
                      <Stars n={active.score.saves} />
                    </div>
                    <div className="flex justify-between">
                      <span>Downloads</span>
                      <Stars n={active.score.downloads} />
                    </div>
                  </div>
                </div>
              )}

              {assetLog.length > 0 && (
                <div className="rounded-xl border border-border px-3 py-2 text-[11px] text-muted">
                  {assetLog.slice(0, 2).map((line) => (
                    <p key={line}>✓ {line}</p>
                  ))}
                </div>
              )}

              <Collapsible
                title="Slides"
                subtitle={`${previewSlides.length} slides · Top/Mid/Bot + edit copy`}
                defaultOpen
              >
                <div className="space-y-2">
                  {previewSlides.map((s) => {
                    const vs = s as VisualSlide;
                    const isProduct = isProductSlideHint(vs);
                    const slidePos =
                      vs.textPosition === "top" ||
                      vs.textPosition === "bottom" ||
                      vs.textPosition === "center"
                        ? vs.textPosition
                        : isProduct
                          ? "top"
                          : defaultTextPosition;
                    const slideY =
                      typeof vs.positionY === "number"
                        ? clampPositionY(vs.positionY)
                        : positionYFromPreset(slidePos, isProduct);
                    return (
                      <div
                        key={s.index}
                        className={cn(
                          "rounded-xl border border-border bg-surface/20 p-3 text-left text-xs",
                          previewSlide === s.index - 1 && "border-primary/40",
                        )}
                      >
                        <div className="mb-1.5 flex items-center justify-between gap-2">
                          <button
                            type="button"
                            onClick={() => setPreviewSlide(s.index - 1)}
                            className="font-medium text-ink"
                          >
                            Slide {s.index}
                            {isProduct ? (
                              <span className="ml-1.5 text-[10px] font-normal text-primary">
                                Product · soft CTA
                              </span>
                            ) : null}
                          </button>
                          <div className="flex flex-wrap gap-1">
                            {(
                              [
                                ["top", "Top"],
                                ["center", "Mid"],
                                ["bottom", "Bot"],
                              ] as const
                            ).map(([id, label]) => (
                              <button
                                key={id}
                                type="button"
                                onClick={() => setSlideTextPosition(s.index, id)}
                                className={cn(
                                  "rounded-full border px-2 py-0.5 text-[10px]",
                                  slidePos === id
                                    ? "border-primary/40 bg-primary/15 text-primary"
                                    : "border-border text-muted",
                                )}
                              >
                                {label}
                              </button>
                            ))}
                          </div>
                        </div>
                        <label className="mb-1.5 flex items-center gap-2 text-[10px] text-muted">
                          <span className="shrink-0">Y {slideY}%</span>
                          <input
                            type="range"
                            min={18}
                            max={78}
                            value={slideY}
                            onChange={(e) =>
                              setSlidePositionY(s.index, Number(e.target.value))
                            }
                            className="h-1.5 w-full accent-primary"
                          />
                        </label>
                        <textarea
                          value={s.text || ""}
                          onChange={(e) => setSlideText(s.index, e.target.value)}
                          onFocus={() => setPreviewSlide(s.index - 1)}
                          rows={isProduct ? 2 : 3}
                          placeholder={
                            isProduct
                              ? softProductCta(project?.name || "insight")
                              : "Slide text…"
                          }
                          className="mt-1 w-full resize-y whitespace-pre-wrap rounded-lg border border-border bg-bg px-2.5 py-2 text-sm text-ink outline-none focus:border-primary/40"
                        />
                        {typeof vs.backgroundLabel === "string" &&
                        vs.backgroundLabel ? (
                          <p className="mt-1.5 text-[11px] text-muted">
                            Image: {vs.backgroundLabel}
                          </p>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              </Collapsible>

              <div className="rounded-xl border border-border p-4">
                <p className="text-sm font-semibold text-ink">Publish</p>
                <p className="mt-1 text-xs text-muted">
                  Export PNGs, schedule to Queue, or post via TikTok after OAuth.
                </p>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <Button
                    size="sm"
                    className="gap-1.5"
                    onClick={() => setScheduleOpen(true)}
                  >
                    <CalendarClock className="h-3.5 w-3.5" />
                    Schedule / Publish to TikTok
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    className="gap-1.5"
                    disabled={exportBusy}
                    onClick={() => doExport()}
                  >
                    {exportBusy ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Download className="h-3.5 w-3.5" />
                    )}
                    {exportMsg || "Export ZIP"}
                  </Button>
                  {carousels.length > 1 && (
                    <Button
                      size="sm"
                      variant="secondary"
                      className="gap-1.5"
                      disabled={exportBusy}
                      onClick={() => void doExportAll()}
                    >
                      {exportBusy ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Download className="h-3.5 w-3.5" />
                      )}
                      Export all ({carousels.length})
                    </Button>
                  )}
                </div>
              </div>
            </FadeIn>
          )}
        </div>

        {/* Live preview — TikTok-like */}
        <FadeIn
          delay={0.05}
          className="hidden h-full min-h-0 flex-col overflow-hidden border-l border-white/[0.06] p-5 lg:flex"
        >
          <div className="mb-3 flex shrink-0 items-center justify-between gap-2">
            <p className="text-[10px] font-medium uppercase tracking-[0.08em] text-muted">
              Live preview
            </p>
            <div className="flex items-center gap-1.5">
              {active?.templateName && <Badge>{active.templateName}</Badge>}
              {active && current ? (
                <Button
                  size="sm"
                  variant={layoutEditorOpen ? "default" : "secondary"}
                  className="h-7 gap-1 px-2 text-[10px]"
                  onClick={() => setLayoutEditorOpen((o) => !o)}
                >
                  <SlidersHorizontal className="h-3 w-3" />
                  Edit Layout
                </Button>
              ) : null}
              {active && (
                <div className="relative">
                  <button
                    ref={publishMenuRef}
                    type="button"
                    className="rounded-md p-1 text-muted hover:bg-white/[0.06] hover:text-ink"
                    aria-label="More preview actions"
                    onClick={() => setPublishMenuOpen((o) => !o)}
                  >
                    <MoreHorizontal className="h-4 w-4" />
                  </button>
                  <GlassPopover
                    open={publishMenuOpen}
                    onClose={() => setPublishMenuOpen(false)}
                    triggerRef={publishMenuRef}
                    align="end"
                    matchTriggerWidth={false}
                    minWidth={176}
                  >
                    <button
                      type="button"
                      className={cn(glassItemClass(false), "flex items-center gap-2 text-xs")}
                      onClick={() => {
                        void copyText(
                          "caption",
                          `${active.caption}\n\n${(active.hashtags || []).join(" ")}`,
                        );
                        setPublishMenuOpen(false);
                      }}
                    >
                      {copied === "caption" ? (
                        <Check className="h-3.5 w-3.5" />
                      ) : (
                        <Copy className="h-3.5 w-3.5" />
                      )}
                      Copy caption
                    </button>
                    <button
                      type="button"
                      className={cn(glassItemClass(false), "flex items-center gap-2 text-xs")}
                      onClick={() => {
                        void copyText(
                          "tags",
                          (active.hashtags || []).join(" "),
                        );
                        setPublishMenuOpen(false);
                      }}
                    >
                      <Copy className="h-3.5 w-3.5" />
                      Copy hashtags
                    </button>
                  </GlassPopover>
                </div>
              )}
            </div>
          </div>
          <div className="mx-auto flex min-h-0 w-full max-w-[280px] flex-1 flex-col">
            {layoutEditorOpen && current ? (
              <div className="mb-3 shrink-0 space-y-2.5 rounded-xl border border-white/[0.08] bg-[#141416]/90 p-3 shadow-2xl backdrop-blur-xl">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-muted">
                    Slide {current.index} layout
                  </p>
                  <button
                    type="button"
                    className="text-[10px] text-primary hover:underline"
                    onClick={() => resetSlideLayout(current.index)}
                  >
                    Reset
                  </button>
                </div>
                <div>
                  <p className="mb-1 text-[10px] text-muted">Position Y · {slideLayout.positionY}%</p>
                  <div className="mb-1.5 flex flex-wrap gap-1">
                    {(
                      [
                        ["Top", 15],
                        ["Center", 45],
                        ["Bottom", 70],
                      ] as const
                    ).map(([label, y]) => (
                      <button
                        key={label}
                        type="button"
                        onClick={() =>
                          patchSlideCustomization(current.index, {
                            positionY: y,
                          })
                        }
                        className={cn(
                          "rounded-full border px-2 py-0.5 text-[10px]",
                          Math.abs(slideLayout.positionY - y) <= 3
                            ? "border-primary/40 bg-primary/15 text-primary"
                            : "border-border text-muted",
                        )}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  <input
                    type="range"
                    min={LAYOUT_DEFAULTS.positionYMin}
                    max={LAYOUT_DEFAULTS.positionYMax}
                    value={slideLayout.positionY}
                    onChange={(e) =>
                      patchSlideCustomization(current.index, {
                        positionY: Number(e.target.value),
                      })
                    }
                    className="w-full accent-primary"
                  />
                </div>
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[10px] text-muted">Font size</p>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      aria-label="Shrink text"
                      className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-border text-xs font-semibold hover:bg-surface-2"
                      onClick={() =>
                        patchSlideCustomization(current.index, {
                          fontSizeScale: clampFontSizeScale(
                            slideLayout.fontSizeScale - 0.1,
                          ),
                        })
                      }
                    >
                      A−
                    </button>
                    <span className="min-w-[2.5rem] text-center text-[10px] tabular-nums text-ink">
                      {Math.round(slideLayout.fontSizeScale * 100)}%
                    </span>
                    <button
                      type="button"
                      aria-label="Grow text"
                      className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-border text-xs font-semibold hover:bg-surface-2"
                      onClick={() =>
                        patchSlideCustomization(current.index, {
                          fontSizeScale: clampFontSizeScale(
                            slideLayout.fontSizeScale + 0.1,
                          ),
                        })
                      }
                    >
                      A+
                    </button>
                  </div>
                </div>
                <div>
                  <p className="mb-1 text-[10px] text-muted">
                    Box width · {slideLayout.boxWidth}%
                  </p>
                  <input
                    type="range"
                    min={LAYOUT_DEFAULTS.boxWidthMin}
                    max={LAYOUT_DEFAULTS.boxWidthMax}
                    value={slideLayout.boxWidth}
                    onChange={(e) =>
                      patchSlideCustomization(current.index, {
                        boxWidth: clampBoxWidth(Number(e.target.value)),
                      })
                    }
                    className="w-full accent-primary"
                  />
                </div>
                <div className="flex items-center gap-1">
                  <p className="mr-auto text-[10px] text-muted">Align</p>
                  {(["center", "left"] as const).map((align) => (
                    <button
                      key={align}
                      type="button"
                      onClick={() =>
                        patchSlideCustomization(current.index, {
                          textAlign: align,
                        })
                      }
                      className={cn(
                        "rounded-full border px-2 py-0.5 text-[10px] capitalize",
                        slideLayout.textAlign === align
                          ? "border-primary/40 bg-primary/15 text-primary"
                          : "border-border text-muted",
                      )}
                    >
                      {align}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
            <div className="flex min-h-0 flex-1 items-center justify-center">
            <div
              ref={previewFrameRef}
              className="relative h-full max-h-full w-auto max-w-full aspect-[9/16] overflow-hidden rounded-[22px] border border-white/[0.08] bg-black shadow-2xl"
            >
              {current &&
              (("backgroundUrl" in current && current.backgroundUrl) ||
                ("shareUrl" in current && current.shareUrl)) ? (
                <MediaImg
                  src={
                    "backgroundUrl" in current
                      ? (current.backgroundUrl as string | undefined)
                      : undefined
                  }
                  shareUrl={
                    "shareUrl" in current
                      ? (current.shareUrl as string | undefined)
                      : undefined
                  }
                  className="absolute inset-0 h-full w-full object-cover"
                  fallbackSeed={(active?.hook || "slide") + String(current.index)}
                />
              ) : null}
              {dimLevel !== "none" &&
                !(
                  current &&
                  "textPosition" in current &&
                  (current.textPosition === "none" ||
                    ("suppressText" in current && current.suppressText) ||
                    !current.text?.trim())
                ) && (
                  <div
                    className={cn(
                      "absolute inset-0",
                      dimLevel === "soft"
                        ? "bg-gradient-to-b from-black/15 via-black/20 to-black/30"
                        : "bg-gradient-to-b from-black/30 via-black/40 to-black/50",
                    )}
                  />
                )}
              {currentTextPosition === "none" ? null : (
                <div
                  className={cn(
                    "group absolute z-10 flex max-h-[85%] overflow-visible",
                    slideLayout.textAlign === "left"
                      ? "justify-start"
                      : "justify-center",
                    previewEditing
                      ? "cursor-text touch-auto"
                      : "cursor-ns-resize touch-none",
                  )}
                  style={{
                    top: `${currentPositionY}%`,
                    left: 0,
                    right: 0,
                    height: "auto",
                    paddingLeft: `${(100 - slideLayout.boxWidth) / 2}%`,
                    paddingRight: `${(100 - slideLayout.boxWidth) / 2}%`,
                  }}
                  onPointerDown={onPreviewCaptionPointerDown}
                  onPointerMove={onPreviewCaptionPointerMove}
                  onPointerUp={onPreviewCaptionPointerUp}
                  onPointerCancel={onPreviewCaptionPointerUp}
                  onDoubleClick={beginPreviewEdit}
                  title={
                    previewEditing
                      ? "Edit slide copy — first line = heading"
                      : "Drag to position · double-click to edit"
                  }
                >
                  {!previewEditing ? (
                    <div className="pointer-events-none absolute -left-1 top-1/2 hidden h-8 w-1 -translate-y-1/2 rounded-full bg-white/70 shadow group-hover:block" />
                  ) : null}
                  {previewEditing && current ? (
                    <textarea
                      ref={previewEditRef}
                      value={current.text || ""}
                      rows={1}
                      onChange={(e) => {
                        setSlideText(current.index, e.target.value);
                        const el = e.currentTarget;
                        el.style.height = "auto";
                        el.style.height = `${el.scrollHeight}px`;
                      }}
                      onBlur={commitPreviewEdit}
                      onKeyDown={(e) => {
                        if (e.key === "Escape") {
                          e.preventDefault();
                          commitPreviewEdit();
                        }
                        e.stopPropagation();
                      }}
                      onPointerDown={(e) => e.stopPropagation()}
                      className={cn(
                        "h-auto max-h-[85%] w-full max-w-full resize-none overflow-hidden bg-transparent px-3.5 py-2.5 outline-none ring-1 ring-white/50",
                        slideLayout.textAlign === "left"
                          ? "text-left"
                          : "text-center",
                      )}
                      style={{
                        fontFamily: textStyle.fontFamily,
                        fontSize: fontScale.bodyPreviewPx,
                        fontWeight: 600,
                        lineHeight: 1.375,
                        whiteSpace: "pre-wrap",
                        color: captionPaint.textColor,
                        backgroundColor:
                          captionPaint.mode === "box"
                            ? captionPaint.boxBackground
                            : "rgba(0,0,0,0.35)",
                        borderRadius:
                          captionPaint.mode === "box"
                            ? captionPaint.borderRadius
                            : 8,
                        boxShadow:
                          captionPaint.mode === "box"
                            ? captionPaint.boxShadowCss || undefined
                            : undefined,
                        textShadow:
                          captionPaint.mode === "box"
                            ? "none"
                            : captionPaint.textShadow,
                        caretColor: captionPaint.textColor,
                      }}
                      aria-label={`Edit slide ${current.index} text`}
                    />
                  ) : (
                    <div
                      className={cn(
                        "h-auto max-h-[85%] w-full max-w-full overflow-visible px-3.5 py-2.5 font-semibold leading-snug [text-rendering:geometricPrecision] [-webkit-font-smoothing:antialiased]",
                        slideLayout.textAlign === "left"
                          ? "text-left"
                          : "text-center",
                      )}
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
                          captionPaint.mode === "box"
                            ? "none"
                            : captionPaint.textShadow,
                        WebkitTextStroke:
                          captionPaint.mode !== "box" &&
                          textStyle.id === "outline"
                            ? "1px #000"
                            : undefined,
                      }}
                    >
                      {!current?.text?.trim() ? (
                        <span className="block opacity-70">
                          Double-click to add text
                        </span>
                      ) : (
                        previewLines.map((line, i) => (
                          <span
                            key={`l-${i}-${line.slice(0, 12)}`}
                            className="block font-semibold leading-snug"
                            style={{ fontWeight: 600, lineHeight: 1.375 }}
                          >
                            {line || "\u00A0"}
                          </span>
                        ))
                      )}
                    </div>
                  )}
                </div>
              )}
              <div className="pointer-events-none absolute bottom-5 left-0 right-0 z-10 flex justify-center gap-1.5">
                {(previewSlides.length ? previewSlides : [{ index: 1 }]).map(
                  (_, i) => (
                    <span
                      key={i}
                      className={cn(
                        "h-1.5 rounded-full transition",
                        i === previewSlide ? "w-4 bg-white" : "w-1.5 bg-white/35",
                      )}
                    />
                  ),
                )}
              </div>
            </div>
            </div>
            <div className="mt-3 flex shrink-0 items-center justify-center gap-2">
              <button
                type="button"
                aria-label="Previous slide"
                disabled={previewSlide <= 0 || previewSlides.length === 0}
                onClick={() =>
                  setPreviewSlide((i) => Math.max(0, i - 1))
                }
                className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-border bg-surface/40 text-ink transition enabled:hover:bg-surface-2 disabled:opacity-30"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <div className="flex items-center gap-1.5 px-1">
                {(previewSlides.length ? previewSlides : [{ index: 1 }]).map(
                  (_, i) => (
                    <button
                      key={i}
                      type="button"
                      aria-label={`Go to slide ${i + 1}`}
                      onClick={() => setPreviewSlide(i)}
                      className={cn(
                        "h-1.5 rounded-full transition",
                        i === previewSlide
                          ? "w-4 bg-primary"
                          : "w-1.5 bg-muted/50 hover:bg-muted",
                      )}
                    />
                  ),
                )}
              </div>
              <button
                type="button"
                aria-label="Next slide"
                disabled={
                  previewSlides.length === 0 ||
                  previewSlide >= previewSlides.length - 1
                }
                onClick={() =>
                  setPreviewSlide((i) =>
                    Math.min(previewSlides.length - 1, i + 1),
                  )
                }
                className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-border bg-surface/40 text-ink transition enabled:hover:bg-surface-2 disabled:opacity-30"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
            {previewSlides.length > 0 ? (
              <p className="mt-1.5 text-center text-[10px] text-muted">
                Slide {previewSlide + 1} / {previewSlides.length}
                {previewEditing ? " · editing" : " · double-click text to edit"}
              </p>
            ) : null}
            {current &&
              isProductSlideHint(current as VisualSlide) &&
              current.text?.trim() && (
                <p className="mt-1 text-center text-[10px] text-muted">
                  Product slide · soft CTA at {currentPositionY}% (drag or slider)
                </p>
              )}
          </div>
        </FadeIn>
      </div>

      <PostDrawer
        post={drawerPost}
        onClose={() => setDrawerPost(null)}
        onUseInspiration={(p) => {
          setSelectedRefs((prev) => [...new Set([p.id, ...prev])].slice(0, 3));
          setDrawerPost(null);
        }}
      />

      <TikTokPublishModal
        open={publishOpen}
        onClose={() => setPublishOpen(false)}
        projectId={projectId || ""}
        accounts={accounts}
        slides={active ? slidesForExport(active) : []}
        title={topic || active?.hook || "Carousel"}
        caption={`${active?.caption || ""}\n\n${(active?.hashtags || []).join(" ")}`.trim()}
        textStyleId={textStyleId}
        captionBoxId={captionBoxId}
        dim={dimLevel}
      />

      {projectId && (
        <ScheduleModal
          open={scheduleOpen}
          onClose={() => setScheduleOpen(false)}
          projectId={projectId}
          onScheduled={() => void load()}
        />
      )}

      <ImportTikTokReferenceModal
        open={cloneModalOpen}
        onClose={() => setCloneModalOpen(false)}
        projectId={projectId}
        defaultFormat={carouselFormat}
        onSaved={(id) => {
          void refreshFormatRefs().then(() => {
            if (id) setFormatReferenceId(id);
          });
        }}
      />
    </div>
  );
}

export default function GeneratorPage() {
  return (
    <Suspense fallback={<LoadingBlock label="Loading generator…" />}>
      <GeneratorPageInner />
    </Suspense>
  );
}
