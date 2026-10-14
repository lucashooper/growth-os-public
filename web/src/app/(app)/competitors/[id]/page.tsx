"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, Loader2, RefreshCw, Sparkles } from "lucide-react";
import { PageHeader, PageBody } from "@/components/page-header";
import { ErrorBlock, LoadingBlock } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { apiFetch } from "@/lib/api-client";
import { formatNumber } from "@/lib/utils";

type CompetitorDetail = {
  id: string;
  name: string;
  slug: string;
  handle: string;
  niche: string;
  avatar: string;
  bio: string;
  websiteUrl: string;
  appStoreUrl: string;
  playStoreUrl: string;
  metaPageId: string;
  followers: number;
  avgViews: number;
  postingFreq: string;
  topHook: string;
  aiSummary: string;
  signalsJson: string;
  lastSyncAt: string | null;
  lastError: string | null;
  posts: Array<{
    id: string;
    hook: string;
    coverUrl: string;
    shareUrl: string;
    views: number;
    likes: number;
    hashtagsJson: string;
    hourUtc: number | null;
    publishedAt: string | null;
  }>;
  assets: Array<{
    id: string;
    kind: string;
    url: string;
    title: string;
    externalId: string;
  }>;
  snapshots: Array<{
    date: string;
    posts7d: number;
    followers: number;
    avgViews: number;
    adCreativeCount: number;
    appRating: number | null;
  }>;
  observations: Array<{
    id: string;
    provider: string;
    ok: boolean;
    error: string | null;
    observedAt: string;
  }>;
};

function parseSignals(raw: string) {
  try {
    return JSON.parse(raw) as {
      topHashtags?: { tag: string; count: number }[];
      postingHours?: Record<string, number>;
      website?: { title?: string; description?: string; url?: string } | null;
      appStore?: {
        name?: string;
        rating?: number;
        version?: string;
        ratingsCount?: number;
      } | null;
      playStore?: { name?: string; rating?: number } | null;
      metaAdLibrary?: { configured?: boolean; adCount?: number; note?: string } | null;
    };
  } catch {
    return {};
  }
}

