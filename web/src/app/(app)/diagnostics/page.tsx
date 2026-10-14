"use client";

import { useCallback, useEffect, useState } from "react";
import { useProject } from "@/lib/project-context";
import { apiFetch } from "@/lib/api-client";
import { PageHeader, PageBody } from "@/components/page-header";
import { LoadingBlock, ErrorBlock } from "@/components/empty-state";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  CheckCircle2,
  XCircle,
  AlertTriangle,
  RefreshCw,
  Copy,
  Check,
} from "lucide-react";

type Diagnostics = {
  environment: {
    nodeEnv: string;
    netlify: boolean;
    appBaseUrl: string;
    redirectUri: string;
  };
  tiktokApp: {
    clientKeyPrefix: string | null;
    clientSecretConfigured: boolean;
    isSandbox: boolean;
    detectedMode: string;
    expectedScopes: string[];
  };
  accounts: Array<{
    id: string;
    username: string;
    oauthConnected: boolean;
    connectedAt: string | null;
    scopes: string[];
    tokenExpired: boolean | null;
    tokenExpiresAt: string | null;
    status: string;
  }>;
  accountDetails: any;
  recentAttempts: any[];
  recentJobs: any[];
  recommendations: string[];
};

export default function DiagnosticsPage() {
  const { project, projectId, loading: projectLoading } = useProject();
  const [diagnostics, setDiagnostics] = useState<Diagnostics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [selectedAccount, setSelectedAccount] = useState<string | null>(null);

  const load = useCallback(
    async (accountId?: string) => {
      if (!projectId) return;

      setLoading(true);
      setError(null);

      const url = accountId
        ? `/api/tiktok/diagnostics?projectId=${projectId}&accountId=${accountId}`
        : `/api/tiktok/diagnostics?projectId=${projectId}`;

      const res = await apiFetch<{ diagnostics: Diagnostics }>(url);

      if (res.ok) {
        setDiagnostics(res.data.diagnostics);
      } else {
        setError(res.error);
      }

      setLoading(false);
    },
    [projectId],
  );

  useEffect(() => {
    void load();
  }, [load]);

  const copyToClipboard = () => {
    if (!diagnostics) return;
    const text = JSON.stringify(diagnostics, null, 2);
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (projectLoading || !project || !projectId) return <LoadingBlock />;

  return (
    <div className="flex min-h-full flex-col">
      <PageHeader
        title="TikTok Diagnostics"
        description={`${project.name} · OAuth & publishing configuration`}
        action={
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="secondary"
              onClick={copyToClipboard}
              className="gap-1.5"
            >
              {copied ? (
                <>
                  <Check className="h-3.5 w-3.5" />
                  Copied
                </>
              ) : (
                <>
                  <Copy className="h-3.5 w-3.5" />
                  Copy JSON
                </>
              )}
            </Button>
            <Button
              size="sm"
              onClick={() => load(selectedAccount || undefined)}
              className="gap-1.5"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Refresh
            </Button>
          </div>
        }
      />

      <PageBody>
      {error && <ErrorBlock message={error} onRetry={() => load()} />}

      {loading && <LoadingBlock />}

      {!loading && diagnostics && (
        <div className="space-y-6">
          {/* Recommendations */}
          {diagnostics.recommendations.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Recommendations</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {diagnostics.recommendations.map((rec, i) => {
                    const isError = rec.startsWith("❌");
                    const isWarning = rec.startsWith("⚠️");
                    const isSuccess = rec.startsWith("✅");

                    return (
                      <div
                        key={i}
                        className={`flex items-start gap-2 rounded-lg border p-3 text-sm ${
                          isError
                            ? "border-danger/30 bg-danger/5 text-danger"
                            : isWarning
                              ? "border-warning/30 bg-warning/5 text-warning"
                              : "border-success/30 bg-success/5 text-success"
                        }`}
                      >
                        {isError && <XCircle className="mt-0.5 h-4 w-4 shrink-0" />}
                        {isWarning && (
                          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                        )}
                        {isSuccess && (
                          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
                        )}
                        <span>{rec.replace(/^[❌⚠️✅]\s*/, "")}</span>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Environment */}
          <Card>
            <CardHeader>
              <CardTitle>Environment</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted">NODE_ENV</span>
                  <Badge>{diagnostics.environment.nodeEnv}</Badge>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted">Netlify</span>
                  <Badge>
                    {diagnostics.environment.netlify ? "Yes" : "No"}
                  </Badge>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted">APP_BASE_URL</span>
                  <code className="text-xs text-ink">
                    {diagnostics.environment.appBaseUrl || "(not set)"}
                  </code>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted">OAuth Redirect URI</span>
                  <code className="text-xs text-ink">
                    {diagnostics.environment.redirectUri}
                  </code>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* TikTok App */}
          <Card>
            <CardHeader>
              <CardTitle>TikTok App Configuration</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted">Client Key</span>
                  <code className="text-xs text-ink">
                    {diagnostics.tiktokApp.clientKeyPrefix || "(not set)"}
                  </code>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted">Client Secret</span>
                  <Badge>
                    {diagnostics.tiktokApp.clientSecretConfigured
                      ? "Configured"
                      : "Missing"}
                  </Badge>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted">App Mode</span>
                  <Badge
                    className={
                      diagnostics.tiktokApp.isSandbox
                        ? "bg-warning/20 text-warning"
                        : "bg-success/20 text-success"
                    }
                  >
                    {diagnostics.tiktokApp.detectedMode}
                  </Badge>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted">Expected Scopes</span>
                  <div className="flex flex-wrap gap-1">
                    {diagnostics.tiktokApp.expectedScopes.map((scope) => (
                      <Badge key={scope} className="text-xs">
                        {scope}
                      </Badge>
                    ))}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Accounts */}
          <Card>
            <CardHeader>
              <CardTitle>Connected Accounts ({diagnostics.accounts.length})</CardTitle>
            </CardHeader>
            <CardContent>
              {diagnostics.accounts.length === 0 ? (
                <p className="text-sm text-muted">
                  No accounts connected. Connect on /accounts page.
                </p>
              ) : (
                <div className="space-y-3">
                  {diagnostics.accounts.map((account) => (
                    <div
                      key={account.id}
                      className="rounded-lg border border-border p-3"
                    >
                      <div className="mb-2 flex items-center justify-between">
                        <p className="font-medium text-ink">@{account.username}</p>
                        <div className="flex gap-2">
                          {account.tokenExpired && (
                            <Badge className="bg-danger/20 text-danger">
                              Token Expired
                            </Badge>
                          )}
                          <Badge>
                            {account.oauthConnected ? "OAuth Connected" : "Not Connected"}
                          </Badge>
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => {
                              setSelectedAccount(account.id);
                              void load(account.id);
                            }}
                          >
                            Inspect
                          </Button>
                        </div>
                      </div>
                      <div className="grid gap-1.5 text-xs text-muted">
                        <div className="flex justify-between">
                          <span>Connected At</span>
                          <span>
                            {account.connectedAt
                              ? new Date(account.connectedAt).toLocaleString()
                              : "Never"}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span>Scopes</span>
                          <span>{account.scopes.join(", ") || "None"}</span>
                        </div>
                        {account.tokenExpiresAt && (
                          <div className="flex justify-between">
                            <span>Token Expires</span>
                            <span>
                              {new Date(account.tokenExpiresAt).toLocaleString()}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Account Details (if inspected) */}
          {diagnostics.accountDetails && (
            <Card>
              <CardHeader>
                <CardTitle>
                  Account Details: @{diagnostics.accountDetails.username}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3 text-sm">
                  {diagnostics.accountDetails.error ? (
                    <p className="text-danger">{diagnostics.accountDetails.error}</p>
                  ) : (
                    <>
                      <div className="flex justify-between">
                        <span className="text-muted">Creator Username</span>
                        <span className="text-ink">
                          {diagnostics.accountDetails.creatorInfo?.creator_username ||
                            "N/A"}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted">Creator Nickname</span>
                        <span className="text-ink">
                          {diagnostics.accountDetails.creatorInfo?.creator_nickname ||
                            "N/A"}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted">Privacy Options</span>
                        <div className="flex flex-wrap gap-1">
                          {diagnostics.accountDetails.creatorInfo?.privacy_level_options?.map(
                            (opt: string) => (
                              <Badge key={opt} className="text-xs">
                                {opt}
                              </Badge>
                            ),
                          ) || <span className="text-muted">None</span>}
                        </div>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted">Comments Disabled</span>
                        <Badge>
                          {diagnostics.accountDetails.creatorInfo?.comment_disabled
                            ? "Yes"
                            : "No"}
                        </Badge>
                      </div>
                      {diagnostics.accountDetails.creatorInfoError && (
                        <p className="text-danger">
                          Creator Info Error:{" "}
                          {diagnostics.accountDetails.creatorInfoError}
                        </p>
                      )}
                    </>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Recent Publish Attempts */}
          {diagnostics.recentAttempts.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Recent Publish Attempts</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {diagnostics.recentAttempts.map((attempt: any) => (
                    <div
                      key={attempt.id}
                      className="flex items-center justify-between rounded-lg border border-border p-2 text-xs"
                    >
                      <div>
                        <p className="font-medium text-ink">
                          @{attempt.account} · {attempt.status}
                        </p>
                        {attempt.error && (
                          <p className="text-danger">{attempt.error}</p>
                        )}
                      </div>
                      <span className="text-muted">
                        {new Date(attempt.createdAt).toLocaleString()}
                      </span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}
      </PageBody>
    </div>
  );
}
