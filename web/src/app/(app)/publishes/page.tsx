"use client";

import { useCallback, useEffect, useState } from "react";
import { useProject } from "@/lib/project-context";
import { apiFetch } from "@/lib/api-client";
import { PageHeader, PageBody } from "@/components/page-header";
import { LoadingBlock, ErrorBlock } from "@/components/empty-state";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, CheckCircle2, XCircle, Clock, AlertCircle } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

type PublishAttempt = {
  id: string;
  postId: string;
  accountId: string;
  scheduledAt: string;
  actualPublishAt: string | null;
  status: string;
  attempt: number;
  maxRetries: number;
  publishId: string | null;
  error: string | null;
  priority: number;
  source: string;
  createdAt: string;
  post: {
    hook: string;
    coverUrl: string | null;
  };
  account: {
    username: string;
    avatar: string | null;
  };
};

type PublishHealth = {
  accountId: string;
  lastPublishAt: string | null;
  lastSuccessAt: string | null;
  lastFailureAt: string | null;
  publishCount24h: number;
  publishCount1h: number;
  successCount: number;
  failureCount: number;
  successRate: number;
  isRateLimited: boolean;
  rateLimitUntil: string | null;
  nextAvailableAt: string | null;
  account: {
    username: string;
    avatar: string | null;
  };
};

function StatusBadge({ status, attempt, maxRetries }: { status: string; attempt: number; maxRetries: number }) {
  if (status === "PUBLISHING") {
    return (
      <Badge className="gap-1.5 bg-primary/20 text-primary">
        <Loader2 className="h-3 w-3 animate-spin" />
        Publishing
      </Badge>
    );
  }
  if (status === "PENDING") {
    return (
      <Badge className="gap-1.5">
        <Clock className="h-3 w-3" />
        Pending
      </Badge>
    );
  }
  if (status === "QUEUED") {
    return (
      <Badge className="gap-1.5">
        Queued
      </Badge>
    );
  }
  if (status === "COMPLETED") {
    return (
      <Badge className="gap-1.5 bg-success/20 text-success">
        <CheckCircle2 className="h-3 w-3" />
        Published
      </Badge>
    );
  }
  if (status === "FAILED") {
    return (
      <Badge className="gap-1.5 bg-danger/20 text-danger">
        <XCircle className="h-3 w-3" />
        Failed (Retry {attempt}/{maxRetries})
      </Badge>
    );
  }
  if (status === "ABANDONED") {
    return (
      <Badge className="gap-1.5 bg-warning/20 text-warning">
        <AlertCircle className="h-3 w-3" />
        Abandoned
      </Badge>
    );
  }
  return <Badge>{status}</Badge>;
}

