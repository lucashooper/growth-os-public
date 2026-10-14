"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Copy, FolderPlus, Loader2, Search, Trash2, Upload } from "lucide-react";
import { PageHeader, PageBody } from "@/components/page-header";
import { EmptyState, ErrorBlock, LoadingBlock } from "@/components/empty-state";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { PostCard } from "@/components/post-card";
import { DraftDrawer, type DraftPost } from "@/components/draft-drawer";
import { ImagePacksPanel } from "@/components/image-packs-panel";
import { FormatReferencesPanel } from "@/components/format-references-panel";
import { useProject } from "@/lib/project-context";
import { apiFetch, peekApi } from "@/lib/api-client";
import { invalidateApiCache } from "@/lib/api-cache";
import { cn } from "@/lib/utils";

type Asset = {
  id: string;
  name: string;
  kind: string;
  folder: string;
  url: string;
  mime: string;
  size: number;
  tags: string[];
  source: string;
  theme: string;
  createdAt: string;
  post?: {
    id: string;
    hook: string;
    coverUrl: string;
    shareUrl: string;
    views: number;
    likes: number;
    comments: number;
    publishedAt: string | null;
    status: string;
    caption?: string;
    slides?: string[];
    meta?: DraftPost["meta"];
    scheduledAt?: string | null;
  } | null;
};

type Tab = "generated" | "uploaded" | "published" | "archived" | "all";
type Section = "assets" | "packs" | "formats";

