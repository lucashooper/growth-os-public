"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Loader2, Plus, RefreshCw } from "lucide-react";
import { PageHeader, PageBody } from "@/components/page-header";
import { EmptyState, ErrorBlock, LoadingBlock } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { useProject } from "@/lib/project-context";
import { apiFetch } from "@/lib/api-client";
import { formatNumber } from "@/lib/utils";
import { GlassSelect } from "@/components/ui/glass-select";

type Competitor = {
  id: string;
  name: string;
  slug: string;
  kind: string;
  handle: string;
  niche: string;
  avatar: string;
  websiteUrl: string;
  appStoreUrl: string;
  playStoreUrl: string;
  followers: number;
  avgViews: number;
  topHook: string;
  postingFreq: string;
  aiSummary: string;
  lastSyncAt: string | null;
  lastError: string | null;
  _count?: { posts: number; assets: number };
};

const emptyForm = {
  name: "",
  handle: "",
  niche: "",
  websiteUrl: "",
  appStoreUrl: "",
  playStoreUrl: "",
  metaPageId: "",
  instagram: "",
  facebookPage: "",
  twitter: "",
  youtube: "",
  syncCadence: "manual",
};

export default function CompetitorsPage() {
  const { project, projectId, loading: projectLoading } = useProject();
  const [list, setList] = useState<Competitor[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [showAdd, setShowAdd] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    const res = await apiFetch<{ competitors: Competitor[] }>(
      `/api/competitors?projectId=${projectId}`,
      { retries: 1 },
    );
    if (!res.ok) setError(res.error);
    else {
      setList(res.data.competitors);
      setError(null);
    }
    setLoading(false);
  }, [projectId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function add() {
    if (!projectId) return;
    setAdding(true);
    setError(null);
    const res = await apiFetch<{ competitor: Competitor }>("/api/competitors", {
      method: "POST",
      body: JSON.stringify({
        projectId,
        ...form,
        sync: true,
      }),
    });
    setAdding(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setForm(emptyForm);
    setShowAdd(false);
    await load();
  }

  async function syncOne(id: string) {
    setBusyId(id);
    const res = await apiFetch(`/api/competitors/${id}/sync`, {
      method: "POST",
    });
    setBusyId(null);
    if (!res.ok) setError(res.error);
    await load();
  }

  if (projectLoading || !project) {
    return <LoadingBlock label="Loading project…" />;
  }

  return (
    <div className="flex min-h-full flex-col">
      <PageHeader
        title="Competitor Centre"
        description={`${project.name} · TikTok, websites, app stores, and ads in one intelligence layer`}
        action={
          <Button onClick={() => setShowAdd((s) => !s)}>
            <Plus className="mr-1.5 h-4 w-4" />
            Add competitor
          </Button>
        }
      />

      <PageBody className="space-y-6">
      {error && (
        <ErrorBlock message={error} onRetry={() => void load()} />
      )}

      {showAdd && (
        <Card>
          <CardContent className="grid gap-3 p-5 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="text-xs text-muted">Name</label>
              <input
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="Rosebud"
                className="mt-1.5 h-10 w-full rounded-xl border border-border bg-bg px-3 text-sm"
              />
            </div>
            <div>
              <label className="text-xs text-muted">TikTok handle</label>
              <input
                value={form.handle}
                onChange={(e) =>
                  setForm((f) => ({ ...f, handle: e.target.value }))
                }
                placeholder="@rosebud"
                className="mt-1.5 h-10 w-full rounded-xl border border-border bg-bg px-3 text-sm"
              />
            </div>
            <div>
              <label className="text-xs text-muted">Niche</label>
              <input
                value={form.niche}
                onChange={(e) =>
                  setForm((f) => ({ ...f, niche: e.target.value }))
                }
                placeholder="Mental wellness"
                className="mt-1.5 h-10 w-full rounded-xl border border-border bg-bg px-3 text-sm"
              />
            </div>
            <div>
              <label className="text-xs text-muted">Website</label>
              <input
                value={form.websiteUrl}
                onChange={(e) =>
                  setForm((f) => ({ ...f, websiteUrl: e.target.value }))
                }
                placeholder="https://…"
                className="mt-1.5 h-10 w-full rounded-xl border border-border bg-bg px-3 text-sm"
              />
            </div>
            <div>
              <label className="text-xs text-muted">App Store URL</label>
              <input
                value={form.appStoreUrl}
                onChange={(e) =>
                  setForm((f) => ({ ...f, appStoreUrl: e.target.value }))
                }
                placeholder="https://apps.apple.com/…/id…"
                className="mt-1.5 h-10 w-full rounded-xl border border-border bg-bg px-3 text-sm"
              />
            </div>
            <div>
              <label className="text-xs text-muted">Play Store URL</label>
              <input
                value={form.playStoreUrl}
                onChange={(e) =>
                  setForm((f) => ({ ...f, playStoreUrl: e.target.value }))
                }
                placeholder="https://play.google.com/store/apps/details?id=…"
                className="mt-1.5 h-10 w-full rounded-xl border border-border bg-bg px-3 text-sm"
              />
            </div>
            <div>
              <label className="text-xs text-muted">Meta page / search term</label>
              <input
                value={form.metaPageId}
                onChange={(e) =>
                  setForm((f) => ({ ...f, metaPageId: e.target.value }))
                }
                placeholder="Brand name for Ad Library"
                className="mt-1.5 h-10 w-full rounded-xl border border-border bg-bg px-3 text-sm"
              />
            </div>
            <div>
              <label className="text-xs text-muted">Instagram</label>
              <input
                value={form.instagram}
                onChange={(e) =>
                  setForm((f) => ({ ...f, instagram: e.target.value }))
                }
                placeholder="@brand"
                className="mt-1.5 h-10 w-full rounded-xl border border-border bg-bg px-3 text-sm"
              />
            </div>
            <div>
              <label className="text-xs text-muted">Facebook page</label>
              <input
                value={form.facebookPage}
                onChange={(e) =>
                  setForm((f) => ({ ...f, facebookPage: e.target.value }))
                }
                className="mt-1.5 h-10 w-full rounded-xl border border-border bg-bg px-3 text-sm"
              />
            </div>
            <div>
              <label className="text-xs text-muted">X / Twitter</label>
              <input
                value={form.twitter}
                onChange={(e) =>
                  setForm((f) => ({ ...f, twitter: e.target.value }))
                }
                className="mt-1.5 h-10 w-full rounded-xl border border-border bg-bg px-3 text-sm"
              />
            </div>
            <div>
              <label className="text-xs text-muted">YouTube</label>
              <input
                value={form.youtube}
                onChange={(e) =>
                  setForm((f) => ({ ...f, youtube: e.target.value }))
                }
                className="mt-1.5 h-10 w-full rounded-xl border border-border bg-bg px-3 text-sm"
              />
            </div>
            <div>
              <label className="text-xs text-muted">Sync cadence</label>
              <GlassSelect
                aria-label="Sync cadence"
                value={form.syncCadence}
                onChange={(v) =>
                  setForm((f) => ({ ...f, syncCadence: v }))
                }
                size="md"
                className="mt-1.5"
                options={[
                  { value: "manual", label: "Manual" },
                  { value: "daily", label: "Daily" },
                  { value: "weekly", label: "Weekly" },
                ]}
              />
            </div>
            <div className="flex items-end gap-2 sm:col-span-2">
              <Button onClick={() => void add()} disabled={adding}>
                {adding ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  "Add & sync"
                )}
              </Button>
              <Button variant="secondary" onClick={() => setShowAdd(false)}>
                Cancel
              </Button>
              <Link
                href="/deep-search"
                className="ml-auto text-xs text-primary hover:underline"
              >
                Or use Deep Search →
              </Link>
            </div>
          </CardContent>
        </Card>
      )}

      {loading ? (
        <LoadingBlock label="Loading competitors…" />
      ) : !list.length ? (
        <EmptyState
          title="No competitors yet"
          description="Add TikTok accounts, websites, or apps. Growth OS will ingest public data and generate AI summaries."
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {list.map((c) => {
            const label = c.name || (c.handle ? `@${c.handle}` : c.slug);
            const oneLiner =
              c.aiSummary
                ?.split("\n")
                .map((l) => l.replace(/^[•\-*]\s*/, "").trim())
                .find(Boolean) || c.topHook;
            return (
              <Card key={c.id} className="overflow-hidden">
                <CardContent className="space-y-3 p-5">
                  <div className="flex items-start gap-3">
                    {c.avatar ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={c.avatar}
                        alt=""
                        className="h-12 w-12 rounded-full object-cover"
                      />
                    ) : (
                      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-surface-2 text-sm text-muted">
                        {label.slice(0, 1).toUpperCase()}
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <Link
                        href={`/competitors/${c.id}`}
                        className="truncate text-base font-semibold text-ink hover:underline"
                      >
                        {label}
                      </Link>
                      <div className="mt-1 flex flex-wrap gap-1.5">
                        {c.handle && (
                          <Badge tone="default">@{c.handle}</Badge>
                        )}
                        {c.websiteUrl && <Badge tone="default">Web</Badge>}
                        {c.appStoreUrl && <Badge tone="default">iOS</Badge>}
                        {c.playStoreUrl && <Badge tone="default">Android</Badge>}
                        {c.postingFreq && (
                          <Badge tone="primary">{c.postingFreq}</Badge>
                        )}
                      </div>
                    </div>
                    <Button
                      variant="secondary"
                      size="sm"
                      disabled={busyId === c.id}
                      onClick={() => void syncOne(c.id)}
                    >
                      {busyId === c.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <RefreshCw className="h-3.5 w-3.5" />
                      )}
                    </Button>
                  </div>

                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div>
                      <p className="text-lg font-semibold text-ink">
                        {formatNumber(c.followers)}
                      </p>
                      <p className="text-[10px] uppercase tracking-wide text-muted">
                        Followers
                      </p>
                    </div>
                    <div>
                      <p className="text-lg font-semibold text-ink">
                        {formatNumber(c.avgViews)}
                      </p>
                      <p className="text-[10px] uppercase tracking-wide text-muted">
                        Avg views
                      </p>
                    </div>
                    <div>
                      <p className="text-lg font-semibold text-ink">
                        {c._count?.posts ?? 0}
                      </p>
                      <p className="text-[10px] uppercase tracking-wide text-muted">
                        Posts
                      </p>
                    </div>
                  </div>

                  {oneLiner && (
                    <p className="line-clamp-2 text-sm leading-relaxed text-muted">
                      {oneLiner}
                    </p>
                  )}

                  {c.lastError && (
                    <p className="text-[11px] text-danger">{c.lastError}</p>
                  )}

                  <div className="flex items-center justify-between pt-1">
                    <p className="text-[11px] text-muted">
                      {c.lastSyncAt
                        ? `Synced ${new Date(c.lastSyncAt).toLocaleString()}`
                        : "Never synced"}
                    </p>
                    <Link
                      href={`/competitors/${c.id}`}
                      className="text-xs font-medium text-primary hover:underline"
                    >
                      Open →
                    </Link>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
      </PageBody>
    </div>
  );
}
