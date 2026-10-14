"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Loader2, Mic, RefreshCw, Sparkles } from "lucide-react";
import { PageHeader, PageBody } from "@/components/page-header";
import { FadeIn } from "@/components/fade-in";
import { EmptyState, ErrorBlock, LoadingBlock } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { PostCard, RichMessage, type PostCardData } from "@/components/post-card";
import { VoiceAgentModal } from "@/components/voice-agent-modal";
import { useProject } from "@/lib/project-context";
import { apiFetch, peekApi } from "@/lib/api-client";
import { formatNumber } from "@/lib/utils";

type Finding = {
  id: string;
  severity: string;
  text: string;
  source: string;
  metaJson?: string;
};
type Account = {
  id: string;
  username: string;
  nickname: string;
  avatar: string;
  followers: number;
};

export default function AgentPage() {
  const {
    project,
    projectId,
    loading: projectLoading,
    error: projectError,
  } = useProject();
  const dashCached = projectId
    ? peekApi<{
        findings: Finding[];
        accounts: Account[];
        totals: { views: number; posts: number };
        posts: PostCardData[];
      }>(`/api/projects/${projectId}/dashboard`)
    : null;
  const [findings, setFindings] = useState<Finding[]>(
    () => dashCached?.findings ?? [],
  );
  const [accounts, setAccounts] = useState<Account[]>(
    () => dashCached?.accounts ?? [],
  );
  const [topPosts, setTopPosts] = useState<PostCardData[]>(
    () => dashCached?.posts.slice(0, 4) ?? [],
  );
  const [briefing, setBriefing] = useState<string | null>(null);
  const [citedPosts, setCitedPosts] = useState<PostCardData[]>([]);
  const [loading, setLoading] = useState(() => !dashCached);
  const [briefLoading, setBriefLoading] = useState(false);
  const [briefWriting, setBriefWriting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [postsCount, setPostsCount] = useState(
    () => dashCached?.totals.posts ?? 0,
  );
  const [voiceOpen, setVoiceOpen] = useState(false);

  const postsById = useMemo(() => {
    const map: Record<string, PostCardData> = {};
    for (const p of [...citedPosts, ...topPosts]) map[p.id] = p;
    return map;
  }, [citedPosts, topPosts]);

  const load = useCallback(async () => {
    if (!projectId) return;
    if (!peekApi(`/api/projects/${projectId}/dashboard`)) setLoading(true);
    setError(null);
    const [dash, insights] = await Promise.all([
      apiFetch<{
        findings: Finding[];
        accounts: Account[];
        totals: { views: number; posts: number };
        posts: PostCardData[];
      }>(`/api/projects/${projectId}/dashboard`),
      apiFetch<{
        report: { topPosts: PostCardData[]; totals: { posts: number } };
      }>(`/api/insights/${projectId}`),
    ]);
    if (!dash.ok) {
      setError(dash.error);
      setLoading(false);
      return;
    }
    setFindings(dash.data.findings);
    setAccounts(dash.data.accounts);
    setPostsCount(dash.data.totals.posts ?? 0);
    if (insights.ok) {
      setTopPosts(insights.data.report.topPosts.slice(0, 4));
    } else {
      setTopPosts(dash.data.posts.slice(0, 4));
    }
    setLoading(false);
  }, [projectId]);

  const loadBriefing = useCallback(
    async (force = false) => {
      if (!project || !projectId) return;
      const day = new Date().toISOString().slice(0, 10);
      const lsKey = `growthos:briefing:v4:${projectId}:${day}`;

      // Instant paint from localStorage; never auto-call LLM on visit
      if (!force) {
        try {
          const raw = localStorage.getItem(lsKey);
          if (raw) {
            const parsed = JSON.parse(raw) as {
              briefing?: string;
              citedPosts?: PostCardData[];
              provider?: string;
              model?: string;
            };
            if (parsed.briefing) {
              setBriefing(parsed.briefing);
              setCitedPosts(parsed.citedPosts || []);
              setBriefLoading(false);
              setBriefWriting(false);
              return;
            }
          }
        } catch {
          /* ignore corrupt cache */
        }

        setBriefLoading(true);
        setBriefWriting(false);
        setError(null);
        const cached = await fetch(
          `/api/ai/briefing?projectId=${encodeURIComponent(projectId)}`,
        );
        const data = await cached.json();
        setBriefLoading(false);
        if (cached.ok && data.cached && data.briefing) {
          setBriefing(data.briefing);
          setCitedPosts(data.citedPosts || []);
          try {
            localStorage.setItem(
              lsKey,
              JSON.stringify({
                briefing: data.briefing,
                citedPosts: data.citedPosts || [],
                provider: data.provider,
                model: data.model,
              }),
            );
          } catch {
            /* quota */
          }
        }
        return;
      }

      setBriefLoading(true);
      setBriefWriting(true);
      setError(null);
      const res = await fetch("/api/ai/briefing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, force: true }),
      });
      const data = await res.json();
      setBriefLoading(false);
      setBriefWriting(false);
      if (!res.ok) {
        setError(data.error || "Briefing failed");
        return;
      }
      setBriefing(data.briefing);
      setCitedPosts(data.citedPosts || []);
      try {
        localStorage.setItem(
          lsKey,
          JSON.stringify({
            briefing: data.briefing,
            citedPosts: data.citedPosts || [],
            provider: data.provider,
            model: data.model,
          }),
        );
      } catch {
        /* quota */
      }
    },
    [project, projectId],
  );

  useEffect(() => {
    void load();
  }, [load]);

  // Once per day from cache; Refresh button forces a new generation
  useEffect(() => {
    void loadBriefing(false);
  }, [loadBriefing]);

  if (projectLoading) {
    return <LoadingBlock label="Loading workspace…" />;
  }

  if (projectError) {
    return (
      <ErrorBlock
        message={projectError}
        onRetry={() => window.location.reload()}
      />
    );
  }

  if (!project) {
    return (
      <EmptyState
        title="No workspace yet"
        description="Create a project to start using the agent."
        actionLabel="Open Projects"
        onAction={() => {
          window.location.href = "/projects";
        }}
      />
    );
  }

  return (
    <div className="flex min-h-full flex-col">
      <PageHeader
        title="AI Agent"
        description={`Daily briefing for ${project.name} — grounded in computed analytics only.`}
        action={
          <div className="flex flex-wrap gap-2">
            <Button
              className="gap-2"
              onClick={() => setVoiceOpen(true)}
            >
              <Mic className="h-4 w-4" />
              Open Voice Agent
            </Button>
            <Button
              variant="secondary"
              className="gap-2"
              onClick={() => void loadBriefing(true)}
              disabled={briefLoading}
            >
              {briefLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              Refresh briefing
            </Button>
          </div>
        }
      />

      {projectId && (
        <VoiceAgentModal
          open={voiceOpen}
          onClose={() => setVoiceOpen(false)}
          projectId={projectId}
        />
      )}
      <PageBody>
      {error && (
        <div className="mb-4">
          <ErrorBlock message={error} onRetry={() => void loadBriefing(true)} />
        </div>
      )}

      {loading && findings.length === 0 && topPosts.length === 0 ? (
        <LoadingBlock />
      ) : postsCount === 0 && accounts.length === 0 ? (
        <EmptyState
          title="Nothing to analyse yet"
          description="Connect accounts and sync posts first. The agent will not invent findings."
          actionLabel="Open Connected Accounts"
          onAction={() => {
            window.location.href = "/accounts";
          }}
        />
      ) : (
        <div className="grid gap-8 lg:grid-cols-[1.25fr_0.75fr]">
          <FadeIn>
            <div className="space-y-5">
                <div className="flex items-start gap-3">
                    <Sparkles className="mt-0.5 h-4 w-4 text-zinc-500" />
                    <div>
                      <p className="text-sm font-medium text-ink">Daily briefing</p>
                      <p className="text-xs text-muted">
                        {accounts.length} accounts · {postsCount} published posts
                      </p>
                    </div>
                </div>

                {briefLoading && (
                  <div className="flex items-center gap-2 text-sm text-muted">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    {briefWriting
                      ? "Writing briefing…"
                      : "Checking for today’s briefing…"}
                  </div>
                )}

                {!briefLoading && briefing && (
                  <RichMessage content={briefing} postsById={postsById} />
                )}

                {!briefLoading && !briefing && (
                  <p className="text-sm text-muted">
                    No briefing for today yet. Click{" "}
                    <span className="text-ink">Refresh briefing</span> to generate
                    one.
                  </p>
                )}

                {topPosts.length > 0 && (
                  <div className="space-y-2 pt-2">
                    <p className="text-xs font-medium text-muted">Top posts</p>
                    {topPosts.map((p) => (
                      <PostCard key={p.id} post={p} compact />
                    ))}
                  </div>
                )}
            </div>
          </FadeIn>

          <div className="space-y-8">
            <div>
                <p className="mb-3 text-xs font-medium text-muted">Signals</p>
                {findings.filter((f) => f.source !== "competitor_intel").length === 0 &&
                findings.filter((f) => f.source === "competitor_intel").length === 0 ? (
                  <p className="text-sm text-muted">No stored signals yet.</p>
                ) : (
                  <div className="space-y-3">
                    {findings
                      .filter((f) => f.source !== "competitor_intel")
                      .slice(0, 4)
                      .map((f) => (
                        <p key={f.id} className="text-sm leading-relaxed text-zinc-300">
                          {f.text}
                        </p>
                      ))}
                    {findings
                      .filter((f) => f.source === "competitor_intel")
                      .slice(0, 2)
                      .map((f) => (
                        <p key={f.id} className="text-sm leading-relaxed text-zinc-400">
                          {f.text}
                        </p>
                      ))}
                  </div>
                )}
            </div>

            <div>
                <p className="mb-3 text-xs font-medium text-muted">Accounts</p>
                {accounts.length === 0 ? (
                  <p className="text-sm text-muted">No accounts connected.</p>
                ) : (
                  accounts.map((a) => (
                    <div
                      key={a.id}
                      className="flex items-center justify-between py-1.5 text-sm"
                    >
                      <span className="font-mono text-ink">@{a.username}</span>
                      <span className="text-muted">{formatNumber(a.followers)}</span>
                    </div>
                  ))
                )}
                <div className="mt-4 flex gap-2">
                  <Link href="/chat" className="flex-1">
                    <Button className="w-full">Open AI Chat</Button>
                  </Link>
                  <Link href="/generate">
                    <Button variant="secondary">Generate</Button>
                  </Link>
                </div>
            </div>
          </div>
        </div>
      )}
      </PageBody>
    </div>
  );
}
