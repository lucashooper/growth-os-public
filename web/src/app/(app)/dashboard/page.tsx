"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Loader2, RefreshCw, Wand2 } from "lucide-react";
import { PageHeader, PageBody } from "@/components/page-header";
import { FadeIn } from "@/components/fade-in";
import { EmptyState, ErrorBlock, LoadingBlock } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useProject } from "@/lib/project-context";
import { apiFetch, peekApi } from "@/lib/api-client";
import { formatNumber } from "@/lib/utils";
import { applyDemoDashboard, useDemoMode } from "@/lib/demo-recording";
import { PostCard } from "@/components/post-card";
import { RichMessage } from "@/components/post-card";
import { MediaImg } from "@/components/media-img";

type DashboardData = {
  totals: {
    views: number;
    likes: number;
    comments: number;
    downloads: number;
    followers: number;
    posts: number;
  };
  todayOverview?: {
    viewsToday: number;
    likesToday: number;
    followersToday: number;
    postsPublishedToday: number;
    draftsWaiting: number;
    avgViewsPerPostToday: number;
    streak: number;
    changes: {
      views: number | null;
      likes: number | null;
      followers: number | null;
      posts: number | null;
    };
  };
  bestPost?: {
    id: string;
    hook: string;
    views: number;
    likes: number;
    comments: number;
    coverUrl: string;
    shareUrl: string;
    publishedAt: string | null;
    engagement: number;
    explanation: string;
  } | null;
  growthScore?: number;
  opportunityScore?: number;
  competitorActivity?: Array<{
    id: string;
    name: string;
    postingFreq: string;
    lastSyncAt: string | null;
    oneLiner: string;
  }>;
  latestCompetitorChanges?: Array<{
    id: string;
    competitor: string;
    provider: string;
    summary: string;
    changes: string[];
    at: string;
  }>;
  bestPostingHour?: number | null;
  whatShouldICreate?: string;
  syncJobs?: Array<{
    id: string;
    status: string;
    cadence: string;
    createdAt: string;
    finishedAt: string | null;
  }>;
  lastSyncedAt?: string | null;
  serverTime?: string;
  posts: {
    id: string;
    hook: string;
    views: number;
    likes: number;
    comments: number;
    coverUrl: string;
    shareUrl: string;
    publishedAt: string | null;
    ctr: number;
    theme: string;
    status: string;
  }[];
  findings: { id: string; text: string; severity: string; source?: string }[];
  metrics: { date: string; views: number; downloads: number }[];
  topHook: {
    id: string;
    hook: string;
    views: number;
    likes: number;
    comments: number;
    coverUrl: string;
    shareUrl: string;
    publishedAt: string | null;
  } | null;
  worstHook: {
    id: string;
    hook: string;
    views: number;
    likes: number;
    comments: number;
    coverUrl: string;
    shareUrl: string;
    publishedAt: string | null;
  } | null;
  empty: { posts: boolean; metrics: boolean; accounts: boolean; findings: boolean };
};

function ChangePill({ value }: { value: number | null | undefined }) {
  if (value == null || Number.isNaN(value)) {
    return <span className="text-[11px] text-muted">vs yesterday</span>;
  }
  const up = value >= 0;
  return (
    <span className={up ? "text-[11px] text-success" : "text-[11px] text-danger"}>
      {up ? "+" : ""}
      {value.toFixed(0)}% vs yesterday
    </span>
  );
}

