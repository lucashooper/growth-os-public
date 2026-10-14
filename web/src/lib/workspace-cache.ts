"use client";

/**
 * Persistent workspace data cache for drafts + image packs + queue.
 * Survives route changes via module-level store + api-cache.
 */

import { useCallback, useEffect, useState } from "react";
import { apiFetch, peekApi } from "@/lib/api-client";
import { invalidateApiCache, setCachedApi } from "@/lib/api-cache";

export type CachedDraft = {
  id: string;
  hook: string;
  status: string;
  coverUrl?: string;
  createdAt?: string;
  meta?: { visualSlides?: { backgroundUrl?: string; backgroundImageUrl?: string }[] };
};

export type CachedQueueItem = {
  id: string;
  day: string;
  time: string;
  hook: string;
  status: string;
};

type Pack = {
  id: string;
  name: string;
  slug: string;
  description: string;
  orderMode: string;
  imageCount: number;
  emoji?: string;
  assets: { id: string; label: string; url: string }[];
};

type Store = {
  drafts: CachedDraft[];
  packs: Pack[];
  queue: CachedQueueItem[];
  queueHydrated: boolean;
  loadedAt: number;
};

const memory = new Map<string, Store>();

function draftsUrl(projectId: string) {
  return `/api/posts?projectId=${projectId}&status=draft&limit=24&lite=1`;
}
function packsUrl(projectId: string) {
  return `/api/image-packs?projectId=${projectId}`;
}
function dashboardUrl(projectId: string) {
  return `/api/projects/${projectId}/dashboard`;
}

function readStore(projectId: string): Store {
  const existing = memory.get(projectId);
  if (existing) return existing;
  const cachedDrafts =
    peekApi<{ posts: CachedDraft[] }>(draftsUrl(projectId))?.posts ||
    peekApi<{ posts: CachedDraft[] }>(`/api/posts?projectId=${projectId}`)?.posts?.filter(
      (p) => p.status === "draft" || p.status === "scheduled",
    ) ||
    [];
  const cachedPacks =
    peekApi<{ packs: Pack[] }>(packsUrl(projectId))?.packs || [];
  const cachedQueue =
    peekApi<{ queue: CachedQueueItem[] }>(dashboardUrl(projectId))?.queue || [];
  const init: Store = {
    drafts: cachedDrafts.slice(0, 24),
    packs: cachedPacks,
    queue: cachedQueue,
    queueHydrated: cachedQueue.length > 0 || Boolean(peekApi(dashboardUrl(projectId))),
    loadedAt:
      cachedDrafts.length || cachedPacks.length || cachedQueue.length
        ? Date.now()
        : 0,
  };
  memory.set(projectId, init);
  return init;
}

function writeStore(projectId: string, patch: Partial<Store>) {
  const prev = readStore(projectId);
  const next = { ...prev, ...patch, loadedAt: Date.now() };
  memory.set(projectId, next);
  if (patch.drafts) {
    setCachedApi(draftsUrl(projectId), { posts: patch.drafts });
  }
  if (patch.packs) {
    setCachedApi(packsUrl(projectId), { packs: patch.packs });
  }
  if (patch.queue) {
    const dash = peekApi<Record<string, unknown>>(dashboardUrl(projectId));
    setCachedApi(dashboardUrl(projectId), {
      ...(dash || {}),
      queue: patch.queue,
    });
    next.queueHydrated = true;
  }
  return next;
}

