"use client";

import { useCallback, useEffect, useState } from "react";
import { PageHeader, PageBody } from "@/components/page-header";
import { EmptyState, ErrorBlock, LoadingBlock } from "@/components/empty-state";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useProject } from "@/lib/project-context";
import { apiFetch, peekApi } from "@/lib/api-client";
import { MediaImg } from "@/components/media-img";
import { formatNumber } from "@/lib/utils";

type Hook = {
  id: string;
  hook: string;
  topic: string;
  emotion: string;
  cta: string;
  views: number;
  estimatedEngagement: number;
  coverUrl: string;
  visualStyle: string;
  colourPalette: string;
  competitor: { id: string; name: string; handle: string } | null;
};

export default function HookLibraryPage() {
  const { projectId, loading: projectLoading } = useProject();
  const cached = projectId
    ? peekApi<{ hooks: Hook[] }>(`/api/hooks?projectId=${projectId}`)
    : null;
  const [hooks, setHooks] = useState<Hook[]>(() => cached?.hooks ?? []);
  const [q, setQ] = useState("");
  const [topic, setTopic] = useState("");
  const [emotion, setEmotion] = useState("");
  const [loading, setLoading] = useState(() => !cached);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!projectId) return;
    const params = new URLSearchParams({ projectId });
    if (q) params.set("q", q);
    if (topic) params.set("topic", topic);
    if (emotion) params.set("emotion", emotion);
    const url = `/api/hooks?${params}`;
    if (!peekApi(url)) setLoading(true);
    const res = await apiFetch<{ hooks: Hook[] }>(url);
    if (!res.ok) setError(res.error);
    else {
      setHooks(res.data.hooks);
      setError(null);
    }
    setLoading(false);
  }, [projectId, q, topic, emotion]);

  useEffect(() => {
    void load();
  }, [load]);

  if (projectLoading) return <LoadingBlock label="Loading…" />;

  return (
    <div className="flex min-h-full flex-col">
      <PageHeader
        title="Hook Library"
        description="Every analysed opening line — filter by topic, emotion, and performance"
      />

      <PageBody className="space-y-6">
      <div className="grid gap-2 sm:grid-cols-3">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search hooks…"
          className="h-10 rounded-xl border border-border bg-bg px-3 text-sm"
        />
        <input
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          placeholder="Topic (anxiety, habits…)"
          className="h-10 rounded-xl border border-border bg-bg px-3 text-sm"
        />
        <input
          value={emotion}
          onChange={(e) => setEmotion(e.target.value)}
          placeholder="Emotion (curiosity, vulnerable…)"
          className="h-10 rounded-xl border border-border bg-bg px-3 text-sm"
        />
      </div>

      {error && <ErrorBlock message={error} onRetry={() => void load()} />}
      {loading && hooks.length === 0 ? (
        <LoadingBlock label="Loading hooks…" />
      ) : !hooks.length ? (
        <EmptyState
          title="No hooks yet"
          description="Sync competitors in Competitor Centre — hooks are extracted automatically."
        />
      ) : (
        <div className="space-y-2">
          {hooks.map((h) => (
            <Card key={h.id}>
              <CardContent className="flex gap-3 p-4">
                {h.coverUrl ? (
                  <MediaImg
                    src={h.coverUrl}
                    fallbackSeed={h.hook + h.id}
                    className="h-16 w-12 shrink-0 rounded-lg object-cover"
                  />
                ) : null}
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-ink">{h.hook}</p>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {h.topic && <Badge>{h.topic}</Badge>}
                    {h.emotion && <Badge tone="primary">{h.emotion}</Badge>}
                    {h.cta && <Badge tone="default">{h.cta}</Badge>}
                    <Badge tone="default">{formatNumber(h.views)} views</Badge>
                    <Badge tone="default">
                      {h.estimatedEngagement.toFixed(1)}% eng
                    </Badge>
                  </div>
                  {h.competitor && (
                    <p className="mt-1 text-[11px] text-muted">
                      {h.competitor.name || `@${h.competitor.handle}`}
                    </p>
                  )}
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
