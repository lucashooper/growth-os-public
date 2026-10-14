"use client";

import { useCallback, useEffect, useState } from "react";
import {
  DragDropContext,
  Droppable,
  Draggable,
  type DropResult,
} from "@hello-pangea/dnd";
import {
  Eye,
  EyeOff,
  FolderOpen,
  GripVertical,
  Images,
  Loader2,
  Pencil,
  Plus,
  Trash2,
  Upload,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { EmptyState, ErrorBlock, LoadingBlock } from "@/components/empty-state";
import { apiFetch } from "@/lib/api-client";
import { cn } from "@/lib/utils";

type PackAsset = {
  id: string;
  label: string;
  url: string;
  kind: string;
  sortOrder: number;
  tags?: string[];
  description?: string;
  includedInSequence?: boolean;
};

type Pack = {
  id: string;
  name: string;
  slug: string;
  description: string;
  orderMode: string;
  imageCount: number;
  assets: PackAsset[];
};

type LibraryAsset = {
  id: string;
  name: string;
  url: string;
  path?: string;
  kind: string;
};

type PackForm = {
  mode: "create" | "edit";
  name: string;
  description: string;
};

const KIND_OPTIONS = [
  { id: "background", label: "Background" },
  { id: "product", label: "Product slide" },
  { id: "mockup", label: "Mockup / CTA" },
] as const;

export function ImagePacksPanel({ projectId }: { projectId: string }) {
  const [packs, setPacks] = useState<Pack[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<PackForm>({
    mode: "create",
    name: "",
    description: "",
  });
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [libraryAssets, setLibraryAssets] = useState<LibraryAsset[]>([]);
  const [libraryLoading, setLibraryLoading] = useState(false);
  const [selectedLibrary, setSelectedLibrary] = useState<Set<string>>(new Set());
  const [confirmDelete, setConfirmDelete] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await apiFetch<{ packs: Pack[] }>(
      `/api/image-packs?projectId=${projectId}`,
      { skipCache: true },
    );
    if (!res.ok) setError(res.error);
    else {
      setPacks(res.data.packs);
      setActiveId((prev) => {
        if (prev && res.data.packs.some((p) => p.id === prev)) return prev;
        return res.data.packs[0]?.id || null;
      });
      setError(null);
    }
    setLoading(false);
  }, [projectId]);

  useEffect(() => {
    void load();
  }, [load]);

  const active = packs.find((p) => p.id === activeId) || null;

  function patchActiveAssets(
    packId: string,
    assetId: string,
    patch: Partial<PackAsset>,
  ) {
    setPacks((prev) =>
      prev.map((p) =>
        p.id !== packId
          ? p
          : {
              ...p,
              assets: p.assets.map((a) =>
                a.id === assetId ? { ...a, ...patch } : a,
              ),
            },
      ),
    );
  }

  function openCreate() {
    setForm({ mode: "create", name: "", description: "" });
    setFormOpen(true);
  }

  function openRename() {
    if (!active) return;
    setForm({
      mode: "edit",
      name: active.name,
      description: active.description || "",
    });
    setFormOpen(true);
  }

  async function saveForm() {
    if (!form.name.trim()) return;
    setBusy(true);
    if (form.mode === "create") {
      const res = await apiFetch<{ pack: Pack }>("/api/image-packs", {
        method: "POST",
        body: JSON.stringify({
          projectId,
          name: form.name.trim(),
          description: form.description.trim(),
          orderMode: "sequential",
        }),
      });
      setBusy(false);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setFormOpen(false);
      await load();
      setActiveId(res.data.pack.id);
      return;
    }
    if (!active) {
      setBusy(false);
      return;
    }
    const res = await apiFetch<{ pack: Pack }>(`/api/image-packs/${active.id}`, {
      method: "PATCH",
      body: JSON.stringify({
        name: form.name.trim(),
        description: form.description.trim(),
      }),
    });
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setPacks((prev) => prev.map((p) => (p.id === active.id ? res.data.pack : p)));
    setFormOpen(false);
  }

  async function saveDescription(description: string) {
    if (!active) return;
    const res = await apiFetch<{ pack: Pack }>(`/api/image-packs/${active.id}`, {
      method: "PATCH",
      body: JSON.stringify({ description }),
    });
    if (res.ok) {
      setPacks((prev) => prev.map((p) => (p.id === active.id ? res.data.pack : p)));
    }
  }

  async function setOrderMode(mode: string) {
    if (!active) return;
    const res = await apiFetch<{ pack: Pack }>(`/api/image-packs/${active.id}`, {
      method: "PATCH",
      body: JSON.stringify({ orderMode: mode }),
    });
    if (res.ok) {
      setPacks((prev) => prev.map((p) => (p.id === active.id ? res.data.pack : p)));
    }
  }

  async function uploadToPack(files: FileList | File[]) {
    if (!active) return;
    const packId = active.id;
    // Re-verify pack still exists before uploading (avoids 404 after stale UI state)
    const check = await apiFetch<{ pack: Pack }>(`/api/image-packs/${packId}`, {
      skipCache: true,
    });
    if (!check.ok) {
      setError(
        check.status === 404
          ? "That image pack no longer exists. Refreshing list…"
          : check.error || "Pack not found",
      );
      await load();
      return;
    }

    setBusy(true);
    setError(null);
    const list = Array.from(files);
    try {
      const uploaded = await Promise.all(
        list.map(async (file) => {
          const body = new FormData();
          body.append("file", file);
          body.append("projectId", projectId);
          body.append("folder", `packs/${active.slug}`);
          const res = await fetch("/api/upload", { method: "POST", body });
          const data = await res.json();
          if (!res.ok) {
            throw new Error(data.error || `Upload failed for ${file.name}`);
          }
          const payload = data.data || data;
          const url = payload.url || payload.asset?.url;
          if (!url) throw new Error(`No URL returned for ${file.name}`);
          const label =
            file.name
              .replace(/\.[^.]+$/, "")
              .toLowerCase()
              .replace(/[^a-z0-9]+/g, "-")
              .replace(/^-|-$/g, "")
              .slice(0, 64) || "image";
          return {
            label,
            url,
            path: payload.path || payload.url || "",
            tags: label.split("-").filter((t) => t.length > 2).slice(0, 6),
            description: label.replace(/-/g, " "),
          };
        }),
      );

      const res = await apiFetch<{ pack: Pack }>(`/api/image-packs/${packId}`, {
        method: "PATCH",
        body: JSON.stringify({ addAssets: uploaded }),
        skipCache: true,
      });
      if (res.ok) {
        setPacks((prev) =>
          prev.map((p) => (p.id === packId ? res.data.pack : p)),
        );
      } else {
        setError(res.error || "Failed to attach images to pack");
        await load();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    }
    setBusy(false);
  }

  async function openLibraryPicker() {
    if (!active) return;
    setLibraryOpen(true);
    setSelectedLibrary(new Set());
    setLibraryLoading(true);
    const res = await apiFetch<{ assets: LibraryAsset[] }>(
      `/api/library?projectId=${projectId}`,
    );
    setLibraryLoading(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setLibraryAssets(
      (res.data.assets || []).filter(
        (a) => a.kind !== "folder" && Boolean(a.url),
      ),
    );
  }

  async function addFromLibrary() {
    if (!active || !selectedLibrary.size) return;
    setBusy(true);
    const chosen = libraryAssets.filter((a) => selectedLibrary.has(a.id));
    const res = await apiFetch<{ pack: Pack }>(`/api/image-packs/${active.id}`, {
      method: "PATCH",
      body: JSON.stringify({
        addAssets: chosen.map((a) => ({
          label: a.name,
          url: a.url,
          path: a.path || "",
          kind: "background",
        })),
      }),
    });
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setPacks((prev) => prev.map((p) => (p.id === active.id ? res.data.pack : p)));
    setLibraryOpen(false);
  }

  async function setAssetKind(assetId: string, kind: string) {
    if (!active) return;
    const packId = active.id;
    const prev = active.assets.find((a) => a.id === assetId);
    if (!prev || prev.kind === kind) return;

    patchActiveAssets(packId, assetId, { kind });

    const res = await apiFetch<{ pack: Pack }>(`/api/image-packs/${packId}`, {
      method: "PATCH",
      body: JSON.stringify({ updateAssets: [{ id: assetId, kind }] }),
    });
    if (res.ok) {
      setPacks((p) => p.map((x) => (x.id === packId ? res.data.pack : x)));
    } else {
      patchActiveAssets(packId, assetId, { kind: prev.kind });
      setError(res.error || "Failed to update image role");
    }
  }

  async function toggleIncluded(assetId: string) {
    if (!active) return;
    const packId = active.id;
    const prev = active.assets.find((a) => a.id === assetId);
    if (!prev) return;
    const next = prev.includedInSequence === false;
    patchActiveAssets(packId, assetId, { includedInSequence: next });

    const res = await apiFetch<{ pack: Pack }>(`/api/image-packs/${packId}`, {
      method: "PATCH",
      body: JSON.stringify({
        updateAssets: [{ id: assetId, includedInSequence: next }],
      }),
    });
    if (res.ok) {
      setPacks((p) => p.map((x) => (x.id === packId ? res.data.pack : x)));
    } else {
      patchActiveAssets(packId, assetId, {
        includedInSequence: prev.includedInSequence,
      });
      setError(res.error || "Failed to update inclusion");
    }
  }

  async function saveAssetDescription(assetId: string, description: string) {
    if (!active) return;
    const packId = active.id;
    const prev = active.assets.find((a) => a.id === assetId);
    if (!prev || (prev.description || "") === description) return;

    patchActiveAssets(packId, assetId, { description });

    const res = await apiFetch<{ pack: Pack }>(`/api/image-packs/${packId}`, {
      method: "PATCH",
      body: JSON.stringify({
        updateAssets: [{ id: assetId, description }],
      }),
    });
    if (res.ok) {
      setPacks((p) => p.map((x) => (x.id === packId ? res.data.pack : x)));
    } else {
      patchActiveAssets(packId, assetId, {
        description: prev.description,
      });
      setError(res.error || "Failed to save description");
    }
  }

  async function removeAsset(assetId: string) {
    if (!active) return;
    const res = await apiFetch<{ pack: Pack }>(`/api/image-packs/${active.id}`, {
      method: "PATCH",
      body: JSON.stringify({ removeAssetIds: [assetId] }),
    });
    if (res.ok) {
      setPacks((prev) => prev.map((p) => (p.id === active.id ? res.data.pack : p)));
    }
  }

  async function onDragEnd(result: DropResult) {
    if (!active || !result.destination) return;
    const from = result.source.index;
    const to = result.destination.index;
    if (from === to) return;

    const packId = active.id;
    const previousAssets = active.assets;
    const nextAssets = Array.from(previousAssets);
    const [moved] = nextAssets.splice(from, 1);
    if (!moved) return;
    nextAssets.splice(to, 0, moved);
    const ids = nextAssets.map((a) => a.id);

    setPacks((prev) =>
      prev.map((p) =>
        p.id !== packId
          ? p
          : {
              ...p,
              assets: nextAssets.map((a, i) => ({ ...a, sortOrder: i })),
            },
      ),
    );

    const res = await apiFetch<{ pack: Pack }>(`/api/image-packs/${packId}`, {
      method: "PATCH",
      body: JSON.stringify({ assetOrder: ids }),
    });
    if (res.ok) {
      setPacks((prev) => prev.map((p) => (p.id === packId ? res.data.pack : p)));
    } else {
      setPacks((prev) =>
        prev.map((p) =>
          p.id !== packId ? p : { ...p, assets: previousAssets },
        ),
      );
      setError(res.error || "Failed to reorder images");
    }
  }

  async function deletePack() {
    if (!active) return;
    await apiFetch(`/api/image-packs/${active.id}`, { method: "DELETE" });
    setConfirmDelete(false);
    setActiveId(null);
    await load();
  }

  if (loading) return <LoadingBlock label="Loading image packs…" />;

  return (
    <div className="space-y-4">
      {error && <ErrorBlock message={error} onRetry={load} />}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted">
          Named packs the Generator uses for exact slide backgrounds
        </p>
        <Button size="sm" className="gap-1.5" disabled={busy} onClick={openCreate}>
          <Plus className="h-3.5 w-3.5" /> New pack
        </Button>
      </div>

      {packs.length === 0 ? (
        <EmptyState
          title="No image packs"
          description="Create a Philosopher, Nature, or Product pack and drop images in."
        />
      ) : (
        <div className="grid gap-4 lg:grid-cols-[240px_1fr]">
          <div className="space-y-1.5">
            {packs.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setActiveId(p.id)}
                className={cn(
                  "flex w-full items-center justify-between rounded-xl border px-3 py-2.5 text-left text-sm",
                  activeId === p.id
                    ? "border-primary/40 bg-primary/10 text-ink"
                    : "border-border text-muted hover:text-ink",
                )}
              >
                <span className="flex min-w-0 items-start gap-2">
                  <Images
                    className="mt-0.5 h-4 w-4 shrink-0 text-muted"
                    strokeWidth={1.75}
                  />
                  <span className="min-w-0">
                    <span className="block truncate">{p.name}</span>
                    <span className="mt-0.5 block text-[11px] text-muted">
                      {p.imageCount} images
                    </span>
                  </span>
                </span>
              </button>
            ))}
          </div>

          {active && (
            <div className="rounded-2xl border border-border p-4">
              <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <Images className="h-4 w-4 text-muted" strokeWidth={1.75} />
                    <h3 className="text-base font-semibold text-ink">{active.name}</h3>
                    <button
                      type="button"
                      onClick={openRename}
                      className="rounded-md p-1 text-muted hover:bg-surface-2 hover:text-ink"
                      title="Rename pack"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <p className="text-[11px] text-muted">Image pack · {active.slug}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="secondary"
                    className="gap-1.5"
                    onClick={() => void openLibraryPicker()}
                  >
                    <FolderOpen className="h-3.5 w-3.5" />
                    From library
                  </Button>
                  <label className="inline-flex">
                    <input
                      type="file"
                      accept="image/*"
                      multiple
                      className="hidden"
                      onChange={(e) => e.target.files && void uploadToPack(e.target.files)}
                    />
                    <span className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-lg bg-primary px-3 text-xs font-medium text-primary-fg">
                      {busy ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Upload className="h-3.5 w-3.5" />
                      )}
                      Upload
                    </span>
                  </label>
                  <Button size="sm" variant="ghost" onClick={() => setConfirmDelete(true)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>

              <label className="mb-4 block">
                <span className="mb-1.5 block text-[10px] font-medium uppercase tracking-wide text-muted">
                  Pack description
                </span>
                <textarea
                  key={active.id}
                  defaultValue={active.description || ""}
                  rows={2}
                  placeholder="e.g. Dark philosophical portraits, soft grain, stoic mood — never bright UI."
                  className="w-full resize-none rounded-xl border border-border bg-bg px-3 py-2 text-xs text-ink placeholder:text-muted/70"
                  onBlur={(e) => {
                    if (e.target.value !== (active.description || "")) {
                      void saveDescription(e.target.value);
                    }
                  }}
                />
                <span className="mt-1 block text-[10px] text-muted">
                  Sent to the Generator so AI matches this pack&apos;s visual style.
                </span>
              </label>

              <p className="mb-2 text-[10px] font-medium uppercase tracking-wide text-muted">
                Slide order
              </p>
              <div className="mb-4 flex flex-wrap gap-1.5">
                {(
                  [
                    ["sequential", "Sequential"],
                    ["random", "Random"],
                    ["ai", "AI chooses best"],
                  ] as const
                ).map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setOrderMode(id)}
                    className={cn(
                      "rounded-full border px-2.5 py-1 text-[11px]",
                      active.orderMode === id
                        ? "border-primary/40 bg-primary/15 text-primary"
                        : "border-border text-muted",
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>

              <DragDropContext onDragEnd={(result) => void onDragEnd(result)}>
                <Droppable droppableId={`pack-assets-${active.id}`}>
                  {(droppableProvided) => (
                    <div
                      ref={droppableProvided.innerRef}
                      {...droppableProvided.droppableProps}
                      className="space-y-3"
                    >
                      {active.assets.map((a, i) => {
                        const included = a.includedInSequence !== false;
                        return (
                          <Draggable key={a.id} draggableId={a.id} index={i}>
                            {(draggableProvided, snapshot) => (
                              <div
                                ref={draggableProvided.innerRef}
                                {...draggableProvided.draggableProps}
                                className={cn(
                                  "flex items-center gap-3 rounded-xl border border-border bg-surface/30 p-2 transition-opacity",
                                  !included && "opacity-45",
                                  snapshot.isDragging && "shadow-md ring-1 ring-primary/30",
                                )}
                              >
                                <span
                                  className="shrink-0 cursor-grab touch-none text-muted active:cursor-grabbing"
                                  aria-label="Drag to reorder"
                                  {...draggableProvided.dragHandleProps}
                                >
                                  <GripVertical className="h-4 w-4" />
                                </span>
                                <div className="w-16 shrink-0 text-[11px] font-medium text-muted">
                                  Slide {i + 1}
                                </div>
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img
                                  src={a.url}
                                  alt={a.label}
                                  className="h-14 w-12 rounded-md object-cover"
                                  referrerPolicy="no-referrer"
                                />
                                <div className="min-w-0 flex-1">
                                  <p className="truncate text-sm text-ink">{a.label}</p>
                                  <input
                                    key={`${a.id}-desc`}
                                    defaultValue={a.description || ""}
                                    placeholder="Quick context e.g. skincare towel mirror selfie"
                                    className="mt-1 w-full rounded-lg border border-border bg-bg px-2 py-1 text-[11px] text-ink placeholder:text-muted/70"
                                    onBlur={(e) => {
                                      void saveAssetDescription(a.id, e.target.value);
                                    }}
                                  />
                                  <div className="mt-1 flex flex-wrap gap-1">
                                    {KIND_OPTIONS.map((k) => (
                                      <button
                                        key={k.id}
                                        type="button"
                                        onClick={() => void setAssetKind(a.id, k.id)}
                                        className={cn(
                                          "rounded-full border px-2 py-0.5 text-[10px]",
                                          a.kind === k.id
                                            ? "border-primary/40 bg-primary/15 text-primary"
                                            : "border-border text-muted hover:text-ink",
                                        )}
                                        title={
                                          k.id === "product"
                                            ? "No heavy text overlay when generating"
                                            : undefined
                                        }
                                      >
                                        {k.label}
                                      </button>
                                    ))}
                                  </div>
                                </div>
                                <button
                                  type="button"
                                  className="text-muted hover:text-ink"
                                  title={
                                    included
                                      ? "Exclude from sequence"
                                      : "Include in sequence"
                                  }
                                  onClick={() => void toggleIncluded(a.id)}
                                >
                                  {included ? (
                                    <Eye className="h-3.5 w-3.5" />
                                  ) : (
                                    <EyeOff className="h-3.5 w-3.5" />
                                  )}
                                </button>
                                <button
                                  type="button"
                                  className="text-muted hover:text-warning"
                                  onClick={() => void removeAsset(a.id)}
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            )}
                          </Draggable>
                        );
                      })}
                      {droppableProvided.placeholder}
                      {!active.assets.length && (
                        <p className="py-8 text-center text-xs text-muted">
                          Upload or add from library — images become slide backgrounds.
                        </p>
                      )}
                    </div>
                  )}
                </Droppable>
              </DragDropContext>
            </div>
          )}
        </div>
      )}

      <Modal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title={form.mode === "create" ? "New image pack" : "Edit pack"}
        description="Name and describe the visual style for the Generator."
      >
        <div className="space-y-3">
          <label className="block">
            <span className="text-xs text-muted">Name</span>
            <input
              autoFocus
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              onKeyDown={(e) => {
                if (e.key === "Enter") void saveForm();
              }}
              placeholder="e.g. Philosopher, Purple UI"
              className="mt-1 h-10 w-full rounded-xl border border-border bg-bg px-3 text-sm text-ink"
            />
          </label>
          <label className="block">
            <span className="text-xs text-muted">Description (optional)</span>
            <textarea
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              rows={3}
              placeholder="Mood, lighting, what these images are for…"
              className="mt-1 w-full resize-none rounded-xl border border-border bg-bg px-3 py-2 text-sm text-ink"
            />
          </label>
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="secondary" size="sm" onClick={() => setFormOpen(false)}>
              Cancel
            </Button>
            <Button
              size="sm"
              disabled={busy || !form.name.trim()}
              onClick={() => void saveForm()}
            >
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
              {form.mode === "create" ? "Create pack" : "Save"}
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        open={libraryOpen}
        onClose={() => setLibraryOpen(false)}
        title="Add from library"
        description="Select assets already uploaded to this project."
        className="max-w-lg"
      >
        {libraryLoading ? (
          <LoadingBlock label="Loading assets…" />
        ) : libraryAssets.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted">
            No library images yet — upload some under Assets first.
          </p>
        ) : (
          <div className="space-y-3">
            <div className="grid max-h-[50vh] grid-cols-3 gap-2 overflow-y-auto sm:grid-cols-4">
              {libraryAssets.map((a) => {
                const on = selectedLibrary.has(a.id);
                return (
                  <button
                    key={a.id}
                    type="button"
                    onClick={() =>
                      setSelectedLibrary((prev) => {
                        const next = new Set(prev);
                        if (next.has(a.id)) next.delete(a.id);
                        else next.add(a.id);
                        return next;
                      })
                    }
                    className={cn(
                      "overflow-hidden rounded-xl border text-left",
                      on ? "border-primary ring-1 ring-primary/40" : "border-border",
                    )}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={a.url}
                      alt={a.name}
                      className="aspect-[3/4] w-full object-cover"
                      referrerPolicy="no-referrer"
                    />
                    <p className="truncate px-1.5 py-1 text-[10px] text-muted">{a.name}</p>
                  </button>
                );
              })}
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="secondary" size="sm" onClick={() => setLibraryOpen(false)}>
                Cancel
              </Button>
              <Button
                size="sm"
                disabled={!selectedLibrary.size || busy}
                onClick={() => void addFromLibrary()}
              >
                Add {selectedLibrary.size || ""} selected
              </Button>
            </div>
          </div>
        )}
      </Modal>

      <Modal
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title="Delete pack?"
        description={
          active
            ? `“${active.name}” and its slide list will be removed. Library uploads are kept.`
            : undefined
        }
      >
        <div className="flex justify-end gap-2">
          <Button variant="secondary" size="sm" onClick={() => setConfirmDelete(false)}>
            Cancel
          </Button>
          <Button size="sm" variant="danger" onClick={() => void deletePack()}>
            Delete pack
          </Button>
        </div>
      </Modal>
    </div>
  );
}
