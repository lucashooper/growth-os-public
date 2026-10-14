"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Bot,
  Loader2,
  Mic,
  Puzzle,
  Sparkles,
  Video,
} from "lucide-react";
import { PageHeader, PageBody } from "@/components/page-header";
import { EmptyState, ErrorBlock, LoadingBlock } from "@/components/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { useProject } from "@/lib/project-context";
import { apiFetch } from "@/lib/api-client";
import { cn } from "@/lib/utils";

type IntegrationRow = {
  id: string;
  name: string;
  description: string;
  docsUrl?: string;
  isActive: boolean;
  maskedKey: string;
  updatedAt: string | null;
};

const ICONS: Record<string, typeof Puzzle> = {
  heygen: Video,
  elevenlabs: Mic,
  reelfarm: Sparkles,
  openai: Bot,
  claude: Bot,
};

export default function IntegrationsPage() {
  const { project, projectId, loading: projectLoading } = useProject();
  const [items, setItems] = useState<IntegrationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [activeProvider, setActiveProvider] = useState<IntegrationRow | null>(null);
  const [apiKey, setApiKey] = useState("");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    const res = await apiFetch<{ integrations: IntegrationRow[] }>(
      `/api/integrations?projectId=${projectId}`,
    );
    if (!res.ok) setError(res.error);
    else {
      setItems(res.data.integrations);
      setError(null);
    }
    setLoading(false);
  }, [projectId]);

  useEffect(() => {
    void load();
  }, [load]);

  function openConnect(row: IntegrationRow) {
    setActiveProvider(row);
    setApiKey("");
    setFormError(null);
    setModalOpen(true);
  }

  async function saveIntegration() {
    if (!projectId || !activeProvider) return;
    setSaving(true);
    setFormError(null);
    const res = await apiFetch<{ integration: { message: string } }>(
      "/api/integrations",
      {
        method: "PUT",
        body: JSON.stringify({
          projectId,
          provider: activeProvider.id,
          apiKey,
        }),
      },
    );
    setSaving(false);
    if (!res.ok) {
      setFormError(res.error);
      return;
    }
    setModalOpen(false);
    void load();
  }

  async function disconnect(provider: string) {
    if (!projectId) return;
    await apiFetch(
      `/api/integrations?projectId=${projectId}&provider=${provider}`,
      { method: "DELETE" },
    );
    void load();
  }

  if (projectLoading || !project || !projectId) return <LoadingBlock />;

  return (
    <div className="flex min-h-full flex-col">
      <PageHeader
        title="Integrations"
        description={`${project.name} · connect third-party APIs for generation & ingestion`}
      />

      <PageBody>
      {error && (
        <div className="mb-4">
          <ErrorBlock message={error} onRetry={load} />
        </div>
      )}

      {loading ? (
        <LoadingBlock />
      ) : items.length === 0 ? (
        <EmptyState title="No integrations" description="Catalog failed to load." />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {items.map((row) => {
            const Icon = ICONS[row.id] ?? Puzzle;
            return (
              <div
                key={row.id}
                className="rounded-2xl border border-white/[0.06] bg-white/[0.025] p-5"
              >
                <div className="mb-4 flex items-start justify-between gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/[0.06]">
                    <Icon className="h-5 w-5 text-zinc-300" strokeWidth={1.5} />
                  </div>
                  {row.isActive ? (
                    <Badge tone="success">Connected</Badge>
                  ) : (
                    <Badge>Not connected</Badge>
                  )}
                </div>
                <h3 className="text-sm font-semibold text-[#F4F4F6]">{row.name}</h3>
                <p className="mt-1.5 text-xs leading-relaxed text-zinc-400">
                  {row.description}
                </p>
                {row.maskedKey && (
                  <p className="mt-2 font-mono text-[10px] text-zinc-500">
                    {row.maskedKey}
                  </p>
                )}
                <div className="mt-4 flex gap-2">
                  <Button
                    size="sm"
                    className={cn(!row.isActive && "bg-primary hover:brightness-110")}
                    onClick={() => openConnect(row)}
                  >
                    {row.isActive ? "Configure" : "Connect"}
                  </Button>
                  {row.isActive && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => void disconnect(row.id)}
                    >
                      Disconnect
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      </PageBody>
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={activeProvider ? `Connect ${activeProvider.name}` : "Connect"}
        description="Enter your API key. We encrypt credentials at rest and run a quick ping test."
        className="max-w-lg"
      >
        <div className="space-y-4">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-zinc-400">
              API Key / Secret
            </label>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="sk-..."
              className="w-full rounded-lg border border-white/[0.06] bg-white/[0.025] px-3 py-2 text-sm text-white outline-none focus:border-primary/50"
            />
          </div>
          {formError && (
            <p className="text-xs text-red-400">{formError}</p>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setModalOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => void saveIntegration()} disabled={saving || !apiKey.trim()}>
              {saving ? (
                <>
                  <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                  Testing…
                </>
              ) : (
                "Save & test"
              )}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