export default function PublishesPage() {
  const { project, projectId, loading: projectLoading } = useProject();
  const [attempts, setAttempts] = useState<PublishAttempt[]>([]);
  const [health, setHealth] = useState<PublishHealth[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!projectId) return;
    
    setLoading(true);
    setError(null);

    const [attemptsRes, healthRes] = await Promise.all([
      apiFetch<{ attempts: PublishAttempt[] }>(
        `/api/publish-attempts?projectId=${projectId}&limit=100`
      ),
      apiFetch<{ health: PublishHealth[] }>(
        `/api/publish-health?projectId=${projectId}`
      ),
    ]);

    if (attemptsRes.ok) setAttempts(attemptsRes.data.attempts);
    else setError(attemptsRes.error);

    if (healthRes.ok) setHealth(healthRes.data.health);

    setLoading(false);
  }, [projectId]);

  useEffect(() => {
    void load();
    // Auto-refresh every 10 seconds
    const interval = setInterval(() => void load(), 10000);
    return () => clearInterval(interval);
  }, [load]);

  if (projectLoading || !project || !projectId) return <LoadingBlock />;

  const publishing = attempts.filter((a) => a.status === "PUBLISHING");
  const pending = attempts.filter((a) => a.status === "PENDING").slice(0, 5);
  const queued = attempts.filter((a) => a.status === "QUEUED").slice(0, 5);
  const recent = attempts
    .filter((a) => ["COMPLETED", "FAILED", "ABANDONED"].includes(a.status))
    .slice(0, 10);

  return (
    <div className="flex min-h-full flex-col">
      <PageHeader
        title="Publish Dashboard"
        description={`${project.name} · live publishing status`}
      />

      <PageBody>
      {error && <ErrorBlock message={error} onRetry={load} />}

      {loading && <LoadingBlock />}

      {!loading && (
        <div className="space-y-6">
          {/* Health Overview */}
          {health.length > 0 && (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {health.map((h) => (
                <Card key={h.accountId}>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-sm">
                      {h.account.avatar && (
                        <img
                          src={h.account.avatar}
                          alt=""
                          className="h-6 w-6 rounded-full"
                        />
                      )}
                      @{h.account.username}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2 text-xs">
                      <div className="flex justify-between">
                        <span className="text-muted">Success Rate</span>
                        <span className="font-medium text-ink">
                          {(h.successRate * 100).toFixed(0)}%
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted">Last 24h</span>
                        <span className="font-medium text-ink">
                          {h.publishCount24h} posts
                        </span>
                      </div>
                      {h.isRateLimited && h.rateLimitUntil && (
                        <Badge className="w-full justify-center bg-warning/20 text-warning">
                          Rate limited until{" "}
                          {new Date(h.rateLimitUntil).toLocaleTimeString()}
                        </Badge>
                      )}
                      {!h.isRateLimited && h.nextAvailableAt && (
                        <div className="flex justify-between">
                          <span className="text-muted">Next available</span>
                          <span className="font-medium text-ink">
                            {formatDistanceToNow(new Date(h.nextAvailableAt), {
                              addSuffix: true,
                            })}
                          </span>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          {/* Currently Publishing */}
          {publishing.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin text-primary" />
                  Currently Publishing ({publishing.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {publishing.map((attempt) => (
                    <div
                      key={attempt.id}
                      className="flex items-center gap-3 rounded-lg border border-border p-3"
                    >
                      {attempt.account.avatar && (
                        <img
                          src={attempt.account.avatar}
                          alt=""
                          className="h-8 w-8 rounded-full"
                        />
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-ink">
                          @{attempt.account.username}
                        </p>
                        <p className="truncate text-xs text-muted">
                          {attempt.post.hook}
                        </p>
                      </div>
                      <StatusBadge
                        status={attempt.status}
                        attempt={attempt.attempt}
                        maxRetries={attempt.maxRetries}
                      />
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Next Scheduled */}
          {(pending.length > 0 || queued.length > 0) && (
            <Card>
              <CardHeader>
                <CardTitle>
                  Next Scheduled ({pending.length + queued.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {[...pending, ...queued].map((attempt) => (
                    <div
                      key={attempt.id}
                      className="flex items-center gap-3 rounded-lg border border-border p-2"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-xs font-medium text-ink">
                            {new Date(
                              attempt.actualPublishAt || attempt.scheduledAt
                            ).toLocaleString()}
                          </p>
                          <p className="text-xs text-muted">
                            @{attempt.account.username}
                          </p>
                        </div>
                        <p className="truncate text-xs text-muted">
                          {attempt.post.hook}
                        </p>
                      </div>
                      <StatusBadge
                        status={attempt.status}
                        attempt={attempt.attempt}
                        maxRetries={attempt.maxRetries}
                      />
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Recent History */}
          {recent.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Recent History</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {recent.map((attempt) => (
                    <div
                      key={attempt.id}
                      className="flex items-center gap-3 rounded-lg border border-border p-2"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-xs font-medium text-ink">
                            {new Date(attempt.createdAt).toLocaleString()}
                          </p>
                          <p className="text-xs text-muted">
                            @{attempt.account.username}
                          </p>
                        </div>
                        <p className="truncate text-xs text-muted">
                          {attempt.post.hook}
                        </p>
                        {attempt.error && (
                          <p className="mt-1 truncate text-xs text-danger">
                            {attempt.error}
                          </p>
                        )}
                      </div>
                      <StatusBadge
                        status={attempt.status}
                        attempt={attempt.attempt}
                        maxRetries={attempt.maxRetries}
                      />
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {attempts.length === 0 && (
            <Card>
              <CardContent className="py-12 text-center text-sm text-muted">
                No publish attempts yet. Schedule a post from the Generator or
                Queue to see activity here.
              </CardContent>
            </Card>
          )}
        </div>
      )}
      </PageBody>
    </div>
  );
}
