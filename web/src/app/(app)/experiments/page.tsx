"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, RefreshCw } from "lucide-react";
import { PageHeader, PageBody } from "@/components/page-header";
import { EmptyState, ErrorBlock, LoadingBlock } from "@/components/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { PostCard, type PostCardData } from "@/components/post-card";
import { useProject } from "@/lib/project-context";
import { apiFetch } from "@/lib/api-client";
import { formatNumber } from "@/lib/utils";

type Arm = {
  key: string;
  label: string;
  sampleSize: number;
  avgViews: number;
  liftVsMean: number;
  confidence: number;
  postIds: string[];
};

type Experiment = {
  id: string;
  name: string;
  kind: string;
  hypothesis: string;
  status: string;
  posts: number;
  winner: string | null;
  confidence: number;
  lift: number;
  arms: Arm[];
  samplePosts: PostCardData[];
};

export default function ExperimentsPage() {
  const { project, projectId, loading: projectLoading } = useProject();
  const [list, setList] = useState<Experiment[]>([]);
  const [loading, setLoading] = useState(true);
  const [recomputing, setRecomputing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");

  const load = useCallback(
    async (recompute = false) => {
      if (!projectId) return;
      setLoading(true);
      const res = await apiFetch<{ experiments: Experiment[] }>(
        `/api/experiments?projectId=${projectId}${recompute ? "&recompute=1" : ""}`,
        { retries: 1 },
      );
      if (!res.ok) setError(res.error);
      else {
        setList(res.data.experiments);
        setError(null);
      }
      setLoading(false);
    },
    [projectId],
  );

  useEffect(() => {
    void load(true);
  }, [load]);

  async function create() {
    if (!projectId || !name.trim()) return;
    const res = await apiFetch("/api/experiments", {
      method: "POST",
      body: JSON.stringify({ projectId, name }),
    });
    if (!res.ok) setError(res.error);
    else {
      setName("");
      await load();
    }
  }

  async function recompute() {
    setRecomputing(true);
    await load(true);
    setRecomputing(false);
  }

  if (projectLoading || !project) return <LoadingBlock />;

  return (
    <div className="flex min-h-full flex-col">
      <PageHeader
        title="Experiments"
        description={`${project.name} · cohort winners from real posts · confidence is sample-size based, not a p-value`}
        action={
          <Button variant="secondary" className="gap-2" onClick={recompute} disabled={recomputing}>
            {recomputing ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            Recompute cohorts
          </Button>
        }
      />
      <PageBody>
      {error && (
        <div className="mb-4">
          <ErrorBlock message={error} onRetry={() => load(true)} />
        </div>
      )}

      <Card className="mb-6">
        <CardContent className="flex flex-col gap-2 sm:flex-row">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Manual experiment name"
            className="h-10 flex-1 rounded-xl border border-border bg-bg px-3 text-sm"
            onKeyDown={(e) => {
              if (e.key === "Enter") void create();
            }}
          />
          <Button onClick={create}>New experiment</Button>
        </CardContent>
      </Card>

      {loading ? (
        <LoadingBlock />
      ) : list.length === 0 ? (
        <EmptyState
          title="No experiments yet"
          description="Sync enough published posts, then recompute. Auto-cohorts appear for hour, hashtag, and theme when sample sizes allow."
        />
      ) : (
        <div className="space-y-4">
          {list.map((exp) => {
            const postsById = Object.fromEntries(
              (exp.samplePosts || []).map((p) => [p.id, p]),
            );
            return (
              <Card key={exp.id}>
                <CardContent className="space-y-4">
                  <div className="grid gap-3 md:grid-cols-[1.4fr_repeat(4,0.55fr)] md:items-start">
                    <div>
                      <div className="mb-1 flex flex-wrap items-center gap-2">
                        <p className="text-sm font-medium text-ink">{exp.name}</p>
                        <Badge
                          tone={
                            exp.status === "winner"
                              ? "success"
                              : exp.status === "running"
                                ? "primary"
                                : "default"
                          }
                        >
                          {exp.status}
                        </Badge>
                        <Badge>{exp.kind}</Badge>
                      </div>
                      <p className="text-xs text-muted">
                        {exp.hypothesis || "No hypothesis yet"}
                      </p>
                    </div>
                    <div>
                      <p className="text-[11px] text-muted">Posts (n)</p>
                      <p className="text-sm text-ink">{exp.posts || "—"}</p>
                    </div>
                    <div>
                      <p className="text-[11px] text-muted">Winner</p>
                      <p className="text-sm text-ink">{exp.winner || "No data yet"}</p>
                    </div>
                    <div>
                      <p className="text-[11px] text-muted">Confidence</p>
                      <p className="text-sm text-ink">
                        {exp.confidence
                          ? `${Math.round(exp.confidence * 100)}%`
                          : "No data yet"}
                      </p>
                    </div>
                    <div>
                      <p className="text-[11px] text-muted">Lift</p>
                      <p className="text-sm text-ink">
                        {exp.lift
                          ? `${exp.lift > 0 ? "+" : ""}${Math.round(exp.lift * 100)}%`
                          : "No data yet"}
                      </p>
                    </div>
                  </div>

                  {exp.arms?.length > 0 && (
                    <div className="space-y-3 border-t border-border pt-3">
                      <p className="text-xs font-medium text-muted">Arms</p>
                      {exp.arms.slice(0, 4).map((arm) => (
                        <div key={arm.key} className="space-y-2">
                          <div className="flex flex-wrap items-center gap-2 text-xs">
                            <span className="font-medium text-ink">{arm.label}</span>
                            <span className="text-muted">
                              n={arm.sampleSize} · avg {formatNumber(arm.avgViews)} views · lift{" "}
                              {Math.round(arm.liftVsMean * 100)}%
                            </span>
                          </div>
                          <div className="grid gap-2 md:grid-cols-2">
                            {(arm.postIds || [])
                              .map((id) => postsById[id])
                              .filter(Boolean)
                              .slice(0, 2)
                              .map((p) => (
                                <PostCard key={p.id} post={p} compact />
                              ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
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