export function useWorkspaceCache(projectId: string | null | undefined) {
  const [drafts, setDrafts] = useState<CachedDraft[]>(() =>
    projectId ? readStore(projectId).drafts : [],
  );
  const [packs, setPacks] = useState<Pack[]>(() =>
    projectId ? readStore(projectId).packs : [],
  );
  const [queue, setQueueState] = useState<CachedQueueItem[]>(() =>
    projectId ? readStore(projectId).queue : [],
  );
  const [queueHydrated, setQueueHydrated] = useState(() =>
    projectId ? readStore(projectId).queueHydrated : false,
  );
  const [loading, setLoading] = useState(() => {
    if (!projectId) return false;
    const s = readStore(projectId);
    return s.drafts.length === 0 && s.packs.length === 0 && s.queue.length === 0;
  });

  const refresh = useCallback(
    async (opts?: { silent?: boolean }) => {
      if (!projectId) return;
      const current = readStore(projectId);
      if (
        !opts?.silent &&
        current.drafts.length === 0 &&
        current.packs.length === 0 &&
        current.queue.length === 0
      ) {
        setLoading(true);
      }
      const [dRes, pRes, qRes] = await Promise.all([
        apiFetch<{ posts: CachedDraft[] }>(draftsUrl(projectId)),
        apiFetch<{ packs: Pack[] }>(packsUrl(projectId)),
        apiFetch<{ queue: CachedQueueItem[] }>(dashboardUrl(projectId)),
      ]);
      const nextDrafts = dRes.ok
        ? (dRes.data.posts || [])
            .filter((p) => p.status === "draft" || p.status === "scheduled")
            .slice(0, 24)
        : readStore(projectId).drafts;
      const nextPacks = pRes.ok
        ? pRes.data.packs || []
        : readStore(projectId).packs;
      const nextQueue = qRes.ok
        ? qRes.data.queue || []
        : readStore(projectId).queue;
      writeStore(projectId, {
        drafts: nextDrafts,
        packs: nextPacks,
        queue: nextQueue,
        queueHydrated: true,
      });
      setDrafts(nextDrafts);
      setPacks(nextPacks);
      setQueueState(nextQueue);
      setQueueHydrated(true);
      setLoading(false);
    },
    [projectId],
  );

  useEffect(() => {
    if (!projectId) return;
    const s = readStore(projectId);
    setDrafts(s.drafts);
    setPacks(s.packs);
    setQueueState(s.queue);
    setQueueHydrated(s.queueHydrated);
    const stale = Date.now() - s.loadedAt > 5 * 60 * 1000;
    void refresh({
      silent:
        s.drafts.length > 0 ||
        s.packs.length > 0 ||
        s.queue.length > 0 ||
        !stale,
    });
  }, [projectId, refresh]);

  const prependDraft = useCallback(
    (draft: CachedDraft) => {
      if (!projectId) return;
      const next = [draft, ...readStore(projectId).drafts.filter((d) => d.id !== draft.id)].slice(
        0,
        24,
      );
      writeStore(projectId, { drafts: next });
      setDrafts(next);
    },
    [projectId],
  );

  const removeDraft = useCallback(
    (id: string) => {
      if (!projectId) return;
      const next = readStore(projectId).drafts.filter((d) => d.id !== id);
      writeStore(projectId, { drafts: next });
      setDrafts(next);
      invalidateApiCache(`/api/posts?projectId=${projectId}`);
    },
    [projectId],
  );

  return {
    drafts,
    packs,
    queue,
    queueHydrated,
    loading,
    refresh,
    prependDraft,
    removeDraft,
    setPacks: (next: Pack[]) => {
      if (!projectId) return;
      writeStore(projectId, { packs: next });
      setPacks(next);
    },
    setQueue: (next: CachedQueueItem[]) => {
      if (!projectId) return;
      writeStore(projectId, { queue: next, queueHydrated: true });
      setQueueState(next);
      setQueueHydrated(true);
    },
  };
}

/** Prefetch helper for AppPrefetcher / Workspace root */
export async function warmWorkspaceCache(projectId: string) {
  await Promise.all([
    apiFetch(draftsUrl(projectId)),
    apiFetch(packsUrl(projectId)),
    apiFetch(`/api/format-references?projectId=${projectId}`),
    apiFetch(dashboardUrl(projectId)),
  ]);
}

/** Sync peek for queue page instant paint */
export function peekWorkspaceQueue(
  projectId: string,
): CachedQueueItem[] {
  return readStore(projectId).queue;
}

export function isQueueHydrated(projectId: string): boolean {
  return readStore(projectId).queueHydrated;
}