function AnimatedStat({ value }: { value: number }) {
  return (
    <AnimatePresence mode="popLayout">
      <motion.p
        key={value}
        initial={{ opacity: 0.4, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        className="mt-2 text-2xl font-semibold tracking-tight text-ink"
      >
        {formatNumber(value)}
      </motion.p>
    </AnimatePresence>
  );
}

function syncedAgoLabel(iso: string | null | undefined, nowMs: number) {
  if (!iso) return "Not synced yet";
  const sec = Math.max(0, Math.round((nowMs - new Date(iso).getTime()) / 1000));
  if (sec < 5) return "Last synced just now";
  if (sec < 60) return `Last synced ${sec}s ago`;
  const min = Math.floor(sec / 60);
  return `Last synced ${min}m ago`;
}

export default function DashboardPage() {
  const { project, projectId, loading: projectLoading } = useProject();
  const { enabled: demoMode } = useDemoMode();
  const dashUrl = projectId ? `/api/projects/${projectId}/dashboard` : null;
  const [raw, setRaw] = useState<DashboardData | null>(() =>
    dashUrl ? peekApi<DashboardData>(dashUrl) : null,
  );
  const data = applyDemoDashboard(raw, demoMode);
  const [loading, setLoading] = useState(() => !data);
  const [syncing, setSyncing] = useState(false);
  const [syncNote, setSyncNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [briefing, setBriefing] = useState<string | null>(null);
  const [briefingLoading, setBriefingLoading] = useState(false);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [fetchedAt, setFetchedAt] = useState<number | null>(null);

  const load = useCallback(async (silent = false) => {
    if (!projectId) return;
    const url = `/api/projects/${projectId}/dashboard`;
    if (!silent && !peekApi(url)) setLoading(true);
    if (!silent) setError(null);
    const res = await apiFetch<DashboardData>(url, {
      retries: 1,
      skipCache: silent,
    });
    if (!res.ok) {
      if (!silent) {
        setError(res.error);
        setRaw(null);
      }
    } else {
      setRaw(res.data);
      setFetchedAt(Date.now());
    }
    setLoading(false);
  }, [projectId]);

  const loadBriefing = useCallback(async () => {
    if (!projectId) return;
    setBriefingLoading(true);
    const cached = await apiFetch<{
      cached?: boolean;
      briefing?: string;
    }>(`/api/ai/briefing?projectId=${projectId}`);
    if (cached.ok && cached.data.briefing) {
      setBriefing(cached.data.briefing);
      setBriefingLoading(false);
      return;
    }
    const res = await apiFetch<{ briefing?: string }>("/api/ai/briefing", {
      method: "POST",
      body: JSON.stringify({ projectId }),
    });
    if (res.ok && res.data.briefing) setBriefing(res.data.briefing);
    setBriefingLoading(false);
  }, [projectId]);

  const syncAccounts = useCallback(
    async (force = false) => {
      if (!projectId) return;
      setSyncing(true);
      setSyncNote(force ? "Syncing TikTok accounts…" : "Checking for new posts…");
      const res = await fetch(`/api/projects/${projectId}/sync`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ force, minAgeMinutes: 15 }),
      });
      const body = await res.json().catch(() => ({}));
      setSyncing(false);
      if (!res.ok) {
        setSyncNote(body.error || "Sync failed");
        return;
      }
      if (body.skipped) {
        setSyncNote(body.reason || "Already up to date");
      } else {
        setSyncNote(
          `Synced ${body.synced} account(s)${
            body.results?.some((r: { ok: boolean }) => !r.ok)
              ? " · some failed — check Connected Accounts"
              : ""
          }`,
        );
        await load(true);
      }
    },
    [projectId, load],
  );

  useEffect(() => {
    void load();
    void loadBriefing();
  }, [load, loadBriefing]);

  // Live refresh every 30s
  useEffect(() => {
    if (!projectId) return;
    const poll = setInterval(() => void load(true), 30_000);
    const tick = setInterval(() => setNowMs(Date.now()), 15_000);
    return () => {
      clearInterval(poll);
      clearInterval(tick);
    };
  }, [projectId, load]);

  if (projectLoading || !project) {
    return <LoadingBlock label="Loading workspace…" />;
  }

  const overview = data?.todayOverview;
  const overviewCards = overview
    ? [
        {
          label: "Views today",
          value: overview.viewsToday,
          change: overview.changes.views,
        },
        {
          label: "Likes today",
          value: overview.likesToday,
          change: overview.changes.likes,
        },
        {
          label: "Followers today",
          value: overview.followersToday,
          change: overview.changes.followers,
        },
        {
          label: "Posts published today",
          value: overview.postsPublishedToday,
          change: overview.changes.posts,
        },
        { label: "Drafts waiting", value: overview.draftsWaiting, change: null },
        {
          label: "Avg views/post today",
          value: overview.avgViewsPerPostToday,
          change: null,
        },
        {
          label: "Posting streak",
          value: overview.streak,
          change: null,
          suffix: " days",
        },
      ]
    : [];

  return (
    <div className="flex min-h-full flex-col">
      <PageHeader
        title="Command centre"
        description={`${project.name} · What should I do next?`}
        action={
          <div className="flex flex-wrap items-center gap-2">
            <p className="mr-2 text-[11px] text-muted">
              {syncedAgoLabel(
                data?.lastSyncedAt ||
                  (fetchedAt ? new Date(fetchedAt).toISOString() : null),
                nowMs,
              )}
            </p>
            <Button
              variant="secondary"
              className="gap-2"
              disabled={syncing}
              onClick={() => void syncAccounts(true)}
            >
              {syncing ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              Sync now
            </Button>
            <Link href="/generate">
              <Button size="lg" className="gap-2">
                <Wand2 className="h-4 w-4" />
                Generate
              </Button>
            </Link>
          </div>
        }
      />
      <PageBody className="space-y-6">
      {syncNote && <p className="text-xs text-muted">{syncNote}</p>}

      {loading && <LoadingBlock label="Loading dashboard…" />}
      {error && <ErrorBlock message={error} onRetry={() => void load()} />}

      {!loading && !error && data && data.empty.posts && data.empty.accounts && (
        <EmptyState
          title="No data yet"
          description="Connect a TikTok account and generate or sync posts. We never show fake metrics."
          actionLabel="Connect account"
          onAction={() => {
            window.location.href = "/accounts";
          }}
        />
      )}

      {!loading && !error && data && !(data.empty.posts && data.empty.accounts) && (
        <>
          {/* Today's AI Briefing */}
          <FadeIn>
            <Card className="border-primary/20 bg-primary/5">
              <CardHeader className="flex flex-row items-start justify-between gap-3">
                <div>
                  <CardTitle className="text-lg">What should I create today?</CardTitle>
                  <p className="mt-1 text-xs text-muted">
                    {data.whatShouldICreate ||
                      "Strategist recommendation from your data + competitors"}
                  </p>
                </div>
                <div className="flex gap-3 text-center">
                  <div>
                    <p className="text-2xl font-semibold text-ink">
                      {data.growthScore ?? "—"}
                    </p>
                    <p className="text-[10px] uppercase text-muted">Growth</p>
                  </div>
                  <div>
                    <p className="text-2xl font-semibold text-ink">
                      {data.opportunityScore ?? "—"}
                    </p>
                    <p className="text-[10px] uppercase text-muted">Opportunity</p>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {briefingLoading && !briefing ? (
                  <p className="text-sm text-muted">Generating briefing…</p>
                ) : briefing ? (
                  <div className="prose-sm max-w-none text-sm leading-relaxed text-ink">
                    <RichMessage
                      content={briefing}
                      postsById={Object.fromEntries(
                        data.posts.map((p) => [p.id, p]),
                      )}
                    />
                  </div>
                ) : (
                  <p className="text-sm text-muted">
                    Sync posts and competitors, then refresh for a live briefing.
                  </p>
                )}
                <div className="mt-3 flex flex-wrap gap-3 text-xs text-muted">
                  {data.bestPostingHour != null && (
                    <span>
                      Best posting hour (UTC):{" "}
                      <strong className="text-ink">{data.bestPostingHour}:00</strong>
                    </span>
                  )}
                  <button
                    type="button"
                    className="text-primary hover:underline"
                    onClick={() => void loadBriefing()}
                  >
                    Refresh briefing
                  </button>
                  <Link href="/deep-search" className="text-primary hover:underline">
                    Deep Search
                  </Link>
                </div>
              </CardContent>
            </Card>
          </FadeIn>

          {/* Today's Overview */}
          <div>
            <h2 className="mb-3 text-sm font-medium text-ink">Today&apos;s overview</h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
              {overviewCards.map((m, i) => (
                <motion.div
                  key={m.label}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.03 }}
                >
                  <Card className="h-full">
                    <CardContent className="p-4">
                      <p className="text-xs text-muted">{m.label}</p>
                      <div className="flex items-baseline gap-1">
                        <AnimatedStat value={m.value} />
                        {"suffix" in m && m.suffix ? (
                          <span className="text-sm text-muted">{m.suffix}</span>
                        ) : null}
                      </div>
                      <ChangePill value={m.change} />
                    </CardContent>
                  </Card>
                </motion.div>
              ))}
            </div>
            <p className="mt-2 text-[10px] text-muted">
              Today vs yesterday uses DailyMetric snapshots (totals after sync), not
              TikTok Analytics intra-day.
            </p>
          </div>

          {/* Best post + findings */}
          <div className="grid gap-4 lg:grid-cols-5">
            <FadeIn className="lg:col-span-3">
              <Card className="h-full">
                <CardHeader>
                  <CardTitle>Best performing post</CardTitle>
                </CardHeader>
                <CardContent>
                  {data.bestPost ? (
                    <div className="flex flex-col gap-4 sm:flex-row">
                      {data.bestPost.coverUrl ? (
                        <MediaImg
                          src={data.bestPost.coverUrl}
                          shareUrl={data.bestPost.shareUrl}
                          fallbackSeed={data.bestPost.hook + data.bestPost.id}
                          className="h-40 w-28 shrink-0 rounded-xl object-cover"
                        />
                      ) : null}
                      <div className="min-w-0 space-y-2">
                        <p className="text-base font-semibold text-ink">
                          {data.bestPost.hook || "Untitled"}
                        </p>
                        <div className="flex flex-wrap gap-3 text-sm text-muted">
                          <span>{formatNumber(data.bestPost.views)} views</span>
                          <span>
                            {data.bestPost.engagement.toFixed(1)}% engagement
                          </span>
                          {data.bestPost.publishedAt && (
                            <span>
                              {new Date(
                                data.bestPost.publishedAt,
                              ).toLocaleDateString()}
                            </span>
                          )}
                        </div>
                        <p className="text-sm leading-relaxed text-ink">
                          {data.bestPost.explanation}
                        </p>
                        {data.bestPost.shareUrl && (
                          <a
                            href={data.bestPost.shareUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="text-xs text-primary hover:underline"
                          >
                            Open on TikTok
                          </a>
                        )}
                      </div>
                    </div>
                  ) : (
                    <p className="text-sm text-muted">No published posts yet.</p>
                  )}
                </CardContent>
              </Card>
            </FadeIn>

            <FadeIn delay={0.05} className="lg:col-span-2">
              <Card className="h-full">
                <CardHeader>
                  <CardTitle>Competitor activity</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {(data.latestCompetitorChanges || []).slice(0, 4).map((c) => (
                    <div
                      key={c.id}
                      className="rounded-xl border border-border/60 px-3 py-2.5 text-sm text-ink"
                    >
                      <p className="text-[11px] text-muted">
                        {c.competitor} · {c.provider}
                      </p>
                      <p>{c.summary || c.changes.join(", ") || "Update detected"}</p>
                    </div>
                  ))}
                  {(data.competitorActivity || []).slice(0, 3).map((c) => (
                    <div
                      key={c.id}
                      className="rounded-xl border border-border/60 px-3 py-2.5 text-sm text-ink"
                    >
                      <p className="font-medium">{c.name}</p>
                      <p className="text-muted">{c.oneLiner || c.postingFreq}</p>
                    </div>
                  ))}
                  {!data.competitorActivity?.length &&
                    !data.latestCompetitorChanges?.length && (
                      <p className="text-sm text-muted">
                        Add competitors to see live intelligence.
                      </p>
                    )}
                  <Link
                    href="/competitors"
                    className="inline-block pt-1 text-xs text-primary hover:underline"
                  >
                    Open Competitor Centre →
                  </Link>
                </CardContent>
              </Card>
            </FadeIn>
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <FadeIn className="lg:col-span-2">
              <Card>
                <CardHeader>
                  <CardTitle>Performance</CardTitle>
                </CardHeader>
                <CardContent className="h-[240px]">
                  {data.metrics.length === 0 ? (
                    <div className="flex h-full items-center justify-center text-sm text-muted">
                      No daily metrics yet — they appear after syncs.
                    </div>
                  ) : (
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={data.metrics}>
                        <defs>
                          <linearGradient id="v" x1="0" y1="0" x2="0" y2="1">
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
                        <CartesianGrid stroke="oklch(0.22 0 0)" vertical={false} />
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
                          fill="url(#v)"
                          strokeWidth={2}
                          isAnimationActive
                          animationDuration={800}
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  )}
                </CardContent>
              </Card>
            </FadeIn>

            <FadeIn delay={0.05}>
              <Card className="h-full">
                <CardHeader>
                  <CardTitle>Recent posts</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {data.posts.length === 0 ? (
                    <p className="text-sm text-muted">No posts stored yet.</p>
                  ) : (
                    data.posts
                      .slice(0, 4)
                      .map((p) => <PostCard key={p.id} post={p} compact />)
                  )}
                </CardContent>
              </Card>
            </FadeIn>
          </div>
        </>
      )}
      </PageBody>
    </div>
  );
}
