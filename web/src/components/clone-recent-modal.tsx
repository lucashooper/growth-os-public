"use client";

import { useState, useEffect, useCallback } from "react";
import { Copy, Loader2, RefreshCw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { apiFetch } from "@/lib/api-client";
import { formatNumber, cn } from "@/lib/utils";
import { MediaImg } from "@/components/media-img";
import { GlassSelect, GLASS_SHEET } from "@/components/ui/glass-select";

type RecentPost = {
  id: string;
  hook: string;
  coverUrl: string | null;
  slides: string[];
  caption: string;
  theme: string;
  views: number;
  likes: number;
  publishedAt: string | null;
  shareUrl?: string | null;
  accountId?: string | null;
  meta?: {
    style?: string;
    tone?: string;
    visualSlides?: { backgroundUrl?: string; text?: string }[];
  };
};

type Account = {
  id: string;
  username: string;
  avatar: string;
  nickname: string;
  followers: number;
};

type CloneData = {
  slides?: string[];
  coverUrl?: string;
  shareUrl?: string;
  theme?: string;
  style?: string;
  tone?: string;
  hook?: string;
  caption?: string;
};

export function CloneRecentModal({
  open,
  onClose,
  onClone,
  projectId,
}: {
  open: boolean;
  onClose: () => void;
  onClone: (data: CloneData) => void;
  projectId?: string | null;
}) {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [selectedAccount, setSelectedAccount] = useState<string | null>(null);
  const [recentPosts, setRecentPosts] = useState<RecentPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [syncNote, setSyncNote] = useState<string | null>(null);

  const loadRecentPosts = useCallback(
    async (accountId: string) => {
      if (!accountId || !projectId) return [];
      setLoading(true);
      setError(null);

      const byAccount = await apiFetch<{ posts: RecentPost[] }>(
        `/api/posts?projectId=${projectId}&accountId=${accountId}&status=published`,
      );

      if (!byAccount.ok) {
        setError(byAccount.error || "Failed to load posts");
        setRecentPosts([]);
        setLoading(false);
        return [];
      }

      let posts = byAccount.data.posts;
      if (posts.length === 0) {
        const all = await apiFetch<{ posts: RecentPost[] }>(
          `/api/posts?projectId=${projectId}&status=published`,
        );
        if (all.ok) {
          posts = all.data.posts.filter(
            (p) => !p.accountId || p.accountId === accountId,
          );
        }
      }

      const next = posts.slice(0, 12);
      setRecentPosts(next);
      setLoading(false);
      return next;
    },
    [projectId],
  );

  const syncAccount = useCallback(
    async (accountId: string) => {
      setSyncing(true);
      setError(null);
      setSyncNote("Syncing TikTok… this can take up to a minute.");
      const res = await apiFetch<{
        success: boolean;
        error?: string;
        videosSynced?: number;
      }>(`/api/accounts/${accountId}/sync`, { method: "POST", retries: 0 });
      setSyncing(false);

      if (!res.ok) {
        setError(res.error || "Sync failed");
        setSyncNote(null);
        return;
      }

      const posts = await loadRecentPosts(accountId);
      if (posts.length > 0) {
        setSyncNote(`Synced ${res.data.videosSynced ?? posts.length} posts.`);
      } else {
        setSyncNote(null);
        setError(
          res.data.error ||
            "TikTok blocked the scrape this time. Try again, or open the account in a browser to confirm the username is public.",
        );
      }
    },
    [loadRecentPosts],
  );

  useEffect(() => {
    if (!open) return;
    if (!projectId) {
      setLoading(false);
      setError("No project selected.");
      return;
    }
    setLoading(true);
    setError(null);
    setSyncNote(null);
    setRecentPosts([]);

    async function boot() {
      const res = await apiFetch<{ accounts: Account[] }>(
        `/api/accounts?projectId=${projectId}`,
      );
      if (!res.ok || !res.data.accounts.length) {
        setError("No connected TikTok accounts in this project.");
        setAccounts([]);
        setLoading(false);
        return;
      }
      setAccounts(res.data.accounts);
      const first = res.data.accounts[0];
      setSelectedAccount(first.id);
      await loadRecentPosts(first.id);
    }

    void boot();
  }, [open, projectId, loadRecentPosts]);

  async function handleAccountChange(accountId: string) {
    setSelectedAccount(accountId);
    setSyncNote(null);
    await loadRecentPosts(accountId);
  }

  function handleClone(post: RecentPost) {
    const httpSlides = (post.slides || []).filter(
      (s) => typeof s === "string" && /^https?:\/\//i.test(s),
    );
    const cover =
      post.coverUrl ||
      post.meta?.visualSlides?.find((v) => v.backgroundUrl)?.backgroundUrl ||
      undefined;
    const share =
      post.shareUrl ||
      (/\d{15,21}/.test(post.hook)
        ? `https://www.tiktok.com/@${accounts.find((a) => a.id === selectedAccount)?.username || ""}/video/${post.hook.match(/(\d{15,21})/)?.[1] || ""}`
        : undefined);
    onClone({
      slides: httpSlides.length ? httpSlides : cover ? [cover] : undefined,
      coverUrl: cover,
      shareUrl: share,
      theme: post.theme || undefined,
      style: post.meta?.style || undefined,
      tone: post.meta?.tone || undefined,
      hook: `${post.hook} (Remix)`,
      caption: post.caption,
    });
    onClose();
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 p-4 backdrop-blur-[2px]">
      <div className={cn("w-full max-w-4xl", GLASS_SHEET)}>
        <div className="flex items-center justify-between border-b border-border p-4">
          <div>
            <h2 className="text-lg font-semibold text-ink">
              Clone from Recent TikTok
            </h2>
            <p className="text-sm text-muted">
              Reuse images and format from your published posts
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-muted hover:bg-surface hover:text-ink"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-4">
          {(loading || syncing) && accounts.length === 0 && (
            <div className="mb-4 h-10 animate-pulse rounded-lg bg-surface-2" />
          )}
          {accounts.length > 0 && (
            <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-end">
              <div className="min-w-0 flex-1">
                <label className="mb-2 block text-sm font-medium text-ink">
                  Select Account
                </label>
                <GlassSelect
                  aria-label="Select Account"
                  value={selectedAccount || ""}
                  onChange={(v) => void handleAccountChange(v)}
                  size="md"
                  options={accounts.map((account) => ({
                    value: account.id,
                    label: `@${account.username} (${formatNumber(account.followers)} followers)`,
                  }))}
                />
              </div>
              <Button
                type="button"
                variant="secondary"
                disabled={!selectedAccount || syncing}
                onClick={() => selectedAccount && void syncAccount(selectedAccount)}
              >
                {syncing ? (
                  <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="mr-1.5 h-4 w-4" />
                )}
                {syncing ? "Syncing…" : "Sync now"}
              </Button>
            </div>
          )}

          {error && (
            <div className="mb-4 rounded-lg border border-danger/30 bg-danger/10 p-3 text-sm text-danger">
              {error}
            </div>
          )}
          {syncNote && !error && (
            <p className="mb-3 text-xs text-muted">{syncNote}</p>
          )}

          {(loading || syncing) && recentPosts.length === 0 && (
            <div className="flex flex-col items-center justify-center gap-2 py-12">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="text-sm text-muted">
                {syncing ? "Pulling recent TikToks…" : "Loading posts…"}
              </p>
            </div>
          )}

          {!loading && !syncing && recentPosts.length === 0 && (
            <div className="py-12 text-center">
              <p className="mb-3 text-sm text-muted">
                No synced posts for this account yet.
              </p>
              <Button
                type="button"
                disabled={!selectedAccount || syncing}
                onClick={() => selectedAccount && void syncAccount(selectedAccount)}
              >
                <RefreshCw className="mr-1.5 h-4 w-4" />
                Sync this account
              </Button>
            </div>
          )}

          {recentPosts.length > 0 && (
            <div className="grid max-h-[500px] gap-3 overflow-y-auto sm:grid-cols-2 lg:grid-cols-3">
              {recentPosts.map((post) => (
                <button
                  key={post.id}
                  type="button"
                  onClick={() => handleClone(post)}
                  className="group w-full cursor-pointer text-left"
                >
                  <Card className="transition-all hover:border-primary/50 hover:shadow-md">
                    <CardContent className="p-3">
                      <div className="relative mb-2 aspect-[9/16] overflow-hidden rounded-lg bg-surface-2">
                        <MediaImg
                          src={post.coverUrl}
                          shareUrl={
                            post.shareUrl ||
                            (/\d{15,21}/.test(post.hook)
                              ? `https://www.tiktok.com/video/${post.hook.match(/(\d{15,21})/)?.[1] || ""}`
                              : null)
                          }
                          fallbackSeed={post.hook + post.id}
                          className="h-full w-full object-cover"
                        />
                        <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/0 transition-all group-hover:bg-black/50">
                          <span className="inline-flex translate-y-2 items-center rounded-xl bg-white px-3 py-1.5 text-xs font-medium text-black opacity-0 transition-all group-hover:translate-y-0 group-hover:opacity-100">
                            <Copy className="mr-1.5 h-3.5 w-3.5" />
                            Use This Format
                          </span>
                        </div>
                      </div>
                      <p className="mb-1 line-clamp-2 text-sm font-medium text-ink">
                        {post.hook}
                      </p>
                      <div className="flex items-center gap-2 text-xs text-muted">
                        <span>{formatNumber(post.views)} views</span>
                        <span>·</span>
                        <span>{formatNumber(post.likes)} likes</span>
                      </div>
                      {post.theme && (
                        <Badge tone="accent" className="mt-2">
                          {post.theme}
                        </Badge>
                      )}
                    </CardContent>
                  </Card>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t border-border p-4">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </div>
    </div>
  );
}
