"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import { Plus, RefreshCw } from "lucide-react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { PageHeader, PageBody } from "@/components/page-header";
import { EmptyState, ErrorBlock, LoadingBlock } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PostCard, type PostCardData } from "@/components/post-card";
import { useProject } from "@/lib/project-context";
import { apiFetch, peekApi } from "@/lib/api-client";
import { cn, formatNumber } from "@/lib/utils";
import {
  applyDemoInsights,
  DEMO_METRICS,
  scaleViewSeries,
  useDemoMode,
} from "@/lib/demo-recording";

type Tab = "overview" | "performance" | "experiments" | "competitors";

type Report = {
  totals: {
    views: number;
    likes: number;
    comments: number;
    downloads: number;
    followers: number;
    posts: number;
    avgViews: number;
    engagementRate: number;
  };
  topPosts: PostCardData[];
  bottomPosts: PostCardData[];
  postingHours: { hour: number; avgViews: number; count: number }[];
  hashtags: { tag: string; avgViews: number; count: number }[];
  viewsOverTime?: { date: string; views: number }[];
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
};

type Competitor = {
  id: string;
  name: string;
  handle: string;
  niche: string;
  avatar: string;
  followers: number;
  avgViews: number;
  topHook: string;
  lastSyncAt: string | null;
  _count?: { posts: number };
};

type DailyMetric = {
  date: string;
  views: number;
  likes?: number;
  followers?: number;
};

const TABS: { id: Tab; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "performance", label: "Performance" },
  { id: "experiments", label: "Experiments" },
  { id: "competitors", label: "Competitors" },
];

