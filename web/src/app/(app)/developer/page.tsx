"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, Play } from "lucide-react";
import { PageHeader, PageBody } from "@/components/page-header";
import { FadeIn } from "@/components/fade-in";
import { ErrorBlock, LoadingBlock } from "@/components/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { apiFetch } from "@/lib/api-client";

type DevLog = {
  id: string;
  level: string;
  category: string;
  message: string;
  meta: unknown;
  createdAt: string;
};

type AiLog = {
  id: string;
  action: string;
  provider: string;
  model: string;
  latencyMs: number;
  tokensIn: number;
  tokensOut: number;
  ok: boolean;
  error: string | null;
  responseText: string;
  meta: unknown;
  createdAt: string;
};

type Job = {
  id: string;
  type: string;
  status: string;
  startedAt: string;
  finishedAt: string | null;
  detail: string | null;
  error: string | null;
};

type SyncLog = {
  id: string;
  status: string;
  startedAt: string;
  error: string | null;
  account?: { username: string };
};

export default function DeveloperPage() {
  const [tab, setTab] = useState<"all" | "sync" | "ai" | "api" | "job" | "db" | "ailogs">(
    "ailogs",
  );
  const [logs, setLogs] = useState<DevLog[]>([]);
  const [aiLogs, setAiLogs] = useState<AiLog[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [syncLogs, setSyncLogs] = useState<SyncLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState<string | null>(null);
  const [onlyErrors, setOnlyErrors] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const cat = tab === "all" || tab === "ailogs" ? "" : `&category=${tab}`;
    const [logRes, jobRes, syncRes, aiRes] = await Promise.all([
      apiFetch<{ logs: DevLog[] }>(`/api/logs?limit=150${cat}`),
      apiFetch<{ jobs: Job[] }>("/api/jobs"),
      apiFetch<{ logs: SyncLog[] }>("/api/sync-logs?limit=30"),
      apiFetch<{ logs: AiLog[] }>(
        `/api/ai-logs?limit=80${onlyErrors ? "&errors=1" : ""}`,
      ),
    ]);
    if (!logRes.ok) setError(logRes.error);
    else setLogs(logRes.data.logs);
    if (jobRes.ok) setJobs(jobRes.data.jobs);
    if (syncRes.ok) setSyncLogs(syncRes.data.logs);
    if (aiRes.ok) setAiLogs(aiRes.data.logs);
    else if (tab === "ailogs") setError(aiRes.error);
    setLoading(false);
  }, [tab, onlyErrors]);

  useEffect(() => {
    void load();
    const t = setInterval(() => void load(), 10000);
    return () => clearInterval(t);
  }, [load]);

  async function runJob(type: string) {
    setRunning(type);
    const res = await apiFetch("/api/jobs", {
      method: "POST",
      body: JSON.stringify({ type }),
    });
    setRunning(null);
    if (!res.ok) setError(res.error);
    await load();
  }

  return (
    <div className="flex min-h-full flex-col">
      <PageHeader
        title="Developer Console"
        description="AI logs, sync logs, jobs, errors, and database writes."
        action={
          <Button variant="secondary" onClick={load}>
            Refresh
          </Button>
        }
      />

      <PageBody>
      {error && (
        <div className="mb-4">
          <ErrorBlock message={error} onRetry={load} />
        </div>
      )}

      <div className="mb-4 flex flex-wrap gap-2">
        {(["ailogs", "all", "sync", "ai", "api", "job", "db"] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`rounded-full border px-3 py-1.5 text-xs ${
              tab === t
                ? "border-primary/40 bg-primary/15 text-primary"
                : "border-border text-muted"
            }`}
          >
            {t === "ailogs" ? "AI Logs" : t}
          </button>
        ))}
      </div>

      <div className="mb-4 grid gap-3 md:grid-cols-3">
        {[
          { type: "sync_accounts", label: "Sync accounts" },
          { type: "sync_competitors", label: "Sync competitors" },
          { type: "analyse_performance", label: "Analyse performance" },
          { type: "compute_experiments", label: "Compute experiments" },
          { type: "generate_recommendations", label: "Generate recommendations" },
        ].map((j) => (
          <Button
            key={j.type}
            variant="secondary"
            className="justify-start gap-2"
            disabled={running === j.type}
            onClick={() => runJob(j.type)}
          >
            {running === j.type ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Play className="h-4 w-4" />
            )}
            {j.label}
          </Button>
        ))}
      </div>

      {tab === "ailogs" ? (
        <Card className="min-h-[420px]">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>AI action logs</CardTitle>
            <label className="flex items-center gap-2 text-xs text-muted">
              <input
                type="checkbox"
                checked={onlyErrors}
                onChange={(e) => setOnlyErrors(e.target.checked)}
              />
              Errors only
            </label>
          </CardHeader>
          <CardContent className="max-h-[640px] space-y-2 overflow-y-auto">
            {loading && <LoadingBlock />}
            {!loading && aiLogs.length === 0 && (
              <p className="text-sm text-muted">
                No AI logs yet. Generate a carousel or refresh a briefing.
              </p>
            )}
            {aiLogs.map((l) => (
              <div
                key={l.id}
                className="rounded-xl border border-border/60 px-3 py-2.5 text-xs"
              >
                <div className="mb-1 flex flex-wrap items-center gap-2">
                  <Badge tone={l.ok ? "success" : "danger"}>
                    {l.ok ? "ok" : "error"}
                  </Badge>
                  <Badge>{l.action}</Badge>
                  <span className="font-mono text-muted">
                    {l.provider}/{l.model}
                  </span>
                  <span className="text-muted">{l.latencyMs}ms</span>
                  <span className="text-muted">
                    ~{l.tokensIn}+{l.tokensOut} tok
                  </span>
                  <span className="font-mono text-muted">
                    {new Date(l.createdAt).toLocaleString()}
                  </span>
                </div>
                {l.error && <p className="text-warning">{l.error}</p>}
                {l.responseText && (
                  <pre className="mt-1 max-h-28 overflow-auto rounded-lg bg-bg/60 p-2 font-mono text-[10px] text-muted">
                    {l.responseText.slice(0, 800)}
                  </pre>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          <FadeIn>
            <Card className="min-h-[420px]">
              <CardHeader>
                <CardTitle>Structured logs</CardTitle>
              </CardHeader>
              <CardContent className="max-h-[520px] space-y-2 overflow-y-auto">
                {loading && <LoadingBlock />}
                {!loading && logs.length === 0 && (
                  <p className="text-sm text-muted">No logs yet.</p>
                )}
                {logs.map((l) => (
                  <div
                    key={l.id}
                    className="rounded-xl border border-border/60 px-3 py-2 text-xs"
                  >
                    <div className="mb-1 flex flex-wrap items-center gap-2">
                      <Badge
                        tone={
                          l.level === "error"
                            ? "danger"
                            : l.level === "warn"
                              ? "warning"
                              : "default"
                        }
                      >
                        {l.level}
                      </Badge>
                      <Badge>{l.category}</Badge>
                      <span className="font-mono text-muted">
                        {new Date(l.createdAt).toLocaleTimeString()}
                      </span>
                    </div>
                    <p className="text-ink">{l.message}</p>
                  </div>
                ))}
              </CardContent>
            </Card>
          </FadeIn>

          <div className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Background jobs</CardTitle>
              </CardHeader>
              <CardContent className="max-h-[240px] space-y-2 overflow-y-auto">
                {jobs.map((j) => (
                  <div
                    key={j.id}
                    className="rounded-xl border border-border/60 px-3 py-2 text-xs"
                  >
                    <div className="flex items-center gap-2">
                      <Badge
                        tone={
                          j.status === "success"
                            ? "success"
                            : j.status === "failed"
                              ? "danger"
                              : "primary"
                        }
                      >
                        {j.status}
                      </Badge>
                      <span className="font-mono text-ink">{j.type}</span>
                    </div>
                    <p className="mt-1 text-muted">
                      {j.detail || j.error || new Date(j.startedAt).toLocaleString()}
                    </p>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Recent syncs</CardTitle>
              </CardHeader>
              <CardContent className="max-h-[240px] space-y-2 overflow-y-auto">
                {syncLogs.map((s) => (
                  <div
                    key={s.id}
                    className="flex items-center justify-between rounded-xl border border-border/60 px-3 py-2 text-xs"
                  >
                    <span className="font-mono text-ink">
                      @{s.account?.username ?? "—"}
                    </span>
                    <Badge
                      tone={
                        s.status === "success"
                          ? "success"
                          : s.status === "failed"
                            ? "danger"
                            : "default"
                      }
                    >
                      {s.status}
                    </Badge>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        </div>
      )}
      </PageBody>
    </div>
  );
}
