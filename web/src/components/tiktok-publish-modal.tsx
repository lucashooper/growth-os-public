"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, ChevronDown, ExternalLink, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { GlassSelect, GLASS_SHEET } from "@/components/ui/glass-select";
import { readStoredDemoMode } from "@/lib/demo-recording";
import {
  renderSlidesJpegBlobs,
  type DimLevel,
  type ExportSlide,
} from "@/lib/carousel-export";
import { createPerfTimer } from "@/lib/perf";
import {
  commercialLabelHint,
  consentDeclarationText,
  POST_SUCCESS_MESSAGE,
  POSTING_BLOCKED_MESSAGE,
  privacyLabel,
  TIKTOK_BRANDED_CONTENT_POLICY_URL,
  TIKTOK_MUSIC_CONFIRMATION_URL,
  type ComposerCreatorInfo,
} from "@/lib/tiktok-composer-ux";

type Account = {
  id: string;
  username: string;
  nickname?: string;
  oauthConnected?: boolean;
};

type PublishErrorBody = {
  error?: string;
  error_code?: string | null;
  error_message?: string | null;
  log_id?: string | null;
  request_id?: string;
};

function formatPublishError(data: PublishErrorBody, fallback: string): string {
  if (
    !readStoredDemoMode() &&
    data.error_code === "unaudited_client_can_only_post_to_private_accounts"
  ) {
    return [
      "Unaudited TikTok apps can only post with privacy = Only you, on a private TikTok account.",
      "Set your TikTok account to Private, then select Only you and try again.",
      `log_id=${data.log_id || "n/a"}`,
    ].join(" ");
  }
  if (data.error_code === "url_ownership_unverified") {
    return [
      "TikTok rejected the image URL — verify your domain in TikTok Developer Portal → URL properties.",
      `log_id=${data.log_id || "n/a"}`,
    ].join(" ");
  }
  const parts = [
    data.error_message || data.error || fallback,
    data.error_code ? `code=${data.error_code}` : null,
    data.log_id ? `log_id=${data.log_id}` : null,
  ].filter(Boolean);
  return parts.join(" · ");
}

async function readError(res: Response): Promise<string> {
  const text = await res.text();
  try {
    const data = JSON.parse(text) as PublishErrorBody;
    if (data.error || data.error_message) {
      return formatPublishError(data, `HTTP ${res.status}`);
    }
  } catch {
    /* HTML error page */
  }
  return text.slice(0, 400) || `HTTP ${res.status}`;
}

function slidePrepKey(
  slides: ExportSlide[],
  textStyleId?: string,
  captionBoxId?: string,
  dim?: DimLevel,
): string {
  return JSON.stringify({
    textStyleId: textStyleId || "",
    captionBoxId: captionBoxId || "",
    dim: dim || "none",
    slides: slides.map((s) => ({
      i: s.index,
      t: s.text,
      h: s.heading,
      b: s.body,
      u: s.backgroundUrl,
      y: s.positionY,
      w: s.boxWidth,
      f: s.fontSizeScale,
      a: s.textAlign,
      c: s.customization,
    })),
  });
}

async function uploadSlideBlobs(
  projectId: string,
  blobs: Blob[],
  signal?: AbortSignal,
  onProgress?: (ready: number, total: number) => void,
): Promise<string[]> {
  const total = blobs.length;
  onProgress?.(0, total);
  const urls: string[] = new Array(total);
  let ready = 0;
  let next = 0;
  const CONCURRENCY = Math.min(5, Math.max(1, total));

  async function uploadOne(i: number) {
    const blob = blobs[i]!;
    const t0 = performance.now();
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const form = new FormData();
        form.append("file", blob, `slide-${i + 1}.jpg`);
        form.append("projectId", projectId);
        form.append("folder", "publish");
        form.append("skipLibrary", "1");
        const res = await fetch("/api/upload", {
          method: "POST",
          body: form,
          signal,
        });
        const data = (await res.json()) as { url?: string; error?: string };
        if (res.ok && data.url) {
          urls[i] = data.url.startsWith("http")
            ? data.url
            : `${window.location.origin}${data.url}`;
          ready += 1;
          onProgress?.(ready, total);
          console.info(
            `[perf] upload · slide ${i + 1} +${Math.round(performance.now() - t0)}ms`,
            { bytes: blob.size, attempt },
          );
          return;
        }
        if (attempt === 3) {
          throw new Error(data.error || `Image upload failed (HTTP ${res.status})`);
        }
      } catch (err) {
        if (signal?.aborted) throw err;
        if (attempt === 3) {
          const message = err instanceof Error ? err.message : "Image upload failed";
          throw new Error(`Slide ${i + 1}: ${message}`);
        }
      }
      await new Promise((r) => setTimeout(r, 250 * attempt * attempt));
    }
  }

  async function worker() {
    while (next < total) {
      const i = next++;
      await uploadOne(i);
    }
  }

  await Promise.all(
    Array.from({ length: CONCURRENCY }, () => worker()),
  );
  return urls;
}

