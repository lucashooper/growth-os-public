"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, RefreshCw, Link2, Trash2, Unplug } from "lucide-react";
import { PageHeader, PageBody } from "@/components/page-header";
import { FadeIn } from "@/components/fade-in";
import { EmptyState, ErrorBlock, LoadingBlock } from "@/components/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useProject } from "@/lib/project-context";
import { apiFetch, peekApi } from "@/lib/api-client";
import { formatNumber } from "@/lib/utils";
import { PublishingStatusCard } from "./PUBLISHING_STATUS";

type SyncStep = {
  ts: string;
  step: string;
  status: "ok" | "warn" | "error";
  message: string;
  raw?: unknown;
};

type Account = {
  id: string;
  platform: string;
  username: string;
  nickname: string;
  displayName?: string;
  avatar: string;
  bio?: string;
  followers: number;
  following?: number;
  hearts?: number;
  videoCount?: number;
  lastSyncAt: string | null;
  status: string;
  lastError: string | null;
  oauthConnected?: boolean;
  oauthConnectedAt?: string | null;
  oauthScopes?: string;
  _count?: { posts: number };
};

type SyncLog = {
  id: string;
  status: string;
  startedAt: string;
  finishedAt: string | null;
  error: string | null;
  attempt: number;
  steps: SyncStep[];
  rawResponse: unknown;
  account?: { username: string; nickname: string };
};

