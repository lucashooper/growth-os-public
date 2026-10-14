"use client";

import { useCallback, useEffect, useState } from "react";
import { BookOpen, Eye, LayoutList, Loader2, Plus, Trash2, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState, ErrorBlock, LoadingBlock } from "@/components/empty-state";
import { apiFetch } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import { GLASS_SHEET } from "@/components/ui/glass-select";

type FormatRef = {
  id: string;
  format: "storytelling" | "informational";
  title: string;
  hook: string;
  slides: string[];
  sourceUrl: string;
  coverUrl: string;
  structureNotes: string;
};

export function FormatReferencesPanel({ projectId }: { projectId: string }) {
  const [refs, setRefs] = useState<FormatRef[]>([]);
  const [filter, setFilter] = useState<"all" | "storytelling" | "informational">(
    "all",
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [format, setFormat] = useState<"storytelling" | "informational">(
    "informational",
  );
  const [title, setTitle] = useState("");
  const [hook, setHook] = useState("");
  const [slidesText, setSlidesText] = useState("");
  const [preview, setPreview] = useState<FormatRef | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await apiFetch<{ references: FormatRef[] }>(
      `/api/format-references?projectId=${projectId}`,
      { skipCache: true },
    );
    setLoading(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setRefs(res.data.references || []);
    setError(null);
  }, [projectId]);

  useEffect(() => {
    void load();
  }, [load]);

  const visible = refs.filter(
    (r) => filter === "all" || r.format === filter,
  );

  async function createManual() {
    const slides = slidesText
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);
    if (!hook.trim() && !slides.length) return;
    setBusy(true);
    const res = await apiFetch<{ reference: FormatRef }>(
      "/api/format-references",
      {
        method: "POST",
        body: JSON.stringify({
          projectId,
          format,
          title: title.trim() || hook.trim().slice(0, 80),
          hook: hook.trim(),
          slides,
          structureNotes: "Manual upload — match cadence; write fresh copy.",
        }),
      },
    );
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setTitle("");
    setHook("");
    setSlidesText("");
    await load();
  }

  async function uploadImages(files: FileList | null) {
    if (!files?.length) return;
    setBusy(true);
    setError(null);
    try {
      const uploaded: string[] = [];
      for (const file of Array.from(files)) {
        const body = new FormData();
        body.append("file", file);
        body.append("projectId", projectId);
        body.append("folder", `format-refs/${format}`);
        const res = await fetch("/api/upload", { method: "POST", body });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Upload failed");
        const url = data.data?.url || data.url;
        if (url) uploaded.push(url);
      }
      const res = await apiFetch<{ reference: FormatRef }>(
        "/api/format-references",
        {
          method: "POST",
          body: JSON.stringify({
            projectId,
            format,
            title: `${format} screenshot set`,
            hook: title.trim() || `${format} visual reference`,
            slides: [],
            coverUrl: uploaded[0] || "",
            structureNotes: `Visual reference images (${uploaded.length}). Match this format's cadence when generating.`,
          }),
        },
      );
      if (!res.ok) throw new Error(res.error);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    }
    setBusy(false);
  }

  async function remove(id: string) {
    await apiFetch(`/api/format-references/${id}`, { method: "DELETE" });
    setRefs((prev) => prev.filter((r) => r.id !== id));
    if (preview?.id === id) setPreview(null);
  }

  if (loading) return <LoadingBlock label="Loading format references…" />;

  return (
    <div className="space-y-4">
      {error && <ErrorBlock message={error} onRetry={load} />}

      <p className="text-sm text-muted">
        Upload storytelling or informational examples. The Generator uses them as
        few-shot structure — not as slide backgrounds.
      </p>

      <div className="flex flex-wrap gap-1.5">
        {(
          [
            ["all", "All", null],
            ["storytelling", "Storytelling", BookOpen],
            ["informational", "Informational", LayoutList],
          ] as const
        ).map(([id, label, Icon]) => (
          <button
            key={id}
            type="button"
            onClick={() => setFilter(id)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs",
              filter === id
                ? "border-primary/40 bg-primary/15 text-primary"
                : "border-border text-muted",
            )}
          >
            {Icon ? <Icon className="h-3.5 w-3.5" strokeWidth={1.75} /> : null}
            {label}
          </button>
        ))}
      </div>

      <div className="rounded-2xl border border-border bg-surface/20 p-4">
        <p className="mb-3 text-sm font-semibold text-ink">Add reference</p>
        <div className="mb-3 flex flex-wrap gap-1.5">
          {(
            [
              ["storytelling", "Storytelling", BookOpen],
              ["informational", "Informational", LayoutList],
            ] as const
          ).map(([id, label, Icon]) => (
            <button
              key={id}
              type="button"
              onClick={() => setFormat(id)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px]",
                format === id
                  ? "border-primary/40 bg-primary/15 text-primary"
                  : "border-border text-muted",
              )}
            >
              <Icon className="h-3.5 w-3.5" strokeWidth={1.75} />
              {label}
            </button>
          ))}
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Title (optional)"
            className="h-9 rounded-xl border border-border bg-bg px-3 text-sm"
          />
          <input
            value={hook}
            onChange={(e) => setHook(e.target.value)}
            placeholder="Hook line"
            className="h-9 rounded-xl border border-border bg-bg px-3 text-sm"
          />
        </div>
        <textarea
          value={slidesText}
          onChange={(e) => setSlidesText(e.target.value)}
          rows={4}
          placeholder={"One slide per line\nSlide 2 text…\nSlide 3 text…"}
          className="mt-2 w-full resize-y rounded-xl border border-border bg-bg px-3 py-2 text-sm"
        />
        <div className="mt-3 flex flex-wrap gap-2">
          <Button
            size="sm"
            className="gap-1.5"
            disabled={busy}
            onClick={() => void createManual()}
          >
            {busy ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Plus className="h-3.5 w-3.5" />
            )}
            Save text reference
          </Button>
          <label className="inline-flex">
            <input
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(e) => void uploadImages(e.target.files)}
            />
            <span className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-lg border border-border px-3 text-xs text-muted hover:text-ink">
              <Upload className="h-3.5 w-3.5" />
              Upload screenshots
            </span>
          </label>
        </div>
      </div>

      {visible.length === 0 ? (
        <EmptyState
          title="No format references yet"
          description="Import a TikTok URL from Generator, or paste slide text / screenshots here."
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {visible.map((r) => (
            <div
              key={r.id}
              className="group relative flex flex-col overflow-hidden rounded-xl border border-border bg-surface/30"
            >
              <button
                type="button"
                className="flex flex-1 items-start gap-3 p-3 text-left"
                onClick={() => setPreview(r)}
              >
                {r.coverUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={r.coverUrl}
                    alt=""
                    className="h-16 w-12 shrink-0 rounded-md object-cover"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <div className="flex h-16 w-12 shrink-0 items-center justify-center rounded-md bg-surface-2 text-muted">
                    {r.format === "storytelling" ? (
                      <BookOpen className="h-4 w-4" strokeWidth={1.75} />
                    ) : (
                      <LayoutList className="h-4 w-4" strokeWidth={1.75} />
                    )}
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-ink line-clamp-1">
                    {r.title || r.hook}
                  </p>
                  <p className="mt-0.5 line-clamp-2 text-xs text-muted">
                    {r.hook || r.structureNotes}
                  </p>
                  <p className="mt-1.5 text-[10px] text-muted">
                    {r.format} · {r.slides.length || 0} slides
                  </p>
                </div>
              </button>
              <div className="flex items-center justify-end gap-1 border-t border-border px-2 py-1.5">
                <button
                  type="button"
                  className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] text-muted hover:bg-surface-2 hover:text-ink"
                  onClick={() => setPreview(r)}
                >
                  <Eye className="h-3.5 w-3.5" /> Preview
                </button>
                <button
                  type="button"
                  className="rounded-md p-1.5 text-muted hover:bg-surface-2 hover:text-warning"
                  aria-label="Delete reference"
                  onClick={() => void remove(r.id)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {preview && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-black/65 p-4 backdrop-blur-[2px]"
          onClick={() => setPreview(null)}
          role="presentation"
        >
          <div
            className={cn(
              "max-h-[85vh] w-full max-w-md overflow-y-auto p-5",
              GLASS_SHEET,
            )}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
          >
            <div className="mb-3 flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-ink">
                  {preview.title || preview.hook}
                </p>
                <p className="mt-0.5 text-[11px] text-muted">
                  {preview.format} · {preview.slides.length} slides
                </p>
              </div>
              <button
                type="button"
                className="text-muted hover:text-ink"
                onClick={() => setPreview(null)}
                aria-label="Close preview"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            {preview.coverUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={preview.coverUrl}
                alt=""
                className="mb-3 max-h-48 w-full rounded-xl object-cover"
                referrerPolicy="no-referrer"
              />
            )}
            <p className="text-xs font-medium text-ink">Hook</p>
            <p className="mt-1 text-sm text-muted">{preview.hook || "—"}</p>
            {preview.slides.length > 0 && (
              <>
                <p className="mt-4 text-xs font-medium text-ink">Slides</p>
                <ol className="mt-1.5 list-decimal space-y-1.5 pl-4 text-xs text-muted">
                  {preview.slides.map((s, i) => (
                    <li key={`${i}-${s.slice(0, 20)}`}>{s}</li>
                  ))}
                </ol>
              </>
            )}
            {preview.sourceUrl && (
              <a
                href={preview.sourceUrl}
                target="_blank"
                rel="noreferrer"
                className="mt-4 block truncate text-[11px] text-primary hover:underline"
              >
                {preview.sourceUrl}
              </a>
            )}
            <div className="mt-4 flex justify-end gap-2">
              <Button
                size="sm"
                variant="secondary"
                className="gap-1.5 text-warning"
                onClick={() => void remove(preview.id)}
              >
                <Trash2 className="h-3.5 w-3.5" /> Delete
              </Button>
              <Button size="sm" onClick={() => setPreview(null)}>
                Close
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
