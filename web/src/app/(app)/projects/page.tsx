"use client";

import { useState } from "react";
import Link from "next/link";
import { Edit2, X } from "lucide-react";
import { PageHeader, PageBody } from "@/components/page-header";
import { EmptyState, ErrorBlock, LoadingBlock } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useProject } from "@/lib/project-context";
import { apiFetch } from "@/lib/api-client";

export default function ProjectsPage() {
  const { projects, projectId, setProjectId, loading, error, refresh } =
    useProject();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [saving, setSaving] = useState(false);

  async function saveProject(id: string) {
    setSaving(true);
    const res = await apiFetch(`/api/projects/${id}`, {
      method: "PATCH",
      body: JSON.stringify({
        name: editName,
        description: editDescription,
      }),
    });
    setSaving(false);
    if (res.ok) {
      setEditingId(null);
      await refresh();
    }
  }

  function startEdit(p: { id: string; name: string; description: string | null }) {
    setEditingId(p.id);
    setEditName(p.name);
    setEditDescription(p.description || "");
  }

  if (loading) return <LoadingBlock />;
  if (error) return <ErrorBlock message={error} onRetry={refresh} />;

  return (
    <div className="flex min-h-full flex-col">
      <PageHeader
        title="Projects"
        description="Each project is an isolated growth workspace persisted in SQLite."
      />
      <PageBody>
      {projects.length === 0 ? (
        <EmptyState title="No projects" description="Seed or create a project to begin." />
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {projects.map((p) => {
            const active = p.id === projectId;
            const editing = editingId === p.id;
            
            return (
              <Card key={p.id} className={active ? "border-primary/35" : undefined}>
                <CardContent className="space-y-4">
                  {editing ? (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-ink">Edit Project</span>
                        <button
                          type="button"
                          onClick={() => setEditingId(null)}
                          className="text-muted hover:text-ink"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                      <div>
                        <label className="text-xs text-muted">Name</label>
                        <input
                          type="text"
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          className="mt-1 h-9 w-full rounded-lg border border-border bg-bg px-3 text-sm text-ink"
                          placeholder="Project name"
                        />
                      </div>
                      <div>
                        <label className="text-xs text-muted">Description</label>
                        <input
                          type="text"
                          value={editDescription}
                          onChange={(e) => setEditDescription(e.target.value)}
                          className="mt-1 h-9 w-full rounded-lg border border-border bg-bg px-3 text-sm text-ink"
                          placeholder="Project description"
                        />
                      </div>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          onClick={() => saveProject(p.id)}
                          disabled={saving || !editName.trim()}
                        >
                          {saving ? "Saving..." : "Save"}
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setEditingId(null)}
                        >
                          Cancel
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="flex items-start gap-3">
                        <span
                          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-sm font-semibold text-primary-fg"
                          style={{ background: p.color }}
                        >
                          {p.name.slice(0, 1)}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="text-base font-medium text-ink">{p.name}</p>
                          <p className="text-xs text-muted">
                            {p.description || "No description"}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => startEdit(p)}
                          className="shrink-0 rounded-lg p-1.5 text-muted hover:bg-surface hover:text-ink"
                          title="Edit project"
                        >
                          <Edit2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                      <p className="text-xs text-muted">
                        {p._count?.accounts ?? 0} accounts · {p._count?.posts ?? 0} posts ·{" "}
                        {p._count?.experiments ?? 0} experiments
                      </p>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant={active ? "default" : "secondary"}
                          onClick={() => setProjectId(p.id)}
                        >
                          {active ? "Active" : "Switch"}
                        </Button>
                        <Link href="/dashboard">
                          <Button size="sm" variant="ghost">
                            Dashboard
                          </Button>
                        </Link>
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
      </PageBody>
    </div>
  );
}