export default function AccountsPage() {
  const { project, projectId, loading: projectLoading } = useProject();
  const accountsUrl = projectId
    ? `/api/accounts?projectId=${projectId}`
    : null;
  const logsUrl = projectId
    ? `/api/sync-logs?projectId=${projectId}&limit=30`
    : null;
  const [accounts, setAccounts] = useState<Account[]>(
    () =>
      (accountsUrl
        ? peekApi<{ accounts: Account[] }>(accountsUrl)?.accounts
        : null) ?? [],
  );
  const [logs, setLogs] = useState<SyncLog[]>(
    () =>
      (logsUrl ? peekApi<{ logs: SyncLog[] }>(logsUrl)?.logs : null) ?? [],
  );
  const [loading, setLoading] = useState(() => accounts.length === 0);
  const [error, setError] = useState<string | null>(null);
  const [oauthNotice, setOauthNotice] = useState<string | null>(null);
  const [username, setUsername] = useState("");
  const [nickname, setNickname] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [brokenAvatars, setBrokenAvatars] = useState<Record<string, boolean>>(
    {},
  );
  const [lastSync, setLastSync] = useState<{
    success: boolean;
    steps: SyncStep[];
    rawValues?: unknown;
    error?: string;
    videosSynced?: number;
  } | null>(null);
  const [showLogs, setShowLogs] = useState(false);

  function startOAuth(forAccountId?: string) {
    if (!projectId) return;
    const q = new URLSearchParams({ projectId });
    if (forAccountId) q.set("accountId", forAccountId);
    window.location.href = `/api/tiktok/oauth/start?${q.toString()}`;
  }

  async function disconnectOAuth(accountId: string) {
    if (
      !confirm(
        "Disconnect TikTok publishing and revoke Growth OS access on TikTok? Analytics sync stays; the next Connect should show a full consent screen.",
      )
    ) {
      return;
    }
    setBusyId(accountId);
    setError(null);
    const res = await apiFetch("/api/tiktok/disconnect", {
      method: "POST",
      body: JSON.stringify({ accountId }),
    });
    setBusyId(null);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setOauthNotice("Publishing disconnected — account kept for analytics.");
    await load();
  }

  async function removeAccount(accountId: string, handle: string) {
    if (
      !confirm(
        `Remove @${handle} completely from Growth OS? This deletes the connection and stored sync data for this account.`,
      )
    ) {
      return;
    }
    setBusyId(accountId);
    setError(null);
    const res = await apiFetch(`/api/accounts/${accountId}`, {
      method: "DELETE",
    });
    setBusyId(null);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    await load();
  }

  const load = useCallback(async () => {
    if (!projectId) return;
    const accUrl = `/api/accounts?projectId=${projectId}`;
    const logUrl = `/api/sync-logs?projectId=${projectId}&limit=30`;
    const hasCache = Boolean(peekApi(accUrl));
    if (!hasCache) setLoading(true);
    setError(null);
    const [accRes, logRes] = await Promise.all([
      apiFetch<{ accounts: Account[] }>(accUrl, { retries: 1 }),
      apiFetch<{ logs: SyncLog[] }>(logUrl, { retries: 1 }),
    ]);
    if (!accRes.ok) setError(accRes.error);
    else {
      setAccounts(accRes.data.accounts);
      setBrokenAvatars({});
    }
    if (logRes.ok) setLogs(logRes.data.logs);
    setLoading(false);
  }, [projectId]);

  useEffect(() => {
    void load();
  }, [load]);

  // Poll every 2.5s while any account is SYNCING
  useEffect(() => {
    const syncing = accounts.some(
      (a) => a.status?.toUpperCase() === "SYNCING",
    );
    if (!syncing || !projectId) return;
    const t = window.setInterval(() => {
      void (async () => {
        const res = await apiFetch<{ accounts: Account[] }>(
          `/api/accounts?projectId=${projectId}`,
          { skipCache: true },
        );
        if (!res.ok) return;
        const next = res.data.accounts || [];
        setAccounts(next);
        const still = next.some((a) => a.status?.toUpperCase() === "SYNCING");
        if (!still) {
          const logRes = await apiFetch<{ logs: SyncLog[] }>(
            `/api/sync-logs?projectId=${projectId}&limit=30`,
            { skipCache: true },
          );
          if (logRes.ok) setLogs(logRes.data.logs || []);
        }
      })();
    }, 2500);
    return () => window.clearInterval(t);
  }, [accounts, projectId]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const oauth = params.get("oauth");
    if (oauth === "success") {
      setError(null);
      setOauthNotice("TikTok connected — this account can publish carousels.");
      void load();
      window.history.replaceState({}, "", "/accounts");
    } else if (oauth === "error") {
      setError(params.get("message") || "TikTok OAuth failed");
      window.history.replaceState({}, "", "/accounts");
    }
  }, [load]);

  async function addAccount() {
    if (!projectId || !username.trim()) return;
    setAdding(true);
    setError(null);
    const res = await apiFetch<{
      account: Account;
      sync: {
        success: boolean;
        steps: SyncStep[];
        rawValues?: unknown;
        error?: string;
      } | null;
    }>("/api/accounts", {
      method: "POST",
      body: JSON.stringify({
        projectId,
        username,
        nickname,
        platform: "tiktok",
        sync: true,
      }),
    });
    setAdding(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setUsername("");
    setNickname("");
    if (res.data.sync) setLastSync(res.data.sync);
    setShowLogs(true);
    await load();
  }

  async function syncAccount(id: string) {
    setBusyId(id);
    setError(null);
    // Optimistic SYNCING badge
    setAccounts((prev) =>
      prev.map((a) => (a.id === id ? { ...a, status: "SYNCING" } : a)),
    );
    const res = await apiFetch<{
      status?: string;
      message?: string;
      success?: boolean;
      steps?: SyncStep[];
      rawValues?: unknown;
      error?: string;
      videosSynced?: number;
      logs?: SyncLog[];
    }>(`/api/accounts/${id}/sync`, { method: "POST", retries: 0 });
    setBusyId(null);
    if (!res.ok) {
      setError(res.error);
      setAccounts((prev) =>
        prev.map((a) => (a.id === id ? { ...a, status: "error" } : a)),
      );
      return;
    }
    // Async path returns 202 SYNCING — poll until active/error
    if (res.data.status === "SYNCING") {
      setLastSync({
        success: true,
        steps: [
          {
            ts: new Date().toISOString(),
            step: "async_sync",
            status: "ok",
            message: res.data.message || "Sync started in background",
          },
        ],
        videosSynced: 0,
      });
      setShowLogs(true);
      return;
    }
    // Legacy sync response (if any)
    setLastSync({
      success: Boolean(res.data.success),
      steps: res.data.steps || [],
      rawValues: res.data.rawValues,
      error: res.data.error,
      videosSynced: res.data.videosSynced,
    });
    if (res.data.logs) setLogs(res.data.logs);
    setShowLogs(true);
    await load();
  }

  if (projectLoading || !project) {
    return <LoadingBlock label="Loading workspace…" />;
  }

  return (
    <div className="flex min-h-full flex-col">
      <PageHeader
        title="Connected Accounts"
        description={`${project.name} · sync analytics · OAuth for auto-post`}
        action={
          <Button className="gap-2" onClick={() => startOAuth()}>
            Connect TikTok
          </Button>
        }
      />

      <PageBody>
      {oauthNotice && (
        <div className="mb-4 rounded-xl border border-primary/30 bg-primary/10 px-4 py-3 text-sm text-ink">
          {oauthNotice}
          <button
            type="button"
            className="ml-3 text-xs text-muted underline"
            onClick={() => setOauthNotice(null)}
          >
            Dismiss
          </button>
        </div>
      )}
      {error && <div className="mb-4"><ErrorBlock message={error} onRetry={load} /></div>}

      <FadeIn>
        <PublishingStatusCard accounts={accounts} />

        <div className="mb-6 flex flex-wrap items-end gap-3">
            <div className="min-w-[200px] flex-1">
              <label className="text-xs text-muted">TikTok username</label>
              <input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="zeno.focus"
                className="mt-1.5 h-9 w-full rounded-lg border border-white/[0.06] bg-transparent px-3 text-sm"
              />
            </div>
            <div className="min-w-[160px] flex-1">
              <label className="text-xs text-muted">Nickname</label>
              <input
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
                placeholder="Zeno Main"
                className="mt-1.5 h-9 w-full rounded-lg border border-white/[0.06] bg-transparent px-3 text-sm"
              />
            </div>
            <Button size="sm" onClick={addAccount} disabled={adding}>
              {adding ? <Loader2 className="h-4 w-4 animate-spin" /> : "Add & sync"}
            </Button>
        </div>
      </FadeIn>

      {loading ? (
        <LoadingBlock />
      ) : accounts.length === 0 ? (
        <EmptyState
          title="No accounts yet"
          description="Click Connect TikTok to authorise a sandbox account, or add a username for analytics-only sync."
          actionLabel="Connect TikTok"
          onAction={() => startOAuth()}
        />
      ) : (
        <div className="mb-8 divide-y divide-white/[0.06] border-y border-white/[0.06]">
          {accounts.map((acc) => {
            const avatarIsUrl =
              acc.avatar?.startsWith("http") && !brokenAvatars[acc.id];
            const initial = (
              acc.displayName ||
              acc.nickname ||
              acc.username ||
              "?"
            )
              .replace(/^@/, "")
              .slice(0, 1)
              .toUpperCase();
            return (
              <div
                key={acc.id}
                className="flex items-center gap-3 py-3"
              >
                  <div className="flex min-w-0 flex-1 items-center gap-3">
                    {avatarIsUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={acc.avatar}
                        alt={`@${acc.username}`}
                        className="h-8 w-8 shrink-0 rounded-full object-cover"
                        referrerPolicy="no-referrer"
                        onError={() =>
                          setBrokenAvatars((prev) => ({
                            ...prev,
                            [acc.id]: true,
                          }))
                        }
                      />
                    ) : (
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/[0.06] text-xs font-semibold">
                        {initial}
                      </span>
                    )}
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-mono text-sm text-ink">@{acc.username}</p>
                        {acc.oauthConnected ? (
                          <Badge tone="success">Publishing</Badge>
                        ) : (
                          <span className="text-[11px] text-zinc-500">Analytics</span>
                        )}
                        {(acc.status === "SYNCING" ||
                          acc.status === "syncing") && (
                          <span className="inline-flex items-center gap-1 text-[11px] text-zinc-400">
                            <Loader2 className="h-3 w-3 animate-spin" />
                            Syncing
                          </span>
                        )}
                        {acc.status === "error" && (
                          <Badge tone="danger">Error</Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted">
                        {formatNumber(acc.followers)} followers
                        {acc._count?.posts ? ` · ${acc._count.posts} posts` : ""}
                        {acc.lastSyncAt && ` · ${new Date(acc.lastSyncAt).toLocaleDateString()}`}
                      </p>
                      {acc.lastError && (
                        <p className="mt-1 text-xs text-danger">{acc.lastError}</p>
                      )}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-0.5">
                    <button
                      type="button"
                      title="Sync"
                      className="rounded-md p-1.5 text-zinc-500 hover:bg-white/[0.06] hover:text-white"
                      onClick={() => syncAccount(acc.id)}
                      disabled={busyId === acc.id}
                    >
                      {busyId === acc.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <RefreshCw className="h-3.5 w-3.5" />
                      )}
                    </button>
                    {!acc.oauthConnected ? (
                      <button
                        type="button"
                        title="Connect TikTok"
                        className="rounded-md p-1.5 text-zinc-500 hover:bg-white/[0.06] hover:text-white"
                        onClick={() => startOAuth(acc.id)}
                        disabled={busyId === acc.id}
                      >
                        <Link2 className="h-3.5 w-3.5" />
                      </button>
                    ) : (
                      <button
                        type="button"
                        title="Disconnect publishing"
                        className="rounded-md p-1.5 text-zinc-500 hover:bg-white/[0.06] hover:text-white"
                        onClick={() => disconnectOAuth(acc.id)}
                        disabled={busyId === acc.id}
                      >
                        <Unplug className="h-3.5 w-3.5" />
                      </button>
                    )}
                    <button
                      type="button"
                      title="Remove"
                      className="rounded-md p-1.5 text-zinc-500 hover:bg-white/[0.06] hover:text-red-400"
                      onClick={() => removeAccount(acc.id, acc.username)}
                      disabled={busyId === acc.id}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
              </div>
            );
          })}
        </div>
      )}

      {logs.length > 0 && (
        <button
          type="button"
          className="mb-4 text-xs text-zinc-500 hover:text-white"
          onClick={() => setShowLogs((v) => !v)}
        >
          {showLogs ? "Hide sync logs" : "Sync logs"}
        </button>
      )}

      {showLogs && logs.length > 0 && (
        <div className="mt-8">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-medium text-ink">Sync history</h2>
            <button
              type="button"
              className="text-xs text-zinc-500 hover:text-white"
              onClick={() => setShowLogs(false)}
            >
              Hide
            </button>
          </div>
          <div className="space-y-1">
            {logs.map((log) => {
              const account = log.account;
              const elapsed = log.finishedAt
                ? Math.round(
                    (new Date(log.finishedAt).getTime() -
                      new Date(log.startedAt).getTime()) /
                      1000,
                  )
                : null;
              return (
                <div
                  key={log.id}
                  className="flex items-center justify-between gap-3 py-2 text-sm"
                >
                  <p className="font-mono text-ink">
                    @{account?.username || "Unknown"}
                  </p>
                  <p className="text-xs text-muted">
                    {log.status}
                    {elapsed !== null && ` · ${elapsed}s`}
                    {" · "}
                    {new Date(log.startedAt).toLocaleString()}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      )}
      </PageBody>
    </div>
  );
}
