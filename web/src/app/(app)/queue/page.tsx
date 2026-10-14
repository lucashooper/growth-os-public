"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { CalendarPlus } from "lucide-react";
import { PageHeader, PageBody } from "@/components/page-header";
import { EmptyState, ErrorBlock, LoadingBlock } from "@/components/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ScheduleModal } from "@/components/schedule-modal";
import { useProject } from "@/lib/project-context";
import { apiFetch } from "@/lib/api-client";
import {
  isQueueHydrated,
  peekWorkspaceQueue,
  useWorkspaceCache,
  type CachedQueueItem,
} from "@/lib/workspace-cache";

const days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

export default function QueuePage() {
  return (
    <Suspense fallback={<LoadingBlock />}>
      <QueuePageInner />
    </Suspense>
  );
}

function QueuePageInner() {
  const { project, projectId, loading: projectLoading } = useProject();
  const searchParams = useSearchParams();
  const upgraded = searchParams.get("upgraded") === "true";
  const {
    queue: cachedQueue,
    queueHydrated,
    setQueue,
    refresh,
  } = useWorkspaceCache(projectId);
  const [items, setItems] = useState<CachedQueueItem[]>(() =>
    projectId ? peekWorkspaceQueue(projectId) : [],
  );
  const [error, setError] = useState<string | null>(null);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  // Instant paint: only show Loading when we've never hydrated this project
  const [hydrating, setHydrating] = useState(() =>
    projectId ? !isQueueHydrated(projectId) && peekWorkspaceQueue(projectId).length === 0 : true,
  );

  useEffect(() => {
    setItems(cachedQueue);
    if (queueHydrated) setHydrating(false);
  }, [cachedQueue, queueHydrated]);

  const load = useCallback(async () => {
    if (!projectId) return;
    const warm =
      isQueueHydrated(projectId) || peekWorkspaceQueue(projectId).length > 0;
    if (!warm) setHydrating(true);
    const url = `/api/projects/${projectId}/dashboard`;
    try {
      const res = await apiFetch<{ queue: CachedQueueItem[] }>(url);
      if (!res.ok) setError(res.error);
      else {
        setItems(res.data.queue || []);
        setQueue(res.data.queue || []);
        setError(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Queue failed to load");
    } finally {
      setHydrating(false);
    }
  }, [projectId, setQueue]);

  useEffect(() => {
    if (!projectId) return;
    if (isQueueHydrated(projectId) || peekWorkspaceQueue(projectId).length > 0) {
      setHydrating(false);
      return;
    }
    void load();
  }, [load, projectId]);

  if (projectLoading || !project || !projectId) return <LoadingBlock />;

  // Never flash Loading once we know the store was hydrated (even if empty)
  const showEmptyLoading = hydrating && items.length === 0 && !queueHydrated;

  return (
    <div className="flex min-h-full flex-col">
      <PageHeader
        title="Queue"
        description={`${project.name} · schedule a post or publish to TikTok now`}
        action={
          <Button className="gap-1.5" onClick={() => setScheduleOpen(true)}>
            <CalendarPlus className="h-4 w-4" />
            Schedule post
          </Button>
        }
      />
      <PageBody>
      {upgraded && (
        <p className="mb-4 rounded-xl border border-primary/30 bg-primary/10 px-3 py-2 text-xs text-ink">
          You&apos;re on a Growth OS plan. Manage billing anytime from the sidebar.
        </p>
      )}
      {error && (
        <div className="mb-4">
          <ErrorBlock message={error} onRetry={load} />
        </div>
      )}
      {showEmptyLoading ? (
        <LoadingBlock />
      ) : items.length === 0 ? (
        <EmptyState
          title="Queue is empty"
          description="Schedule a post into a day/time slot, or post to TikTok immediately."
          actionLabel="Schedule post"
          onAction={() => setScheduleOpen(true)}
        />
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {days.map((day) => {
            const dayItems = items.filter((i) => i.day === day);
            return (
              <Card key={day}>
                <CardContent>
                  <p className="mb-3 text-sm font-medium text-ink">{day}</p>
                  {dayItems.length === 0 ? (
                    <button
                      type="button"
                      onClick={() => setScheduleOpen(true)}
                      className="w-full rounded-xl border border-dashed border-border px-3 py-4 text-xs text-muted hover:border-primary/40 hover:text-ink"
                    >
                      + Schedule into {day}
                    </button>
                  ) : (
                    dayItems.map((item) => (
                      <div
                        key={item.id}
                        className="mb-2 rounded-xl border border-border px-3 py-2"
                      >
                        <div className="mb-1 flex justify-between">
                          <span className="font-mono text-xs text-muted">{item.time}</span>
                          <Badge>{item.status}</Badge>
                        </div>
                        <p className="text-sm text-ink">{item.hook}</p>
                      </div>
                    ))
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      </PageBody>
      <ScheduleModal
        open={scheduleOpen}
        onClose={() => setScheduleOpen(false)}
        projectId={projectId}
        onScheduled={() => {
          void load();
          void refresh({ silent: true });
        }}
      />
    </div>
  );
}