export default function LibraryPage() {
  const router = useRouter();
  const { project, projectId, loading: projectLoading } = useProject();
  const [section, setSection] = useState<Section>("assets");
  const libraryUrl =
    projectId != null
      ? `/api/library?${new URLSearchParams({ projectId }).toString()}`
      : null;
  const cached = libraryUrl
    ? peekApi<{ assets: Asset[]; folders: string[] }>(libraryUrl)
    : null;
  const [assets, setAssets] = useState<Asset[]>(() => cached?.assets ?? []);
  const [folders, setFolders] = useState<string[]>(
    () => cached?.folders ?? [],
  );
  const [folder, setFolder] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("all");
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(() => !cached);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [draft, setDraft] = useState<DraftPost | null>(null);

  const load = useCallback(async () => {
    if (!projectId) return;
    const params = new URLSearchParams({ projectId });
    if (folder != null) params.set("folder", folder);
    if (q) params.set("q", q);
    const url = `/api/library?${params}`;
    const stale = peekApi<{ assets: Asset[]; folders: string[] }>(url);
    // Only flash Loading… when we have nothing to show
    if (!stale) setLoading(true);
    const res = await apiFetch<{ assets: Asset[]; folders: string[] }>(url, {
      retries: 1,
    });
    if (!res.ok) setError(res.error);
    else {
      setAssets(res.data.assets);
      setFolders(res.data.folders);
      setError(null);
    }
    setLoading(false);
  }, [projectId, folder, q]);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    return assets.filter((a) => {
      if (tab === "all") return true;
      if (tab === "generated") return a.source === "generate" || a.kind === "generated";
      if (tab === "uploaded") return a.source === "upload";
      if (tab === "published") return a.post?.status === "published";
      if (tab === "archived")
        return a.folder === "archived" || a.tags?.includes("archived");
      return true;
    });
  }, [assets, tab]);

  async function uploadFiles(files: FileList | File[]) {
    if (!projectId) return;
    setUploading(true);
    setError(null);
    for (const file of Array.from(files)) {
      const form = new FormData();
      form.append("file", file);
      form.append("projectId", projectId);
      form.append("folder", folder || "uploads");
      const res = await fetch("/api/upload", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Upload failed");
        break;
      }
    }
    setUploading(false);
    invalidateApiCache("/api/library");
    await load();
  }

  async function remove(id: string) {
    const prev = assets;
    setAssets((a) => a.filter((x) => x.id !== id));
    const res = await apiFetch(`/api/library/${id}`, { method: "DELETE" });
    if (!res.ok) {
      setAssets(prev);
      setError(res.error);
    }
  }

  async function archive(id: string) {
    await apiFetch(`/api/library/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ folder: "archived", tags: ["archived"] }),
    });
    await load();
  }

  async function duplicate(asset: Asset) {
    if (!projectId || !asset.post) return;
    await apiFetch("/api/posts", {
      method: "POST",
      body: JSON.stringify({
        projectId,
        hook: `${asset.post.hook} (copy)`,
        caption: "",
        slides: [asset.post.hook],
        status: "draft",
        theme: asset.theme,
        saveToLibrary: true,
      }),
    });
    await load();
  }

  async function createFolder() {
    const name = window.prompt("Folder name");
    if (!name?.trim() || !projectId) return;
    // Placeholder asset marks the folder until real uploads land
    await apiFetch("/api/library", {
      method: "POST",
      body: JSON.stringify({
        projectId,
        name: `${name.trim()} (folder)`,
        kind: "folder",
        folder: name.trim(),
        url: "",
        path: "",
        tags: ["folder"],
        source: "upload",
      }),
    });
    setFolder(name.trim());
    await load();
  }

  if (projectLoading || !project) return <LoadingBlock />;

  return (
    <div className="flex min-h-full flex-col">
      <PageHeader
        title="Content Library"
        description={`${project.name} · assets · image packs`}
        action={
          section === "assets" ? (
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void createFolder()}
              className="inline-flex h-10 items-center gap-2 rounded-xl border border-border px-3 text-sm text-muted hover:text-ink"
            >
              <FolderPlus className="h-4 w-4" />
              Create folder
            </button>
            <label className="inline-flex">
              <input
                type="file"
                accept="image/*,video/*"
                multiple
                className="hidden"
                onChange={(e) => e.target.files && void uploadFiles(e.target.files)}
              />
              <span className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-xl bg-primary px-4 text-sm font-medium text-primary-fg">
                {uploading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Upload className="h-4 w-4" />
                )}
                Upload assets
              </span>
            </label>
          </div>
          ) : null
        }
      />

      <PageBody>
      <div className="mb-5 flex flex-wrap gap-2">
        {(
          [
            ["assets", "Assets"],
            ["packs", "Image Packs"],
            ["formats", "Format References"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setSection(id)}
            className={cn(
              "rounded-xl border px-4 py-2 text-sm font-medium",
              section === id
                ? "border-primary/40 bg-primary/15 text-primary"
                : "border-border text-muted",
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {section === "packs" && projectId ? (
        <ImagePacksPanel projectId={projectId} />
      ) : section === "formats" && projectId ? (
        <FormatReferencesPanel projectId={projectId} />
      ) : (
      <>
      {error && (
        <div className="mb-4">
          <ErrorBlock message={error} onRetry={load} />
        </div>
      )}

      <div className="mb-4 flex flex-wrap gap-2">
        {(
          [
            ["all", "All"],
            ["generated", "Generated"],
            ["uploaded", "Uploaded"],
            ["published", "Published"],
            ["archived", "Archived"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={cn(
              "rounded-full border px-3 py-1.5 text-xs",
              tab === id
                ? "border-primary/40 bg-primary/15 text-primary"
                : "border-border text-muted",
            )}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search assets…"
            className="h-10 w-full rounded-xl border border-border bg-bg pl-9 pr-3 text-sm"
          />
        </div>
        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() => setFolder(null)}
            className={cn(
              "rounded-full border px-2.5 py-1 text-[11px]",
              folder === null
                ? "border-primary/40 bg-primary/15 text-primary"
                : "border-border text-muted",
            )}
          >
            All folders
          </button>
          {folders.map((f) => (
            <button
              key={f || "root"}
              type="button"
              onClick={() => setFolder(f)}
              className={cn(
                "rounded-full border px-2.5 py-1 text-[11px]",
                folder === f
                  ? "border-primary/40 bg-primary/15 text-primary"
                  : "border-border text-muted",
              )}
            >
              {f || "Root"}
            </button>
          ))}
        </div>
      </div>

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          if (e.dataTransfer.files?.length) void uploadFiles(e.dataTransfer.files);
        }}
        className={cn(
          "rounded-2xl border border-dashed p-2 transition-colors",
          dragOver ? "border-primary/50 bg-primary/5" : "border-transparent",
        )}
      >
        {loading ? (
          <LoadingBlock />
        ) : filtered.length === 0 ? (
          <EmptyState
            title="Nothing here yet"
            description="Generate carousels or upload brand assets. Drag and drop works too."
          />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {filtered.map((a) => {
              if (a.kind === "folder") return null;
              const status =
                a.post?.status ||
                (a.folder === "archived" ? "archived" : a.source === "generate" ? "draft" : "asset");
              const openable = Boolean(a.post?.id);
              return (
                <Card
                  key={a.id}
                  className={cn(openable && "cursor-pointer transition hover:border-primary/35")}
                >
                  <CardContent className="space-y-2 p-3">
                    <button
                      type="button"
                      className="w-full text-left"
                      disabled={!openable}
                      onClick={async () => {
                        if (!a.post?.id) return;
                        const res = await apiFetch<{ post: DraftPost }>(
                          `/api/posts/${a.post.id}`,
                        );
                        if (res.ok) setDraft(res.data.post);
                        else {
                          setDraft({
                            id: a.post.id,
                            hook: a.post.hook,
                            coverUrl: a.post.coverUrl || a.url,
                            status: a.post.status,
                            caption: a.post.caption,
                          });
                        }
                      }}
                    >
                      {a.kind === "generated" && a.post ? (
                        <PostCard post={a.post} compact />
                      ) : a.kind === "video" ? (
                        <video
                          src={a.url}
                          className="aspect-video w-full rounded-lg bg-surface-2"
                          controls
                        />
                      ) : a.url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={a.url}
                          alt={a.name}
                          className="aspect-video w-full rounded-lg object-cover"
                        />
                      ) : (
                        <div className="flex aspect-video items-center justify-center rounded-lg bg-surface-2 text-xs text-muted">
                          No preview
                        </div>
                      )}
                      <div className="mt-2 min-w-0">
                        <p className="truncate text-sm font-medium text-ink">{a.name}</p>
                        <p className="text-[11px] text-muted">
                          {new Date(a.createdAt).toLocaleDateString()} · TikTok · {status}
                          {a.folder ? ` · ${a.folder}` : ""}
                        </p>
                        {openable && (
                          <p className="mt-1 text-[11px] text-primary">
                            Click to open · schedule or reopen
                          </p>
                        )}
                        <div className="mt-2 flex flex-wrap gap-1">
                          <Badge>{status}</Badge>
                          {(a.tags || []).slice(0, 3).map((t) => (
                            <Badge key={t}>{t}</Badge>
                          ))}
                        </div>
                      </div>
                    </button>
                    <div className="flex flex-wrap gap-2 text-[11px]">
                      {a.post && (
                        <button
                          type="button"
                          className="inline-flex items-center gap-1 text-muted hover:text-ink"
                          onClick={(e) => {
                            e.stopPropagation();
                            void duplicate(a);
                          }}
                        >
                          <Copy className="h-3 w-3" />
                          Duplicate
                        </button>
                      )}
                      <button
                        type="button"
                        className="text-muted hover:text-ink"
                        onClick={(e) => {
                          e.stopPropagation();
                          void archive(a.id);
                        }}
                      >
                        Archive
                      </button>
                      <button
                        type="button"
                        className="inline-flex items-center gap-1 text-muted hover:text-warning"
                        onClick={(e) => {
                          e.stopPropagation();
                          void remove(a.id);
                        }}
                      >
                        <Trash2 className="h-3 w-3" />
                        Delete
                      </button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
      </>
      )}

      </PageBody>
      <DraftDrawer
        post={draft}
        onClose={() => setDraft(null)}
        onScheduled={() => void load()}
        onDeleted={() => {
          setDraft(null);
          void load();
        }}
        onOpenInGenerator={(p) => {
          // Two history entries so Chrome back lands on Generator home, not Library
          router.push("/generate");
          window.setTimeout(() => {
            router.push(`/generate?path=scripts&history=1&draft=${p.id}`);
          }, 0);
        }}
      />
    </div>
  );
}
