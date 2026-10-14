"use client";

import { useCallback, useEffect, useState } from "react";
import { PageHeader, PageBody } from "@/components/page-header";
import { EmptyState, ErrorBlock, LoadingBlock } from "@/components/empty-state";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PostCard, type PostCardData } from "@/components/post-card";
import { useProject } from "@/lib/project-context";
import { apiFetch, peekApi } from "@/lib/api-client";
import { formatNumber } from "@/lib/utils";
import { applyDemoInsights, useDemoMode } from "@/lib/demo-recording";

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
};

export default function AnalyticsPage() {
  const { project, projectId, loading: projectLoading } = useProject();
  const { enabled: demoMode } = useDemoMode();
  const cached = projectId
    ? peekApi<{ report: Report }>(`/api/insights/${projectId}`)
    : null;
  const [raw, setRaw] = useState<Report | null>(() => cached?.report ?? null);
  const report = applyDemoInsights(raw, demoMode);
  const [loading, setLoading] = useState(() => !cached);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!projectId) return;
    if (!peekApi(`/api/insights/${projectId}`)) setLoading(true);
    const res = await apiFetch<{ report: Report }>(`/api/insights/${projectId}`, {
      retries: 1,
    });
    if (!res.ok) setError(res.error);
    else {
      const topPostsWithImages = res.data.report.topPosts.filter((p) => p.coverUrl);
      const bottomPostsWithImages = res.data.report.bottomPosts.filter((p) => p.coverUrl);
      
      console.log("[Analytics] Loaded report:", {
        totalTopPosts: res.data.report.topPosts.length,
        topPostsWithImages: topPostsWithImages.length,
        totalBottomPosts: res.data.report.bottomPosts.length,
        bottomPostsWithImages: bottomPostsWithImages.length,
        sampleTopPost: res.data.report.topPosts[0] ? {
          id: res.data.report.topPosts[0].id,
          hasCoverUrl: Boolean(res.data.report.topPosts[0].coverUrl),
          coverUrl: res.data.report.topPosts[0].coverUrl?.substring(0, 50),
        } : null,
      });
      
      setRaw(res.data.report);
      setError(null);
    }
    setLoading(false);
  }, [projectId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (projectLoading || !project) return <LoadingBlock />;

  return (
    <div className="flex min-h-full flex-col">
      <PageHeader
        title="Analytics"
        description={`${project.name} · backend-computed insights (LLM explains elsewhere)`}
      />
      <PageBody>
      {error && (
        <div className="mb-4">
          <ErrorBlock message={error} onRetry={load} />
        </div>
      )}
      {loading && !report ? (
        <LoadingBlock />
      ) : !report || report.totals.posts === 0 ? (
        <EmptyState
          title="No analytics yet"
          description="Published posts with metrics will appear here. Nothing is fabricated."
        />
      ) : (
        <>
          <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[
              ["Views", report.totals.views],
              ["Avg views", report.totals.avgViews],
              ["Engagement", `${report.totals.engagementRate}%`],
              ["Published", report.totals.posts],
            ].map(([label, value]) => (
              <Card key={label as string}>
                <CardContent>
                  <p className="text-xs text-muted">{label}</p>
                  <p className="mt-2 text-xl font-semibold text-ink">
                    {typeof value === "number" ? formatNumber(value) : value}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Top posts</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {report.topPosts.map((p) => (
                  <PostCard key={p.id} post={p} compact />
                ))}
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Bottom posts</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {report.bottomPosts.map((p) => (
                  <PostCard key={p.id} post={p} compact />
                ))}
              </CardContent>
            </Card>
          </div>

          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Best hours (UTC)</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {report.postingHours.slice(0, 6).map((h) => (
                  <div
                    key={h.hour}
                    className="flex items-center justify-between rounded-xl border border-border/60 px-3 py-2 text-sm"
                  >
                    <span className="text-ink">{h.hour}:00</span>
                    <span className="text-muted">
                      {formatNumber(h.avgViews)} avg · n={h.count}
                    </span>
                  </div>
                ))}
                {report.postingHours.length === 0 && (
                  <p className="text-sm text-muted">Need publishedAt on posts.</p>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Hashtags</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {report.hashtags.slice(0, 8).map((h) => (
                  <div
                    key={h.tag}
                    className="flex items-center justify-between rounded-xl border border-border/60 px-3 py-2 text-sm"
                  >
                    <span className="text-ink">{h.tag}</span>
                    <span className="text-muted">
                      {formatNumber(h.avgViews)} avg · n={h.count}
                    </span>
                  </div>
                ))}
                {report.hashtags.length === 0 && (
                  <p className="text-sm text-muted">No hashtags parsed yet.</p>
                )}
              </CardContent>
            </Card>
          </div>
        </>
      )}
      </PageBody>
    </div>
  );
}
