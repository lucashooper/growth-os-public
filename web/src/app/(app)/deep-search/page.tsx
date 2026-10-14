"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Search } from "lucide-react";
import { PageHeader, PageBody } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ErrorBlock } from "@/components/empty-state";
import { useProject } from "@/lib/project-context";
import { apiFetch } from "@/lib/api-client";

type Candidate = {
  name: string;
  websiteUrl?: string;
  appStoreUrl?: string;
  playStoreUrl?: string;
  tiktokHandle?: string;
  reason: string;
};

export default function DeepSearchPage() {
  const { projectId } = useProject();
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function search() {
    if (!projectId || !query.trim()) return;
    setBusy(true);
    setError(null);
    const res = await apiFetch<{ candidates: Candidate[] }>(
      "/api/intel/deep-search",
      {
        method: "POST",
        body: JSON.stringify({ projectId, query: query.trim() }),
      },
    );
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setCandidates(res.data.candidates);
  }

  async function addOne(c: Candidate) {
    if (!projectId) return;
    setAdding(c.name);
    const res = await apiFetch<{ competitor: { id: string } }>(
      "/api/competitors",
      {
        method: "POST",
        body: JSON.stringify({
          projectId,
          name: c.name,
          handle: c.tiktokHandle || "",
          websiteUrl: c.websiteUrl || "",
          appStoreUrl: c.appStoreUrl || "",
          playStoreUrl: c.playStoreUrl || "",
          sync: true,
        }),
      },
    );
    setAdding(null);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    router.push(`/competitors/${res.data.competitor.id}`);
  }

  return (
    <div className="flex min-h-full flex-col">
      <PageHeader
        title="Deep Search"
        description="Discover competitors from any query — then plug them into the intelligence engine in one click"
      />

      <PageBody className="space-y-6">
      <div className="flex gap-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && void search()}
          placeholder='e.g. "AI journaling apps", "anxiety app", "quit vaping"'
          className="h-11 flex-1 rounded-xl border border-border bg-bg px-4 text-sm"
        />
        <Button onClick={() => void search()} disabled={busy}>
          {busy ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <>
              <Search className="mr-1.5 h-4 w-4" /> Search
            </>
          )}
        </Button>
      </div>

      {error && <ErrorBlock message={error} />}

      <div className="space-y-3">
        {candidates.map((c) => (
          <Card key={`${c.name}-${c.websiteUrl || c.tiktokHandle}`}>
            <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="font-semibold text-ink">{c.name}</p>
                <p className="mt-1 text-xs text-muted">{c.reason}</p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {c.tiktokHandle && <Badge>@{c.tiktokHandle}</Badge>}
                  {c.websiteUrl && <Badge tone="default">Web</Badge>}
                  {c.appStoreUrl && <Badge tone="default">iOS</Badge>}
                  {c.playStoreUrl && <Badge tone="default">Android</Badge>}
                </div>
              </div>
              <Button
                disabled={adding === c.name}
                onClick={() => void addOne(c)}
              >
                {adding === c.name ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  "Add & sync"
                )}
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
      </PageBody>
    </div>
  );
}