export default function InsightsPage() {
  const { project, projectId, loading: projectLoading } = useProject();
  const { enabled: demoMode } = useDemoMode();
  const search = useSearchParams();
  const router = useRouter();
  const tabParam = (search.get("tab") || "overview") as Tab;
  const tab: Tab = TABS.some((t) => t.id === tabParam) ? tabParam : "overview";

  const insightsUrl = projectId ? `/api/insights/${projectId}` : "";
  const experimentsUrl = projectId
    ? `/api/experiments?projectId=${projectId}`
    : "";
  const competitorsUrl = projectId
    ? `/api/competitors?projectId=${projectId}`
    : "";
  const dashUrl = projectId ? `/api/projects/${projectId}/dashboard` : "";

  const cachedReport = insightsUrl
    ? peekApi<{ report: Report }>(insightsUrl)?.report
    : null;
  const cachedExperiments = experimentsUrl
    ? peekApi<{ experiments: Experiment[] }>(experimentsUrl)?.experiments
    : null;
  const cachedCompetitors = competitorsUrl
    ? peekApi<{ competitors: Competitor[] }>(competitorsUrl)?.competitors
    : null;
  const cachedDash = dashUrl
    ? peekApi<{
        totals: { views: number; posts: number };
        metrics: DailyMetric[];
      }>(dashUrl)
    : null;

  const [report, setReport] = useState<Report | null>(
    () => cachedReport ?? null,
  );
  const [experiments, setExperiments] = useState<Experiment[]>(
    () => cachedExperiments || [],
  );
  const [competitors, setCompetitors] = useState<Competitor[]>(
    () => cachedCompetitors || [],
  );
  const [dashTotals, setDashTotals] = useState<{
    views: number;
    posts: number;
  } | null>(() => cachedDash?.totals || null);
  const [metrics, setMetrics] = useState<DailyMetric[]>(
    () => cachedDash?.metrics || [],
  );
  const [loading, setLoading] = useState(
    () => !cachedReport && !cachedExperiments && !cachedCompetitors,
  );
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!projectId) return;
    const hasCache = Boolean(
      peekApi(insightsUrl) ||
        peekApi(experimentsUrl) ||
        peekApi(competitorsUrl),
    );
    if (!hasCache) setLoading(true);
    const [ins, exp, comp, dash] = await Promise.all([
      apiFetch<{ report: Report }>(insightsUrl),
      apiFetch<{ experiments: Experiment[] }>(experimentsUrl),
      apiFetch<{ competitors: Competitor[] }>(competitorsUrl),
      apiFetch<{
        totals: { views: number; posts: number };
        metrics: DailyMetric[];
      }>(dashUrl),
    ]);
    if (ins.ok) setReport(ins.data.report);
    if (exp.ok) setExperiments(exp.data.experiments || []);
    if (comp.ok) setCompetitors(comp.data.competitors || []);
    if (dash.ok) {
      setDashTotals(dash.data.totals);
      setMetrics(dash.data.metrics || []);
    }
    if (!ins.ok && !exp.ok && !comp.ok) {
      setError(ins.error || exp.error || comp.error || "Failed to load");
    } else {
      setError(null);
    }
    setLoading(false);
  }, [projectId, insightsUrl, experimentsUrl, competitorsUrl, dashUrl]);

  useEffect(() => {
    void load();
  }, [load]);

  const displayReport = useMemo(
    () => applyDemoInsights(report, demoMode),
    [report, demoMode],
  );
  const totals = displayReport?.totals;
  const chartData = useMemo(() => {
    if (displayReport?.viewsOverTime?.length) return displayReport.viewsOverTime;
    return demoMode ? scaleViewSeries(metrics, DEMO_METRICS.views) : metrics;
  }, [displayReport?.viewsOverTime, metrics, demoMode]);

  if (projectLoading || !project) return <LoadingBlock />;

  return (
    <div className="flex min-h-full flex-col">
      <PageHeader
        title="Insights"
        description={`${project.name} · analytics, experiments & competitor radar`}
        action={
          <Button
            variant="secondary"
            className="gap-2"
            onClick={() => void load()}
          >
            <RefreshCw className="h-4 w-4" />
            Refresh
          </Button>
        }
      />

      <PageBody>
      <div className="mb-5 flex flex-wrap gap-1.5">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() =>
              router.replace(
                t.id === "overview" ? "/insights" : `/insights?tab=${t.id}`,
              )
            }
            className={cn(
              "rounded-full px-3.5 py-1.5 text-xs font-medium transition",
              tab === t.id
                ? "bg-primary text-primary-fg"
                : "bg-white/[0.04] text-muted hover:bg-white/[0.06] hover:text-ink",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {error && (
        <div className="mb-4">
          <ErrorBlock message={error} onRetry={() => void load()} />
        </div>
      )}

      {loading &&
      !report &&
      experiments.length === 0 &&
      competitors.length === 0 ? (
        <LoadingBlock />
      ) : (
        <>
          {tab === "overview" && (
            <div className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {[
                  {
                    label: "Views",
                    value: formatNumber(
                      totals?.views ??
                        (demoMode ? DEMO_METRICS.views : dashTotals?.views) ??
                        0,
                    ),
                  },
                  {
                    label: "Posts",
                    value: formatNumber(
                      totals?.posts ??
                        (demoMode ? DEMO_METRICS.posts : dashTotals?.posts) ??
                        0,
                    ),
                  },
                  {
                    label: "Avg views",
                    value: formatNumber(
                      totals?.avgViews ?? (demoMode ? DEMO_METRICS.avgViews : 0),
                    ),
                  },
                  {
                    label: "Engagement",
                    value: `${(totals?.engagementRate ?? 0).toFixed(demoMode ? 1 : 2)}%`,
                  },
                ].map((m) => (
                  <Card key={m.label}>
                    <CardContent className="py-4">
                      <p className="text-[11px] uppercase tracking-wide text-muted">
                        {m.label}
                      </p>
                      <p className="mt-1 text-2xl font-semibold text-ink">
                        {m.value}
                      </p>
                    </CardContent>
                  </Card>
                ))}
              </div>

              <div className="grid gap-4 lg:grid-cols-3">
                <Card className="lg:col-span-2">
                  <CardHeader>
                    <CardTitle>Views over time</CardTitle>
                  </CardHeader>
                  <CardContent className="h-[240px]">
                    {chartData.length === 0 ? (
                      <div className="flex h-full items-center justify-center text-sm text-muted">
                        No owned-account views yet — they appear after a clean sync.
                      </div>
                    ) : (
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart
                          data={chartData.map((m) => ({
                            ...m,
                            date:
                              typeof m.date === "string"
                                ? m.date
                                : String(m.date),
                          }))}
                        >
                          <defs>
                            <linearGradient
                              id="insV"
                              x1="0"
                              y1="0"
                              x2="0"
                              y2="1"
                            >
                              <stop
                                offset="0%"
                                stopColor="oklch(0.72 0.12 160)"
                                stopOpacity={0.35}
                              />
                              <stop
                                offset="100%"
                                stopColor="oklch(0.72 0.12 160)"
                                stopOpacity={0}
                              />
                            </linearGradient>
                          </defs>
                          <CartesianGrid
                            stroke="oklch(0.22 0 0)"
                            vertical={false}
                          />
                          <XAxis
                            dataKey="date"
                            tick={{ fill: "oklch(0.62 0 0)", fontSize: 11 }}
                            tickFormatter={(v) =>
                              new Date(v).toLocaleDateString(undefined, {
                                month: "short",
                                day: "numeric",
                              })
                            }
                            axisLine={false}
                            tickLine={false}
                          />
                          <YAxis
                            tick={{ fill: "oklch(0.62 0 0)", fontSize: 11 }}
                            axisLine={false}
                            tickLine={false}
                            tickFormatter={(v) => formatNumber(v)}
                          />
                          <Tooltip
                            contentStyle={{
                              background: "oklch(0.13 0 0)",
                              border: "1px solid oklch(0.22 0 0)",
                              borderRadius: 12,
                              fontSize: 12,
                            }}
                          />
                          <Area
                            type="monotone"
                            dataKey="views"
                            stroke="oklch(0.72 0.12 160)"
                            fill="url(#insV)"
                            strokeWidth={2}
                            isAnimationActive
                            animationDuration={800}
                          />
                        </AreaChart>
                      </ResponsiveContainer>
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Snapshot</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3 text-sm text-muted">
                    <p>
                      {competitors.length} competitors · {experiments.length}{" "}
                      experiments · {displayReport?.hashtags?.length || 0} hashtag
                      signals
                    </p>
                    {(displayReport?.hashtags || []).slice(0, 5).map((h) => (
                      <div
                        key={h.tag}
                        className="flex items-center justify-between"
                      >
                        <span className="text-ink">{h.tag}</span>
                        <span>{formatNumber(h.avgViews)} avg</span>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              </div>
            </div>
          )}

          {tab === "performance" && (
            <div className="grid gap-4 lg:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle>Top posts</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {(report?.topPosts || []).slice(0, 6).map((p) => (
                    <PostCard key={p.id} post={p} compact />
                  ))}
                  {!report?.topPosts?.length && (
                    <p className="text-sm text-muted">No posts yet.</p>
                  )}
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle>Bottom posts</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {(report?.bottomPosts || []).slice(0, 6).map((p) => (
                    <PostCard key={p.id} post={p} compact />
                  ))}
                  {!report?.bottomPosts?.length && (
                    <p className="text-sm text-muted">No posts yet.</p>
                  )}
                </CardContent>
              </Card>
            </div>
          )}

          {tab === "experiments" && (
            <div className="space-y-3">
              {experiments.length === 0 ? (
                <EmptyState
                  title="No experiments yet"
                  description="Run cohort analysis from the developer tools or sync more posts."
                />
              ) : (
                experiments.map((ex) => (
                  <Card key={ex.id}>
                    <CardContent className="flex items-start justify-between gap-3 py-4">
                      <div>
                        <p className="font-medium text-ink">{ex.name}</p>
                        <p className="mt-1 text-xs text-muted">
                          {ex.hypothesis}
                        </p>
                      </div>
                      <div className="text-right">
                        <Badge>{ex.status}</Badge>
                        <p className="mt-2 text-xs text-muted">
                          lift {ex.lift?.toFixed?.(1) ?? ex.lift}% · n=
                          {ex.posts}
                        </p>
                      </div>
                    </CardContent>
                  </Card>
                ))
              )}
            </div>
          )}

          {tab === "competitors" && (
            <div className="space-y-3">
              <div className="flex justify-end">
                <Link href="/competitors">
                  <Button variant="secondary" size="sm" className="gap-1">
                    <Plus className="h-3.5 w-3.5" />
                    Manage competitors
                  </Button>
                </Link>
              </div>
              {competitors.length === 0 ? (
                <EmptyState
                  title="No competitors yet"
                  description="Add competitors to benchmark hooks and posting cadence."
                  actionLabel="Open Competitor Centre"
                  onAction={() => router.push("/competitors")}
                />
              ) : (
                competitors.map((c) => (
                  <Link key={c.id} href={`/competitors/${c.id}`}>
                    <Card className="mb-2 transition hover:border-primary/40">
                      <CardContent className="flex items-center gap-3 py-3">
                        <div className="h-10 w-10 overflow-hidden rounded-full bg-surface-2">
                          {c.avatar ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={c.avatar}
                              alt=""
                              className="h-full w-full object-cover"
                            />
                          ) : null}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-medium text-ink">
                            {c.name || c.handle}
                          </p>
                          <p className="text-xs text-muted">
                            @{c.handle} · {formatNumber(c.followers)} followers
                          </p>
                        </div>
                        <p className="text-xs text-muted">
                          avg {formatNumber(c.avgViews)}
                        </p>
                      </CardContent>
                    </Card>
                  </Link>
                ))
              )}
            </div>
          )}
        </>
      )}
      </PageBody>
    </div>
  );
}
