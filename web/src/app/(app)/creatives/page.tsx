"use client";

import { useCallback, useEffect, useState } from "react";
import { PageHeader, PageBody } from "@/components/page-header";
import { EmptyState, ErrorBlock, LoadingBlock } from "@/components/empty-state";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useProject } from "@/lib/project-context";
import { apiFetch, peekApi } from "@/lib/api-client";
import { MediaImg } from "@/components/media-img";
import { GlassSelect } from "@/components/ui/glass-select";

type Creative = {
  id: string;
  source: string;
  kind: string;
  title: string;
  hook: string;
  cta: string;
  copy: string;
  mediaUrl: string;
  colourPalette: string;
  competitor: { id: string; name: string; handle: string } | null;
};

export default function CreativeLibraryPage() {
  const { projectId, loading: projectLoading } = useProject();
  const cached = projectId
    ? peekApi<{ creatives: Creative[] }>(`/api/creatives?projectId=${projectId}`)
    : null;
  const [creatives, setCreatives] = useState<Creative[]>(
    () => cached?.creatives ?? [],
  );
  const [q, setQ] = useState("");
  const [source, setSource] = useState("");
  const [loading, setLoading] = useState(() => !cached);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!projectId) return;
    const params = new URLSearchParams({ projectId });
    if (q) params.set("q", q);
    if (source) params.set("source", source);
    const url = `/api/creatives?${params}`;
    if (!peekApi(url)) setLoading(true);
    const res = await apiFetch<{ creatives: Creative[] }>(url);
    if (!res.ok) setError(res.error);
    else {
      setCreatives(res.data.creatives);
      setError(null);
    }
    setLoading(false);
  }, [projectId, q, source]);

  useEffect(() => {
    void load();
  }, [load]);

  if (projectLoading) return <LoadingBlock label="Loading…" />;

  return (
    <div className="flex min-h-full flex-col">
      <PageHeader
        title="Creative Library"
        description="Searchable ads, TikTok covers, and screenshots from the intelligence engine"
      />

      <PageBody className="space-y-6">
      <div className="grid gap-2 sm:grid-cols-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search hook, CTA, copy…"
          className="h-10 rounded-xl border border-border bg-bg px-3 text-sm"
        />
        <GlassSelect
          aria-label="Source"
          value={source}
          onChange={setSource}
          size="md"
          placeholder="All sources"
          options={[
            { value: "", label: "All sources" },
            { value: "tiktok", label: "TikTok" },
            { value: "meta_ads", label: "Meta Ads" },
            { value: "website", label: "Website" },
            { value: "app_store", label: "App Store" },
          ]}
        />
      </div>

      {error && <ErrorBlock message={error} onRetry={() => void load()} />}
      {loading && creatives.length === 0 ? (
        <LoadingBlock label="Loading creatives…" />
      ) : !creatives.length ? (
        <EmptyState
          title="No creatives yet"
          description="Sync competitors to populate thumbnails and Meta ads."
        />
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
          {creatives.map((c) => (
            <Card key={c.id} className="overflow-hidden">
              <CardContent className="p-0">
                {c.mediaUrl ? (
                  <MediaImg
                    src={c.mediaUrl}
                    fallbackSeed={c.hook || c.title || c.id}
                    className="aspect-[9/12] w-full object-cover"
                  />
                ) : (
                  <div className="flex aspect-[9/12] items-center justify-center bg-surface-2 text-xs text-muted">
                    No media
                  </div>
                )}
                <div className="space-y-1 p-2.5">
                  <p className="line-clamp-2 text-[11px] font-medium text-ink">
                    {c.hook || c.title || "Untitled"}
                  </p>
                  <div className="flex flex-wrap gap-1">
                    <Badge tone="default">{c.source}</Badge>
                    {c.cta && <Badge>{c.cta}</Badge>}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
      </PageBody>
    </div>
  );
}