export default function CompetitorDetailPage() {
  const params = useParams();
  const id = String(params.id || "");
  const [competitor, setCompetitor] = useState<CompetitorDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<"sync" | "insights" | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    const res = await apiFetch<{ competitor: CompetitorDetail }>(
      `/api/competitors/${id}`,
    );
    if (!res.ok) setError(res.error);
    else {
      setCompetitor(res.data.competitor);
      setError(null);
    }
    setLoading(false);
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  const signals = useMemo(
    () => (competitor ? parseSignals(competitor.signalsJson) : {}),
    [competitor],
  );

  const hourBars = useMemo(() => {
    const hours = signals.postingHours || {};
    const max = Math.max(1, ...Object.values(hours));
    return Array.from({ length: 24 }, (_, h) => ({
      h,
      n: hours[String(h)] || 0,
      pct: ((hours[String(h)] || 0) / max) * 100,
    }));
  }, [signals]);

  async function syncAll() {
    setBusy("sync");
    const res = await apiFetch(`/api/competitors/${id}/sync`, { method: "POST" });
    setBusy(null);
    if (!res.ok) setError(res.error);
    await load();
  }

  async function regenInsights() {
    setBusy("insights");
    const res = await apiFetch(`/api/competitors/${id}/insights`, {
      method: "POST",
      body: JSON.stringify({ force: true }),
    });
    setBusy(null);
    if (!res.ok) setError(res.error);
    await load();
  }

  if (loading) return <LoadingBlock label="Loading competitor…" />;
  if (!competitor) {
    return (
      <div className="space-y-4">
        <ErrorBlock message={error || "Not found"} onRetry={() => void load()} />
        <Link href="/competitors" className="text-sm text-primary">
          ← Back
        </Link>
      </div>
    );
  }

  const label =
    competitor.name ||
    (competitor.handle ? `@${competitor.handle}` : competitor.slug);
  const thumbs = competitor.assets.filter((a) => a.kind === "thumbnail");
  const metaAds = competitor.assets.filter((a) => a.kind === "meta_ad");

  return (
    <div className="flex min-h-full flex-col">
      <PageHeader
        title={label}
        description={competitor.niche || competitor.bio || "Competitor intelligence"}
        action={
          <div className="flex gap-2">
            <Button
              variant="secondary"
              disabled={busy !== null}
              onClick={() => void regenInsights()}
            >
              {busy === "insights" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <>
                  <Sparkles className="mr-1.5 h-4 w-4" /> Insights
                </>
              )}
            </Button>
            <Button disabled={busy !== null} onClick={() => void syncAll()}>
              {busy === "sync" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <>
                  <RefreshCw className="mr-1.5 h-4 w-4" /> Sync all sources
                </>
              )}
            </Button>
          </div>
        }
      />

      <PageBody className="space-y-6">
      <div className="flex items-center gap-3">
        <Link
          href="/competitors"
          className="inline-flex items-center gap-1 text-sm text-muted hover:text-ink"
        >
          <ArrowLeft className="h-4 w-4" /> Centre
        </Link>
      </div>
      {error && <ErrorBlock message={error} onRetry={() => void load()} />}

      <div className="flex flex-wrap items-center gap-2">
        {competitor.handle && <Badge>@{competitor.handle}</Badge>}
        {competitor.websiteUrl && (
          <Badge>
            <a href={competitor.websiteUrl} target="_blank" rel="noreferrer">
              Website
            </a>
          </Badge>
        )}
        {competitor.appStoreUrl && <Badge>App Store</Badge>}
        {competitor.playStoreUrl && <Badge>Play Store</Badge>}
        <Badge tone="primary">{competitor.postingFreq || "freq unknown"}</Badge>
        <span className="text-[11px] text-muted">
          {competitor.lastSyncAt
            ? `Last sync ${new Date(competitor.lastSyncAt).toLocaleString()}`
            : "Never synced"}
        </span>
      </div>

      <div className="grid gap-4 sm:grid-cols-4">
        {[
          ["Followers", formatNumber(competitor.followers)],
          ["Avg views", formatNumber(competitor.avgViews)],
          ["Posts tracked", String(competitor.posts.length)],
          [
            "Ads tracked",
            String(metaAds.length || signals.metaAdLibrary?.adCount || 0),
          ],
        ].map(([k, v]) => (
          <Card key={k}>
            <CardContent className="p-4">
              <p className="text-2xl font-semibold tracking-tight text-ink">{v}</p>
              <p className="mt-1 text-[11px] uppercase tracking-wide text-muted">
                {k}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Latest AI summary</CardTitle>
        </CardHeader>
        <CardContent>
          {competitor.aiSummary ? (
            <div className="whitespace-pre-wrap text-sm leading-relaxed text-ink">
              {competitor.aiSummary}
            </div>
          ) : (
            <p className="text-sm text-muted">
              No summary yet — sync sources or generate insights.
            </p>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Hashtags</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {(signals.topHashtags || []).length ? (
              signals.topHashtags!.map((h) => (
                <Badge key={h.tag} tone="default">
                  {h.tag} · {h.count}
                </Badge>
              ))
            ) : (
              <p className="text-sm text-muted">No hashtags extracted yet.</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Posting hours (UTC)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex h-24 items-end gap-0.5">
              {hourBars.map((b) => (
                <div
                  key={b.h}
                  title={`${b.h}:00 — ${b.n} posts`}
                  className="flex-1 rounded-t bg-primary/70"
                  style={{ height: `${Math.max(b.pct, b.n ? 8 : 2)}%` }}
                />
              ))}
            </div>
            <p className="mt-2 text-[10px] text-muted">0–23 UTC</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Recent uploads</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 md:grid-cols-5">
            {competitor.posts.slice(0, 10).map((p) => (
              <a
                key={p.id}
                href={p.shareUrl || "#"}
                target="_blank"
                rel="noreferrer"
                className="group overflow-hidden rounded-xl border border-border bg-bg"
              >
                {p.coverUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={p.coverUrl}
                    alt=""
                    className="aspect-[9/12] w-full object-cover"
                  />
                ) : (
                  <img
                    src={`data:image/svg+xml,%3Csvg width='200' height='300' xmlns='http://www.w3.org/2000/svg'%3E%3Crect width='200' height='300' fill='%23667eea'/%3E%3Ccircle cx='100' cy='150' r='30' fill='white' opacity='0.2'/%3E%3C/svg%3E`}
                    alt=""
                    className="aspect-[9/12] w-full object-cover"
                  />
                )}
                <div className="space-y-0.5 p-2">
                  <p className="line-clamp-2 text-[11px] text-ink">{p.hook}</p>
                  <p className="text-[10px] text-muted">
                    {formatNumber(p.views)} views
                  </p>
                </div>
              </a>
            ))}
          </div>
          {!competitor.posts.length && (
            <p className="text-sm text-muted">No TikTok posts synced.</p>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Website</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {signals.website ? (
              <>
                <p className="font-medium text-ink">
                  {signals.website.title || "Site"}
                </p>
                <p className="text-muted">{signals.website.description}</p>
                {signals.website.url && (
                  <a
                    href={signals.website.url}
                    className="text-primary hover:underline"
                    target="_blank"
                    rel="noreferrer"
                  >
                    Visit
                  </a>
                )}
              </>
            ) : (
              <p className="text-muted">
                {competitor.websiteUrl
                  ? "Not synced yet"
                  : "No website linked"}
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">App stores</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {signals.appStore ? (
              <div>
                <p className="font-medium text-ink">
                  iOS · {signals.appStore.name}
                </p>
                <p className="text-muted">
                  {signals.appStore.rating != null
                    ? `${signals.appStore.rating.toFixed(1)}★`
                    : "—"}
                  {signals.appStore.version
                    ? ` · v${signals.appStore.version}`
                    : ""}
                </p>
              </div>
            ) : (
              <p className="text-muted">
                {competitor.appStoreUrl ? "iOS not synced" : "No App Store link"}
              </p>
            )}
            {signals.playStore ? (
              <div>
                <p className="font-medium text-ink">
                  Android · {signals.playStore.name}
                </p>
                <p className="text-muted">
                  {signals.playStore.rating != null
                    ? `${signals.playStore.rating.toFixed(1)}★`
                    : "—"}
                </p>
              </div>
            ) : (
              <p className="text-muted">
                {competitor.playStoreUrl
                  ? "Play Store unavailable / blocked"
                  : "No Play Store link"}
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Meta Ad Library</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {signals.metaAdLibrary?.configured === false ? (
              <p className="text-muted">
                Architecture ready. Set{" "}
                <code className="text-ink">META_AD_LIBRARY_TOKEN</code> to
                ingest ads.
              </p>
            ) : metaAds.length ? (
              <ul className="space-y-2">
                {metaAds.slice(0, 5).map((a) => (
                  <li key={a.id}>
                    <a
                      href={a.url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-primary hover:underline"
                    >
                      {a.title || a.externalId}
                    </a>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-muted">No Meta creatives tracked yet.</p>
            )}
          </CardContent>
        </Card>
      </div>

      {thumbs.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Creatives / thumbnails</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex gap-2 overflow-x-auto pb-1">
              {thumbs.slice(0, 16).map((a) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  key={a.id}
                  src={a.url}
                  alt={a.title}
                  className="h-28 w-20 shrink-0 rounded-lg object-cover"
                />
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Provider runs</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1.5">
          {competitor.observations.slice(0, 10).map((o) => (
            <div
              key={o.id}
              className="flex items-center justify-between text-xs text-muted"
            >
              <span>
                <span className="font-medium text-ink">{o.provider}</span>
                {o.ok ? " · ok" : ` · ${o.error || "failed"}`}
              </span>
              <span>{new Date(o.observedAt).toLocaleString()}</span>
            </div>
          ))}
          {!competitor.observations?.length && (
            <p className="text-sm text-muted">No observations yet.</p>
          )}
        </CardContent>
      </Card>
      </PageBody>
    </div>
  );
}
