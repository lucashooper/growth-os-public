"use client";

import { useEffect, useState } from "react";
import { BookOpen, LayoutList, Loader2, Link2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import { GLASS_SHEET } from "@/components/ui/glass-select";

type FormatKind = "storytelling" | "informational";

type StructuredSlide = {
  slideNumber: number;
  hookOrHeading: string;
  body: string;
};

type Extracted = {
  hook: string;
  slides: string[];
  structuredSlides: StructuredSlide[];
  caption: string;
  coverUrl: string;
  slideImages: string[];
  slideCount: number;
  title: string;
  authorHandle: string;
  sourceUrl: string;
};

export function ImportTikTokReferenceModal({
  open,
  onClose,
  projectId,
  onSaved,
  defaultFormat = "informational",
}: {
  open: boolean;
  onClose: () => void;
  projectId?: string | null;
  onSaved?: (id: string) => void;
  defaultFormat?: FormatKind;
}) {
  const [url, setUrl] = useState("");
  const [referenceName, setReferenceName] = useState("");
  const [format, setFormat] = useState<FormatKind>(defaultFormat);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [preview, setPreview] = useState<Extracted | null>(null);

  useEffect(() => {
    if (open) setFormat(defaultFormat);
  }, [open, defaultFormat]);

  if (!open) return null;

  function resetAndClose() {
    setPreview(null);
    setError(null);
    setToast(null);
    setUrl("");
    setReferenceName("");
    onClose();
  }

  async function extract() {
    if (!projectId || !url.trim()) return;
    setBusy(true);
    setError(null);
    setToast(null);
    setPreview(null);
    try {
      const res = await apiFetch<{
        hook?: string;
        slides?: string[];
        structuredSlides?: StructuredSlide[];
        caption?: string;
        coverUrl?: string;
        slideImages?: string[];
        slideCount?: number;
        title?: string;
        authorHandle?: string;
        sourceUrl?: string;
      }>("/api/tiktok/reference-extract", {
        method: "POST",
        body: JSON.stringify({ url: url.trim(), projectId }),
      });

      if (!res.ok) {
        setError(res.error || "Could not extract this TikTok URL");
        return;
      }

      const structuredSlides = (res.data.structuredSlides || []).filter(
        (s) => s.hookOrHeading || s.body,
      );
      const slides = (res.data.slides || []).filter(Boolean);
      const hook =
        res.data.hook ||
        structuredSlides[0]?.hookOrHeading ||
        slides[0] ||
        "";
      const title =
        res.data.title ||
        (res.data.authorHandle
          ? `${res.data.authorHandle} — ${hook.slice(0, 60)}`
          : hook.slice(0, 80)) ||
        "TikTok reference";

      setPreview({
        hook,
        slides: slides.length ? slides : hook ? [hook] : [],
        structuredSlides,
        caption: res.data.caption || "",
        coverUrl: res.data.coverUrl || "",
        slideImages: res.data.slideImages || [],
        slideCount: res.data.slideCount || slides.length || 1,
        title,
        authorHandle: res.data.authorHandle || "",
        sourceUrl: res.data.sourceUrl || url.trim(),
      });
      if (!referenceName.trim()) {
        setReferenceName(title.slice(0, 80));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Extract failed");
    } finally {
      setBusy(false);
    }
  }

  async function confirmSave() {
    if (!projectId || !preview) return;
    const name =
      referenceName.trim() ||
      preview.title ||
      preview.hook.slice(0, 80) ||
      "TikTok reference";
    setBusy(true);
    setError(null);
    try {
      const save = await apiFetch<{ reference: { id: string } }>(
        "/api/format-references",
        {
          method: "POST",
          body: JSON.stringify({
            projectId,
            format,
            title: name.slice(0, 160),
            sourceUrl: preview.sourceUrl || url.trim(),
            hook: preview.hook,
            slides: preview.slides,
            coverUrl: preview.coverUrl || preview.slideImages[0] || "",
            structureNotes:
              format === "storytelling"
                ? "Match vulnerable arc cadence; write fresh copy over Image Pack."
                : "Match informational protocol cadence; write fresh copy.",
          }),
        },
      );
      if (!save.ok) {
        setError(save.error || "Failed to save reference");
        return;
      }
      setToast("Reference saved to your format library");
      onSaved?.(save.data.reference.id);
      window.setTimeout(() => {
        resetAndClose();
      }, 900);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  const previewSlides =
    preview?.structuredSlides?.length
      ? preview.structuredSlides
      : (preview?.slides || []).map((text, i) => ({
          slideNumber: i + 1,
          hookOrHeading: i === 0 ? text : text.split("\n")[0] || text,
          body: i === 0 ? "" : text.split("\n").slice(1).join("\n"),
        }));

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 p-4 backdrop-blur-[2px]">
      <div className={cn("flex max-h-[90vh] w-full max-w-lg flex-col", GLASS_SHEET)}>
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-border px-5 py-4">
          <div>
            <h2 className="text-sm font-semibold text-ink">
              Import TikTok Reference
            </h2>
            <p className="mt-1 text-xs text-muted">
              Extract hook, slides &amp; thumbnails — then save as a template
              archetype.
            </p>
          </div>
          <button
            type="button"
            className="text-muted hover:text-ink"
            onClick={resetAndClose}
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-4 overflow-y-auto px-5 py-4">
          <label className="block">
            <span className="mb-1.5 block text-[10px] font-medium uppercase tracking-wide text-muted">
              Reference name
            </span>
            <input
              value={referenceName}
              onChange={(e) => setReferenceName(e.target.value)}
              placeholder='e.g. "@desneigevents — Psychology Rules"'
              className="h-10 w-full rounded-xl border border-border bg-bg px-3 text-sm text-ink outline-none placeholder:text-muted/60 focus:border-primary/40"
            />
          </label>

          <label className="block">
            <span className="mb-1.5 block text-[10px] font-medium uppercase tracking-wide text-muted">
              TikTok carousel URL
            </span>
            <div className="flex items-center gap-2 rounded-xl border border-border bg-bg px-3">
              <Link2 className="h-4 w-4 shrink-0 text-muted" />
              <input
                value={url}
                onChange={(e) => {
                  setUrl(e.target.value);
                  setPreview(null);
                }}
                placeholder="https://www.tiktok.com/@…/photo/… or /video/…"
                className="h-10 w-full bg-transparent text-sm text-ink outline-none placeholder:text-muted/60"
              />
            </div>
          </label>

          <fieldset>
            <legend className="mb-1.5 text-[10px] font-medium uppercase tracking-wide text-muted">
              Format category
            </legend>
            <div className="flex flex-col gap-2 sm:flex-row">
              {(
                [
                  ["storytelling", "Storytelling", BookOpen],
                  ["informational", "Informational", LayoutList],
                ] as const
              ).map(([id, label, Icon]) => (
                <label
                  key={id}
                  className={cn(
                    "flex flex-1 cursor-pointer items-center gap-2.5 rounded-xl border px-3 py-2.5 text-xs font-medium",
                    format === id
                      ? "border-primary/40 bg-primary/15 text-primary"
                      : "border-border text-muted hover:text-ink",
                  )}
                >
                  <input
                    type="radio"
                    name="format-category"
                    checked={format === id}
                    onChange={() => setFormat(id)}
                    className="accent-primary"
                  />
                  <Icon className="h-3.5 w-3.5 shrink-0" strokeWidth={1.75} />
                  {label}
                </label>
              ))}
            </div>
          </fieldset>

          {preview && (
            <div className="rounded-xl border border-primary/25 bg-primary/5 p-3">
              <p className="text-[10px] font-medium uppercase tracking-wide text-primary">
                Extracted preview
              </p>
              <p className="mt-2 text-[10px] font-medium uppercase tracking-wide text-muted">
                Hook (slide 1)
              </p>
              <p className="mt-1 text-sm font-medium leading-snug text-ink">
                {preview.hook || "—"}
              </p>
              <p className="mt-2 text-[11px] text-muted">
                {preview.slideCount} slides detected
                {preview.slideImages.length
                  ? ` · ${preview.slideImages.length} thumbnails`
                  : ""}
              </p>
              {previewSlides.length > 0 && (
                <ol className="mt-3 max-h-56 space-y-2 overflow-y-auto">
                  {previewSlides.map((slide, i) => {
                    const thumb =
                      preview.slideImages[i] ||
                      (i === 0 ? preview.coverUrl : "");
                    return (
                      <li
                        key={`${slide.slideNumber}-${i}`}
                        className="flex gap-2.5 rounded-lg border border-border/60 bg-bg/40 p-2"
                      >
                        {thumb ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={thumb}
                            alt={`Slide ${slide.slideNumber}`}
                            className="h-16 w-12 shrink-0 rounded-md object-cover ring-1 ring-border"
                            referrerPolicy="no-referrer"
                          />
                        ) : (
                          <div className="flex h-16 w-12 shrink-0 items-center justify-center rounded-md bg-bg text-[10px] text-muted ring-1 ring-border">
                            {slide.slideNumber}
                          </div>
                        )}
                        <div className="min-w-0 flex-1">
                          <p className="text-[10px] font-medium uppercase tracking-wide text-muted">
                            Slide {slide.slideNumber}
                          </p>
                          {slide.hookOrHeading ? (
                            <p className="mt-0.5 text-[12px] font-semibold leading-snug text-ink">
                              {slide.hookOrHeading}
                            </p>
                          ) : null}
                          {slide.body ? (
                            <p className="mt-0.5 text-[11px] leading-snug text-muted">
                              {slide.body}
                            </p>
                          ) : !slide.hookOrHeading ? (
                            <p className="mt-0.5 text-[12px] leading-snug text-ink">
                              —
                            </p>
                          ) : null}
                        </div>
                      </li>
                    );
                  })}
                </ol>
              )}
            </div>
          )}

          {error && <p className="text-xs text-warning">{error}</p>}
          {toast && <p className="text-xs text-primary">{toast}</p>}
        </div>

        <div className="flex shrink-0 justify-end gap-2 border-t border-border px-5 py-3">
          <Button variant="secondary" size="sm" onClick={resetAndClose}>
            Cancel
          </Button>
          {!preview ? (
            <Button
              size="sm"
              disabled={busy || !url.trim() || !projectId}
              onClick={() => void extract()}
              className="gap-1.5"
            >
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
              Extract preview
            </Button>
          ) : (
            <Button
              size="sm"
              disabled={busy || !projectId}
              onClick={() => void confirmSave()}
              className="gap-1.5"
            >
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
              Confirm &amp; save
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