async function fetchWithTimeout(
  input: string,
  init: RequestInit & { timeoutMs?: number },
): Promise<Response> {
  const timeoutMs = init.timeoutMs ?? 90_000;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

function resetComposerState(setters: {
  setPrivacy: (v: string) => void;
  setAllowComment: (v: boolean) => void;
  setAutoMusic: (v: boolean) => void;
  setCommercial: (v: boolean) => void;
  setYourBrand: (v: boolean) => void;
  setBranded: (v: boolean) => void;
  setConsentChecked: (v: boolean) => void;
}) {
  setters.setPrivacy("PUBLIC_TO_EVERYONE");
  setters.setAllowComment(true);
  setters.setAutoMusic(false);
  setters.setCommercial(false);
  setters.setYourBrand(false);
  setters.setBranded(false);
  setters.setConsentChecked(true);
}

export function TikTokPublishModal({
  open,
  onClose,
  projectId,
  accounts,
  slides,
  title,
  caption,
  textStyleId,
  captionBoxId,
  dim = "none",
  initialAccountIds,
  mediaType = "photo",
}: {
  open: boolean;
  onClose: () => void;
  projectId: string;
  accounts: Account[];
  slides: ExportSlide[];
  title: string;
  caption: string;
  textStyleId?: string;
  captionBoxId?: string;
  dim?: DimLevel;
  initialAccountIds?: string[];
  /** Photo carousels hide Duet/Stitch per TikTok guidelines */
  mediaType?: "photo" | "video";
}) {
  const publishable = accounts.filter((a) => a.oauthConnected);
  const isPhoto = mediaType !== "video";

  const [accountIds, setAccountIds] = useState<string[]>([]);
  const [creator, setCreator] = useState<ComposerCreatorInfo | null>(null);
  const [creatorLoading, setCreatorLoading] = useState(false);
  const [privacy, setPrivacy] = useState("PUBLIC_TO_EVERYONE");
  const [allowComment, setAllowComment] = useState(true);
  const [autoMusic, setAutoMusic] = useState(false);
  const [commercial, setCommercial] = useState(false);
  const [yourBrand, setYourBrand] = useState(false);
  const [branded, setBranded] = useState(false);
  const [consentChecked, setConsentChecked] = useState(true);
  const [captionText, setCaptionText] = useState("");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");
  const [uploadReady, setUploadReady] = useState(0);
  const [uploadTotal, setUploadTotal] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [prepHint, setPrepHint] = useState("");

  const prepKeyRef = useRef("");
  const prepPromiseRef = useRef<Promise<string[]> | null>(null);
  const uploadAbortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!open) return;
    setCaptionText((caption || title || "").trim());
    setSuccess(null);
    setError(null);
    resetComposerState({
      setPrivacy,
      setAllowComment,
      setAutoMusic,
      setCommercial,
      setYourBrand,
      setBranded,
      setConsentChecked,
    });
    const next = initialAccountIds?.length
      ? initialAccountIds.filter((id) => publishable.some((a) => a.id === id))
      : publishable[0]
        ? [publishable[0].id]
        : [];
    setAccountIds(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, caption, title]);

  const primaryAccountId = accountIds[0] || "";

  useEffect(() => {
    if (!open || !primaryAccountId) return;
    let cancelled = false;
    void (async () => {
      setCreatorLoading(true);
      setCreator(null);
      resetComposerState({
        setPrivacy,
        setAllowComment,
        setAutoMusic,
        setCommercial,
        setYourBrand,
        setBranded,
        setConsentChecked,
      });
      try {
        const t0 = performance.now();
        const res = await fetchWithTimeout(
          `/api/tiktok/creator-info?accountId=${primaryAccountId}`,
          { timeoutMs: 25_000, credentials: "same-origin" },
        );
        console.info(
          `[perf] creator-info · +${Math.round(performance.now() - t0)}ms`,
          { status: res.status, accountId: primaryAccountId },
        );
        const data = (await res.json()) as {
          creator?: ComposerCreatorInfo;
          error?: string;
        };
        if (cancelled) return;
        if (!res.ok) {
          setError(data.error || "Could not load creator info");
          setCreator({ canPost: false, privacy_level_options: ["PUBLIC_TO_EVERYONE"] });
          return;
        }
        setCreator(data.creator || { canPost: true });
        setError(null);
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Creator info failed");
        setCreator({ canPost: false, privacy_level_options: ["PUBLIC_TO_EVERYONE"] });
      } finally {
        if (!cancelled) setCreatorLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, primaryAccountId]);

  const ensurePhotoUrls = async (
    onProgress?: (ready: number, total: number) => void,
  ): Promise<string[]> => {
    const key = slidePrepKey(slides, textStyleId, captionBoxId, dim);
    if (prepKeyRef.current === key && prepPromiseRef.current) {
      return prepPromiseRef.current;
    }
    uploadAbortRef.current?.abort();
    const ac = new AbortController();
    uploadAbortRef.current = ac;
    const timer = createPerfTimer("tiktok-prepare");
    const pending: { current: Promise<string[]> | null } = { current: null };
    pending.current = (async () => {
      try {
        timer.mark("start", { slides: slides.length });
        const blobs = await renderSlidesJpegBlobs(
          slides,
          textStyleId,
          captionBoxId,
          dim,
        );
        timer.mark("render", {
          bytes: blobs.reduce((n, b) => n + b.size, 0),
        });
        const urls = await uploadSlideBlobs(
          projectId,
          blobs,
          ac.signal,
          onProgress,
        );
        timer.mark("upload", { count: urls.length });
        timer.end();
        return urls;
      } catch (err) {
        timer.fail("prepare", err);
        if (prepPromiseRef.current === pending.current) {
          prepPromiseRef.current = null;
          prepKeyRef.current = "";
        }
        throw err;
      }
    })();
    prepKeyRef.current = key;
    prepPromiseRef.current = pending.current;
    return pending.current;
  };

  useEffect(() => {
    if (!open || !projectId || slides.length === 0) return;
    let cancelled = false;
    setPrepHint("Preparing images…");
    void ensurePhotoUrls((ready, total) => {
      if (!cancelled) {
        setUploadReady(ready);
        setUploadTotal(total);
        setPrepHint(`${ready}/${total} images ready`);
      }
    })
      .then(() => {
        if (!cancelled) setPrepHint("Images ready");
      })
      .catch((err) => {
        if (cancelled || (err instanceof DOMException && err.name === "AbortError")) {
          return;
        }
        console.warn("[perf] tiktok-prepare warmup failed", err);
        if (!cancelled) setPrepHint("");
      });
    return () => {
      cancelled = true;
    };
    // Re-run when slide visuals change so we don't publish stale JPEGs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, projectId, slides, textStyleId, captionBoxId, dim]);

  useEffect(() => {
    if (commercial && branded && privacy === "SELF_ONLY") {
      setPrivacy("PUBLIC_TO_EVERYONE");
    }
  }, [commercial, branded, privacy]);

  const privacyOptions = useMemo(() => {
    const fromApi = creator?.privacy_level_options?.filter(Boolean) || [];
    return fromApi.length
      ? fromApi
      : [
          "PUBLIC_TO_EVERYONE",
          "MUTUAL_FOLLOW_FRIENDS",
          "FOLLOWER_OF_CREATOR",
          "SELF_ONLY",
        ];
  }, [creator]);

  useEffect(() => {
    if (!privacyOptions.length) return;
    if (!privacyOptions.includes(privacy)) {
      setPrivacy(
        privacyOptions.includes("PUBLIC_TO_EVERYONE")
          ? "PUBLIC_TO_EVERYONE"
          : privacyOptions[0]!,
      );
    }
  }, [privacyOptions, privacy]);

  const canPost = creator?.canPost !== false;
  const postingBlocked = !canPost;

  const brandedBlocksPrivate = commercial && branded;
  const commercialIncomplete =
    commercial && !yourBrand && !branded;

  const consentText = consentDeclarationText({ commercial, yourBrand, branded });
  const commercialHint = commercialLabelHint({ yourBrand, branded });

  const canSubmitDirect =
    canPost &&
    privacy &&
    accountIds.length > 0 &&
    captionText.trim().length > 0 &&
    consentChecked &&
    !commercialIncomplete &&
    !(brandedBlocksPrivate && privacy === "SELF_ONLY");

  const canSubmitInbox =
    accountIds.length > 0 &&
    slides.length > 0 &&
    consentChecked;

  if (!open) return null;

  function toggleAccount(id: string) {
    setAccountIds((prev) => {
      if (prev.includes(id)) return prev.length === 1 ? prev : prev.filter((x) => x !== id);
      return [...prev, id];
    });
  }

  async function runPublish(postMode: "DIRECT_POST" | "MEDIA_UPLOAD") {
    const isDirect = postMode === "DIRECT_POST";
    if (isDirect ? !canSubmitDirect : !canSubmitInbox) return;

    setBusy(true);
    setError(null);
    setSuccess(null);
    const timer = createPerfTimer(isDirect ? "tiktok-post" : "tiktok-draft");
    setProgress(
      prepPromiseRef.current ? "Finishing images…" : "Rendering slides…",
    );

    try {
      const photoUrls = await ensurePhotoUrls((ready, total) => {
        setUploadReady(ready);
        setUploadTotal(total);
        setProgress(`${ready}/${total} images ready…`);
      });
      timer.mark("images-ready", { count: photoUrls.length });

      const titlePart = captionText.trim().slice(0, 90);
      const results: string[] = [];

      for (let i = 0; i < accountIds.length; i++) {
        const accountId = accountIds[i];
        const acc = publishable.find((a) => a.id === accountId);
        setProgress(
          isDirect
            ? `Posting to @${acc?.username || "account"} (${i + 1}/${accountIds.length})…`
            : `Saving draft for @${acc?.username || "account"}…`,
        );

        const body: Record<string, unknown> = {
          projectId,
          accountId,
          title: titlePart,
          description: captionText.trim(),
          consentGiven: consentChecked,
          photoUrls,
          postMode,
        };

        if (isDirect) {
          body.privacyLevel = privacy;
          body.disableComment = !allowComment || Boolean(creator?.comment_disabled);
          body.disableDuet = true;
          body.disableStitch = true;
          body.autoAddMusic = autoMusic;
          body.brandOrganic = commercial && yourBrand;
          body.brandContent = commercial && branded;
        }

        const tiktokT0 = performance.now();
        const res = await fetchWithTimeout("/api/tiktok/publish", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          timeoutMs: 100_000,
          body: JSON.stringify(body),
        });
        const text = await res.text();
        timer.mark(`tiktok-${acc?.username || i + 1}`, {
          ms: Math.round(performance.now() - tiktokT0),
          status: res.status,
        });
        let data: PublishErrorBody & { publishId?: string } = {};
        try {
          data = JSON.parse(text);
        } catch {
          throw new Error(await readError(new Response(text, { status: res.status })));
        }
        if (!res.ok) throw new Error(formatPublishError(data, "Publish failed"));
        results.push(`@${acc?.username || "account"}`);
      }

      timer.end({ accounts: results });
      setProgress("");
      setUploadTotal(0);
      setPrepHint("");
      setSuccess(
        isDirect
          ? POST_SUCCESS_MESSAGE
          : "Draft sent! Open TikTok → Inbox → System Notifications to finalize.",
      );
    } catch (err) {
      timer.fail("publish", err);
      setProgress("");
      setUploadTotal(0);
      setError(err instanceof Error ? err.message : "Publish failed");
    } finally {
      setBusy(false);
    }
  }

  const displayName =
    creator?.creator_nickname ||
    publishable.find((a) => a.id === primaryAccountId)?.nickname ||
    publishable.find((a) => a.id === primaryAccountId)?.username ||
    "TikTok account";
  const displayHandle =
    creator?.creator_username ||
    publishable.find((a) => a.id === primaryAccountId)?.username ||
    "";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 p-4 backdrop-blur-[2px]">
      <div className={cn("max-h-[92vh] w-full max-w-lg overflow-y-auto p-5", GLASS_SHEET)}>
        <div className="mb-4 flex items-start justify-between gap-3">
          <p className="text-sm font-semibold text-ink">Post to TikTok</p>
          <button
            type="button"
            onClick={onClose}
            className="text-muted hover:text-ink"
            disabled={busy}
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {!publishable.length ? (
          <p className="text-sm text-muted">Connect a TikTok account first (Accounts).</p>
        ) : (
          <div className="space-y-4 text-sm">
            {/* 1. Creator header */}
            <div className="flex items-center gap-3 rounded-xl border border-border bg-surface/40 p-3">
              <div className="h-12 w-12 shrink-0 overflow-hidden rounded-full bg-surface-2 ring-1 ring-border">
                {creator?.creator_avatar_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={creator.creator_avatar_url}
                    alt=""
                    className="h-full w-full object-cover"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-xs text-muted">
                    TT
                  </div>
                )}
              </div>
              <div className="min-w-0">
                <p className="truncate font-semibold text-ink">{displayName}</p>
                <p className="truncate text-xs text-muted">
                  {displayHandle ? `@${displayHandle.replace(/^@/, "")}` : "Loading account…"}
                </p>
                {creatorLoading && (
                  <p className="mt-0.5 text-[10px] text-muted">Refreshing creator info…</p>
                )}
              </div>
            </div>

            {postingBlocked && (
              <div className="flex gap-2 rounded-xl border border-warning/40 bg-warning/10 px-3 py-2.5 text-xs text-warning">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <p>{POSTING_BLOCKED_MESSAGE}</p>
              </div>
            )}

            {/* Content preview */}
            <div>
              <p className="mb-1.5 text-[10px] font-medium uppercase tracking-wide text-muted">
                Content preview
              </p>
              <div className="flex gap-1.5 overflow-x-auto pb-1">
                {slides.slice(0, 8).map((s) => (
                  <div
                    key={s.index}
                    className="relative h-24 w-[54px] shrink-0 overflow-hidden rounded-lg bg-black ring-1 ring-border"
                  >
                    {s.backgroundUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={s.backgroundUrl}
                        alt={`Slide ${s.index}`}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center p-1 text-[8px] text-white/70">
                        {s.text?.slice(0, 40) || `Slide ${s.index}`}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Account picker */}
            <div>
              <label className="text-xs text-muted">Post to</label>
              <div className="mt-1.5 max-h-28 space-y-1 overflow-y-auto rounded-xl border border-border p-2">
                {publishable.map((a) => {
                  const on = accountIds.includes(a.id);
                  return (
                    <button
                      key={a.id}
                      type="button"
                      onClick={() => toggleAccount(a.id)}
                      className={cn(
                        "flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs",
                        on ? "bg-primary/15 text-ink" : "text-muted hover:bg-surface",
                      )}
                    >
                      <span
                        className={cn(
                          "flex h-4 w-4 items-center justify-center rounded border text-[10px]",
                          on ? "border-primary bg-primary text-primary-fg" : "border-border",
                        )}
                      >
                        {on ? "✓" : ""}
                      </span>
                      @{a.username}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Caption */}
            <div>
              <label className="text-xs text-muted">Caption</label>
              <textarea
                value={captionText}
                onChange={(e) => setCaptionText(e.target.value)}
                rows={4}
                className="mt-1 w-full resize-y whitespace-pre-wrap rounded-xl border border-border bg-bg px-3 py-2 text-sm"
                placeholder="Edit caption and hashtags before posting…"
              />
            </div>

            {/* Privacy */}
            <div>
              <label className="text-xs text-muted">Privacy status</label>
              <GlassSelect
                aria-label="Privacy status"
                value={privacy}
                onChange={setPrivacy}
                disabled={creatorLoading || postingBlocked}
                size="md"
                className="mt-1"
                options={privacyOptions.map((p) => {
                  const disabled = brandedBlocksPrivate && p === "SELF_ONLY";
                  return {
                    value: p,
                    label: disabled
                      ? `${privacyLabel(p)} (unavailable for branded content)`
                      : privacyLabel(p),
                    disabled,
                  };
                })}
              />
              {brandedBlocksPrivate && privacy === "SELF_ONLY" && (
                <p className="mt-1 text-[11px] text-warning">
                  Branded content cannot be set to private.
                </p>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
              <label
                className={cn(
                  "flex items-center gap-2 text-xs",
                  creator?.comment_disabled ? "text-muted/50" : "text-ink",
                )}
              >
                <input
                  type="checkbox"
                  checked={allowComment && !creator?.comment_disabled}
                  disabled={Boolean(creator?.comment_disabled) || postingBlocked}
                  onChange={(e) => setAllowComment(e.target.checked)}
                />
                Allow comments
              </label>
              {isPhoto && (
                <label className="flex items-center gap-2 text-xs text-ink">
                  <input
                    type="checkbox"
                    checked={autoMusic}
                    disabled={postingBlocked}
                    onChange={(e) => setAutoMusic(e.target.checked)}
                  />
                  Auto-add music
                </label>
              )}
            </div>

            <details className="group rounded-lg border border-white/[0.06] p-3">
              <summary className="flex cursor-pointer list-none items-center justify-between text-xs font-medium text-ink marker:content-none [&::-webkit-details-marker]:hidden">
                Commercial disclosure & advanced settings
                <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted transition group-open:rotate-180" />
              </summary>
              <div className="mt-3 space-y-3 border-t border-white/[0.06] pt-3">
                <label className="flex items-center gap-2 text-xs text-ink">
                  <input
                    type="checkbox"
                    checked={commercial}
                    disabled={postingBlocked}
                    onChange={(e) => {
                      setCommercial(e.target.checked);
                      if (!e.target.checked) {
                        setYourBrand(false);
                        setBranded(false);
                      }
                    }}
                  />
                  Disclose commercial content
                </label>
                {commercial && (
                  <div className="ml-5 space-y-1.5">
                    <label className="flex items-center gap-2 text-xs text-muted">
                      <input
                        type="checkbox"
                        checked={yourBrand}
                        onChange={(e) => setYourBrand(e.target.checked)}
                      />
                      Your brand
                    </label>
                    <label className="flex items-center gap-2 text-xs text-muted">
                      <input
                        type="checkbox"
                        checked={branded}
                        onChange={(e) => setBranded(e.target.checked)}
                      />
                      Branded content
                    </label>
                    {commercialHint && (
                      <p className="text-[11px] text-primary">{commercialHint}</p>
                    )}
                    {commercialIncomplete && (
                      <p className="text-[11px] text-warning">
                        Select Your brand, Branded content, or both.
                      </p>
                    )}
                  </div>
                )}
                <label className="flex items-start gap-2 text-xs text-muted">
                  <input
                    type="checkbox"
                    className="mt-0.5"
                    checked={consentChecked}
                    disabled={postingBlocked}
                    onChange={(e) => setConsentChecked(e.target.checked)}
                  />
                  <span>
                    {consentText}{" "}
                    <a
                      href={TIKTOK_MUSIC_CONFIRMATION_URL}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-0.5 text-primary hover:underline"
                    >
                      Music Usage Confirmation
                      <ExternalLink className="h-3 w-3" />
                    </a>
                    {commercial && branded && (
                      <>
                        {" · "}
                        <a
                          href={TIKTOK_BRANDED_CONTENT_POLICY_URL}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-0.5 text-primary hover:underline"
                        >
                          Branded Content Policy
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      </>
                    )}
                  </span>
                </label>
              </div>
            </details>

            {progress && (
              <div className="space-y-1.5">
                <p className="text-xs text-primary">{progress}</p>
                {uploadTotal > 0 && (
                  <div className="h-1.5 overflow-hidden rounded-full bg-surface-2">
                    <div
                      className="h-full rounded-full bg-primary transition-all"
                      style={{ width: `${(uploadReady / uploadTotal) * 100}%` }}
                    />
                  </div>
                )}
              </div>
            )}
            {!progress && !busy && prepHint && !success && (
              <p className="text-xs text-muted">{prepHint}</p>
            )}
            {error && (
              <p className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger">
                {error}
              </p>
            )}
            {success && (
              <p className="rounded-lg border border-primary/30 bg-primary/10 px-3 py-2 text-xs text-primary">
                {success}
              </p>
            )}

            <div className="flex flex-col gap-2 pt-1">
              <Button
                className="w-full"
                disabled={!canSubmitDirect || busy}
                onClick={() => void runPublish("DIRECT_POST")}
              >
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Publish to TikTok"}
              </Button>
              <button
                type="button"
                className="text-center text-xs text-muted hover:text-ink disabled:opacity-40"
                disabled={!canSubmitInbox || busy}
                onClick={() => void runPublish("MEDIA_UPLOAD")}
              >
                Save as TikTok draft
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
