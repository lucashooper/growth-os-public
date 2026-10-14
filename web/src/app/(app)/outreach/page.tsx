"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ExternalLink,
  Loader2,
  Megaphone,
  Search,
  Send,
  Sparkles,
  Trash2,
} from "lucide-react";
import { PageHeader, PageBody } from "@/components/page-header";
import { FadeIn } from "@/components/fade-in";
import { EmptyState, ErrorBlock, LoadingBlock } from "@/components/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { OrbAgent } from "@/components/orb-agent";
import { useProject } from "@/lib/project-context";
import { apiFetch } from "@/lib/api-client";
import { cn, formatNumber } from "@/lib/utils";
import { GlassSelect, GLASS_SHEET } from "@/components/ui/glass-select";

type Lead = {
  id: string;
  platform: string;
  username: string;
  displayName: string;
  avatarUrl: string;
  followerCount: number;
  bio: string;
  email: string;
  bioLink: string;
  niche: string;
  suggestedPitch: string;
  emailSubject: string;
  status: string;
  sentAt: string | null;
};

type Stats = {
  total: number;
  withEmail: number;
  pitched: number;
  contacted: number;
};

const STATUS_STYLE: Record<string, string> = {
  discovered: "border-border text-muted",
  pitched: "border-primary/40 bg-primary/10 text-primary",
  contacted: "border-emerald-500/40 bg-emerald-500/10 text-emerald-400",
  replied: "border-sky-500/40 bg-sky-500/10 text-sky-400",
  onboarded: "border-amber-500/40 bg-amber-500/10 text-amber-400",
};

export default function OutreachPage() {
  const { project, projectId, loading: projectLoading } = useProject();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [stats, setStats] = useState<Stats>({
    total: 0,
    withEmail: 0,
    pitched: 0,
    contacted: 0,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("#journaling");
  const [followerRange, setFollowerRange] = useState("15k-50k");
  const [requireEmail, setRequireEmail] = useState(true);
  const [leadTab, setLeadTab] = useState<
    "all" | "email" | "pitched" | "contacted"
  >("all");
  const [platform, setPlatform] = useState<"tiktok" | "instagram">("tiktok");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<string | null>(null);
  const [discoverProgress, setDiscoverProgress] = useState(0);
  const [scanStatusIdx, setScanStatusIdx] = useState(0);
  const [sendOpen, setSendOpen] = useState(false);
  const [sendProgress, setSendProgress] = useState({ sent: 0, total: 0 });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingEmailId, setEditingEmailId] = useState<string | null>(null);
  const [emailDraft, setEmailDraft] = useState("");

  const load = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    setError(null);
    const res = await apiFetch<{ leads: Lead[]; stats: Stats }>(
      `/api/outreach/leads?projectId=${projectId}`,
      { skipCache: true },
    );
    if (!res.ok) {
      setError(res.error);
      setLoading(false);
      return;
    }
    setLeads(res.data.leads || []);
    setStats(res.data.stats || stats);
    setLoading(false);
  }, [projectId]);

  useEffect(() => {
    void load();
  }, [load]);

  const isSearching = busy === "discover";
  const scanTopic = useMemo(() => {
    const raw = query.trim().replace(/^#/, "") || "creators";
    return raw.replace(/\s+/g, "").slice(0, 32);
  }, [query]);
  const nicheLabel = useMemo(() => {
    const t = query.replace(/#/g, " ").trim().toLowerCase() || "wellness";
    return t.split(/\s+/)[0] || "wellness";
  }, [query]);
  const scanStatuses = useMemo(
    () => [
      `Scanning trending creators in #${scanTopic}...`,
      `Filtering for 3k+ active ${nicheLabel} profiles...`,
      "Extracting verified business emails...",
    ],
    [scanTopic, nicheLabel],
  );

  useEffect(() => {
    if (!isSearching) {
      setScanStatusIdx(0);
      return;
    }
    const id = window.setInterval(() => {
      setScanStatusIdx((i) => (i + 1) % scanStatuses.length);
    }, 1800);
    return () => window.clearInterval(id);
  }, [isSearching, scanStatuses.length]);

  const selectedLeads = useMemo(
    () => leads.filter((l) => selected.has(l.id)),
    [leads, selected],
  );

  const filteredLeads = useMemo(() => {
    if (leadTab === "email") return leads.filter((l) => Boolean(l.email));
    if (leadTab === "pitched")
      return leads.filter((l) =>
        ["pitched", "contacted", "replied", "onboarded"].includes(l.status),
      );
    if (leadTab === "contacted")
      return leads.filter((l) =>
        ["contacted", "replied", "onboarded"].includes(l.status),
      );
    return leads;
  }, [leads, leadTab]);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    if (
      filteredLeads.length > 0 &&
      filteredLeads.every((l) => selected.has(l.id))
    ) {
      setSelected(new Set());
    } else {
      setSelected(new Set(filteredLeads.map((l) => l.id)));
    }
  }

  async function discover() {
    if (!projectId || !query.trim()) return;
    setBusy("discover");
    setDiscoverProgress(8);
    setError(null);

    const tick = window.setInterval(() => {
      setDiscoverProgress((p) => Math.min(p + 4 + Math.random() * 6, 92));
    }, 450);

    try {
      const res = await apiFetch<{
        leads: Lead[];
        discovered: number;
        withEmail: number;
        message?: string;
        timedOut?: boolean;
        partial?: boolean;
      }>("/api/outreach/discover", {
        method: "POST",
        body: JSON.stringify({
          projectId,
          query: query.trim(),
          platform,
          followerRange,
          requireEmail,
          limit: 10,
        }),
      });

      if (!res.ok) {
        if (res.status === 502 || res.status === 504 || res.status === 408) {
          setError(
            "Discovery took too long — try a more specific hashtag or narrow the follower filter.",
          );
          return;
        }
        throw new Error(res.error);
      }

      setDiscoverProgress(100);
      await load();
      const saved = res.data.leads || [];
      setSelected(new Set(saved.map((l) => l.id)));
      // Only surface hard failures — missing emails use inline "Add Email"
      if (res.data.message && saved.length === 0) {
        setError(res.data.message);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Discover failed";
      if (/502|504|gateway|timeout|timed out/i.test(msg)) {
        setError(
          "Discovery took too long — try a more specific hashtag or narrow the follower filter.",
        );
      } else {
        setError(msg);
      }
    } finally {
      window.clearInterval(tick);
      setBusy(null);
      window.setTimeout(() => setDiscoverProgress(0), 400);
    }
  }

  async function generatePitches() {
    if (!projectId || !selected.size) return;
    setBusy("pitches");
    setError(null);
    try {
      const res = await apiFetch<{ leads: Lead[]; warnings?: string[] }>(
        "/api/outreach/generate-pitches",
        {
          method: "POST",
          body: JSON.stringify({
            projectId,
            leadIds: [...selected],
            appName: project?.name,
            valueProp: project?.description,
          }),
        },
      );
      if (!res.ok) throw new Error(res.error);
      await load();
      if (res.data.warnings?.length) {
        setError(res.data.warnings.slice(0, 2).join(" · "));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Pitch generation failed");
    } finally {
      setBusy(null);
    }
  }

  async function sendBatch() {
    if (!projectId || !selected.size) return;
    setBusy("send");
    setError(null);
    const ids = selectedLeads
      .filter((l) => l.email && l.suggestedPitch)
      .map((l) => l.id);
    setSendProgress({ sent: 0, total: ids.length });
    try {
      const res = await apiFetch<{
        sent: number;
        failed: number;
        total: number;
        results: { id: string; ok: boolean; error?: string }[];
      }>("/api/outreach/send", {
        method: "POST",
        body: JSON.stringify({ projectId, leadIds: ids }),
      });
      if (!res.ok) throw new Error(res.error);
      setSendProgress({
        sent: res.data.sent,
        total: res.data.total,
      });
      await load();
      if (res.data.failed === 0) {
        setTimeout(() => setSendOpen(false), 900);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Send failed");
    } finally {
      setBusy(null);
    }
  }

  async function savePitch(lead: Lead) {
    if (!projectId) return;
    await apiFetch("/api/outreach/leads", {
      method: "PATCH",
      body: JSON.stringify({
        projectId,
        id: lead.id,
        emailSubject: lead.emailSubject,
        suggestedPitch: lead.suggestedPitch,
      }),
    });
    setEditingId(null);
    await load();
  }

  async function saveLeadEmail(lead: Lead, email: string) {
    if (!projectId) return;
    const cleaned = email.trim().toLowerCase();
    if (cleaned && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleaned)) {
      setError("Enter a valid email address");
      return;
    }
    setError(null);
    const res = await apiFetch<{ lead: Lead }>("/api/outreach/leads", {
      method: "PATCH",
      body: JSON.stringify({
        projectId,
        id: lead.id,
        email: cleaned,
      }),
    });
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setLeads((prev) =>
      prev.map((l) => (l.id === lead.id ? { ...l, email: cleaned } : l)),
    );
    setEditingEmailId(null);
    setEmailDraft("");
    await load();
  }

  async function deleteLead(id: string) {
    if (!projectId) return;
    await apiFetch(
      `/api/outreach/leads?projectId=${projectId}&id=${id}`,
      { method: "DELETE" },
    );
    setSelected((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
    await load();
  }

  if (projectLoading || !project) {
    return <LoadingBlock label="Loading workspace…" />;
  }

  const sendable = selectedLeads.filter(
    (l) => l.email && l.emailSubject && l.suggestedPitch,
  );

  return (
    <div className="relative flex min-h-full flex-col">
      {isSearching ? (
        <div
          className="absolute inset-0 z-40 flex min-h-full flex-col items-center justify-center rounded-2xl bg-bg/80 backdrop-blur-md"
          role="status"
          aria-live="polite"
          aria-label="Discovering creators"
        >
          <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-2xl">
            <span className="absolute left-[18%] top-[28%] h-2 w-2 animate-pulse rounded-full bg-primary/40 shadow-[0_0_18px_4px_rgba(91,205,29,0.35)]" />
            <span className="absolute right-[22%] top-[36%] h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400/50 shadow-[0_0_14px_3px_rgba(52,211,153,0.4)] [animation-delay:400ms]" />
            <span className="absolute bottom-[32%] left-[40%] h-2.5 w-2.5 animate-pulse rounded-full bg-primary/30 shadow-[0_0_22px_6px_rgba(91,205,29,0.25)] [animation-delay:800ms]" />
            <span className="absolute right-[35%] bottom-[26%] h-1 w-1 animate-pulse rounded-full bg-white/40 [animation-delay:1200ms]" />
          </div>
          <div className="relative flex flex-col items-center px-6">
            <div className="relative">
              <div className="absolute inset-0 scale-125 animate-pulse rounded-full bg-primary/15 blur-2xl" />
              <OrbAgent
                mode="thinking"
                className="relative !w-[min(220px,48vmin)]"
              />
            </div>
            <p
              key={scanStatuses[scanStatusIdx]}
              className="mt-6 max-w-sm text-center text-sm font-medium text-ink/90 animate-pulse"
            >
              {scanStatuses[scanStatusIdx]}
            </p>
            <p className="mt-2 text-[11px] tabular-nums text-muted">
              {Math.round(discoverProgress)}%
            </p>
          </div>
        </div>
      ) : null}

      <PageHeader
        title="Creator Outreach"
        description="Discover creators, extract emails, generate aesthetic collab pitches, and send affiliate invites."
        action={
          <div className="flex flex-wrap gap-2 text-xs">
            <Badge tone="default">{stats.total} found</Badge>
            <Badge tone="default">{stats.withEmail} emails</Badge>
            <Badge tone="primary">{stats.pitched} pitched</Badge>
            <Badge tone="success">{stats.contacted} contacted</Badge>
          </div>
        }
      />

      <PageBody>
      <FadeIn className="mb-5 space-y-3 rounded-2xl border border-border bg-surface/40 p-4">
        <div className="flex flex-wrap items-end gap-2">
          <label className="min-w-[14rem] flex-1">
            <span className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-muted">
              Search keyword / @handles
            </span>
            <div className="flex items-center gap-2 rounded-xl border border-border bg-bg px-3">
              <Search className="h-4 w-4 text-muted" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="#wellnesshabits or @creator1 @creator2"
                className="h-10 w-full bg-transparent text-sm outline-none"
              />
            </div>
          </label>
          <label>
            <span className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-muted">
              Platform
            </span>
            <GlassSelect
              aria-label="Platform"
              value={platform}
              onChange={(v) => setPlatform(v as "tiktok" | "instagram")}
              size="md"
              options={[
                { value: "tiktok", label: "TikTok" },
                { value: "instagram", label: "Instagram" },
              ]}
            />
          </label>
          <label>
            <span className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-muted">
              Followers
            </span>
            <GlassSelect
              aria-label="Followers"
              value={followerRange}
              onChange={setFollowerRange}
              size="md"
              options={[
                { value: "3k-15k", label: "3k–15k (Nano)" },
                { value: "15k-50k", label: "15k–50k (Micro · Recommended)" },
                { value: "50k-200k", label: "50k–200k (Mid)" },
                { value: "all-3k", label: "All (> 3k)" },
              ]}
            />
          </label>
          <label className="flex h-10 cursor-pointer items-center gap-2 rounded-xl border border-border bg-bg px-3 text-xs text-ink">
            <input
              type="checkbox"
              checked={requireEmail}
              onChange={(e) => setRequireEmail(e.target.checked)}
              className="accent-primary"
            />
            Has Business Email
          </label>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            className="gap-1.5"
            disabled={Boolean(busy) || !query.trim()}
            onClick={() => void discover()}
          >
            {busy === "discover" ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Megaphone className="h-3.5 w-3.5" />
            )}
            Discover Creators
          </Button>
          <Button
            size="sm"
            variant="secondary"
            className="gap-1.5"
            disabled={Boolean(busy) || selected.size === 0}
            onClick={() => void generatePitches()}
          >
            {busy === "pitches" ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Sparkles className="h-3.5 w-3.5" />
            )}
            Generate AI Pitches
          </Button>
          <Button
            size="sm"
            variant="secondary"
            className="gap-1.5"
            disabled={Boolean(busy) || sendable.length === 0}
            onClick={() => {
              setSendProgress({ sent: 0, total: sendable.length });
              setSendOpen(true);
            }}
          >
            <Send className="h-3.5 w-3.5" />
            Send Batch Emails ({sendable.length})
          </Button>
        </div>
      </FadeIn>

      {error && <div className="mb-4"><ErrorBlock message={error} /></div>}

      {loading ? (
        <LoadingBlock label="Loading leads…" />
      ) : leads.length === 0 ? (
        <EmptyState
          title="No creator leads yet"
          description="Search a niche hashtag, or paste @handles to pull bios directly. Use Add Email when contact info is on Instagram or Linktree."
        />
      ) : (
        <>
          <div className="mb-3 flex flex-wrap gap-1.5">
            {(
              [
                ["all", "All Leads", leads.length],
                [
                  "email",
                  "Has Email",
                  leads.filter((l) => Boolean(l.email)).length,
                ],
                [
                  "pitched",
                  "Pitched",
                  leads.filter((l) =>
                    ["pitched", "contacted", "replied", "onboarded"].includes(
                      l.status,
                    ),
                  ).length,
                ],
                [
                  "contacted",
                  "Contacted",
                  leads.filter((l) =>
                    ["contacted", "replied", "onboarded"].includes(l.status),
                  ).length,
                ],
              ] as const
            ).map(([id, label, count]) => (
              <button
                key={id}
                type="button"
                onClick={() => setLeadTab(id)}
                className={cn(
                  "rounded-full border px-3 py-1 text-[11px]",
                  leadTab === id
                    ? "border-primary/40 bg-primary/15 text-primary"
                    : "border-border text-muted hover:text-ink",
                )}
              >
                {label} ({count})
              </button>
            ))}
          </div>
        <div className="overflow-x-auto rounded-2xl border border-border">
          <table className="w-full min-w-[860px] text-left text-sm">
            <thead className="border-b border-border bg-surface/50 text-[11px] uppercase tracking-wide text-muted">
              <tr>
                <th className="px-3 py-2.5">
                  <input
                    type="checkbox"
                    checked={
                      filteredLeads.length > 0 &&
                      filteredLeads.every((l) => selected.has(l.id))
                    }
                    onChange={toggleAll}
                  />
                </th>
                <th className="px-3 py-2.5">Creator</th>
                <th className="px-3 py-2.5">Contact</th>
                <th className="px-3 py-2.5">AI Pitch</th>
                <th className="px-3 py-2.5">Status</th>
                <th className="px-3 py-2.5">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredLeads.map((lead) => (
                <tr
                  key={lead.id}
                  className="border-b border-border/70 align-top last:border-0"
                >
                  <td className="px-3 py-3">
                    <input
                      type="checkbox"
                      checked={selected.has(lead.id)}
                      onChange={() => toggle(lead.id)}
                    />
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex items-center gap-2.5">
                      {lead.avatarUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={lead.avatarUrl}
                          alt=""
                          className="h-9 w-9 rounded-full object-cover"
                          referrerPolicy="no-referrer"
                        />
                      ) : (
                        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-surface-2 text-xs text-muted">
                          @
                        </div>
                      )}
                      <div>
                        <p className="font-medium text-ink">@{lead.username}</p>
                        <p className="text-[11px] text-muted">
                          {formatNumber(lead.followerCount)} followers
                          {lead.niche ? ` · ${lead.niche}` : ""}
                        </p>
                        {lead.bio ? (
                          <p className="mt-1 line-clamp-2 max-w-[220px] text-[11px] leading-snug text-muted/90">
                            {lead.bio}
                          </p>
                        ) : null}
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-3">
                    {editingEmailId === lead.id ? (
                      <div className="flex min-w-[160px] flex-col gap-1.5">
                        <input
                          autoFocus
                          type="email"
                          value={emailDraft}
                          onChange={(e) => setEmailDraft(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              void saveLeadEmail(lead, emailDraft);
                            }
                            if (e.key === "Escape") {
                              setEditingEmailId(null);
                              setEmailDraft("");
                            }
                          }}
                          placeholder="name@gmail.com"
                          className="w-full rounded-lg border border-border bg-bg px-2 py-1 text-xs"
                        />
                        <div className="flex gap-1">
                          <Button
                            size="sm"
                            onClick={() => void saveLeadEmail(lead, emailDraft)}
                          >
                            Save
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              setEditingEmailId(null);
                              setEmailDraft("");
                            }}
                          >
                            Cancel
                          </Button>
                        </div>
                      </div>
                    ) : lead.email ? (
                      <button
                        type="button"
                        className="inline-flex rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5 text-[11px] text-emerald-400 hover:border-emerald-400/60"
                        title="Edit email"
                        onClick={() => {
                          setEditingEmailId(lead.id);
                          setEmailDraft(lead.email);
                        }}
                      >
                        {lead.email}
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="inline-flex items-center gap-1 rounded-full border border-dashed border-border px-2 py-0.5 text-[11px] text-muted transition hover:border-primary/50 hover:text-primary"
                        onClick={() => {
                          setEditingEmailId(lead.id);
                          setEmailDraft("");
                        }}
                      >
                        {lead.bioLink ? "Bio link · Add Email" : "Add Email"}
                      </button>
                    )}
                  </td>
                  <td className="px-3 py-3">
                    {editingId === lead.id ? (
                      <div className="space-y-1.5">
                        <input
                          value={lead.emailSubject}
                          onChange={(e) =>
                            setLeads((prev) =>
                              prev.map((l) =>
                                l.id === lead.id
                                  ? { ...l, emailSubject: e.target.value }
                                  : l,
                              ),
                            )
                          }
                          className="w-full rounded-lg border border-border bg-bg px-2 py-1 text-xs"
                          placeholder="Subject"
                        />
                        <textarea
                          value={lead.suggestedPitch}
                          onChange={(e) =>
                            setLeads((prev) =>
                              prev.map((l) =>
                                l.id === lead.id
                                  ? { ...l, suggestedPitch: e.target.value }
                                  : l,
                              ),
                            )
                          }
                          rows={3}
                          className="w-full rounded-lg border border-border bg-bg px-2 py-1 text-xs"
                          placeholder="Pitch body"
                        />
                        <div className="flex gap-1.5">
                          <Button
                            size="sm"
                            onClick={() => void savePitch(lead)}
                          >
                            Save
                          </Button>
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => setEditingId(null)}
                          >
                            Cancel
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <button
                        type="button"
                        className="max-w-xs text-left"
                        onClick={() => setEditingId(lead.id)}
                      >
                        <p className="line-clamp-1 text-xs font-medium text-ink">
                          {lead.emailSubject || "No subject — click to edit"}
                        </p>
                        <p className="mt-0.5 line-clamp-2 text-[11px] text-muted">
                          {lead.suggestedPitch ||
                            "Generate AI pitches, then click to edit."}
                        </p>
                      </button>
                    )}
                  </td>
                  <td className="px-3 py-3">
                    <span
                      className={cn(
                        "inline-flex rounded-full border px-2 py-0.5 text-[11px] capitalize",
                        STATUS_STYLE[lead.status] || STATUS_STYLE.discovered,
                      )}
                    >
                      {lead.status}
                    </span>
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex flex-wrap gap-1">
                      <a
                        href={`https://www.tiktok.com/@${lead.username}`}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 rounded-lg border border-border px-2 py-1 text-[11px] text-muted hover:text-ink"
                      >
                        <ExternalLink className="h-3 w-3" />
                        Profile
                      </a>
                      <button
                        type="button"
                        title="Delete"
                        onClick={() => void deleteLead(lead.id)}
                        className="rounded-lg border border-border px-2 py-1 text-muted hover:text-danger"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        </>
      )}

      {sendOpen && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 p-4 backdrop-blur-[2px]">
          <div className={cn("w-full max-w-lg", GLASS_SHEET)}>
            <div className="border-b border-border px-5 py-4">
              <h2 className="text-sm font-semibold text-ink">
                Review &amp; send batch
              </h2>
              <p className="mt-1 text-xs text-muted">
                From: {(project.name || "Growth OS") + " Collabs"} ·{" "}
                {sendable.length} recipients with email + pitch
              </p>
            </div>
            <div className="max-h-64 space-y-2 overflow-y-auto px-5 py-4">
              {sendable.map((l) => (
                <div
                  key={l.id}
                  className="rounded-xl border border-border bg-bg/40 px-3 py-2"
                >
                  <p className="text-xs font-medium text-ink">
                    @{l.username} → {l.email}
                  </p>
                  <p className="mt-0.5 line-clamp-1 text-[11px] text-muted">
                    {l.emailSubject}
                  </p>
                </div>
              ))}
              {sendable.length === 0 && (
                <p className="text-xs text-muted">
                  Select leads that have both an email and a generated pitch.
                </p>
              )}
            </div>
            {busy === "send" || sendProgress.total > 0 ? (
              <div className="px-5 pb-2">
                <div className="h-1.5 overflow-hidden rounded-full bg-surface-2">
                  <div
                    className="h-full bg-primary transition-all"
                    style={{
                      width: `${
                        sendProgress.total
                          ? Math.min(
                              100,
                              (sendProgress.sent / sendProgress.total) * 100,
                            )
                          : busy === "send"
                            ? 40
                            : 0
                      }%`,
                    }}
                  />
                </div>
                <p className="mt-1.5 text-[11px] text-muted">
                  Sent {sendProgress.sent} / {sendProgress.total || sendable.length}
                </p>
              </div>
            ) : null}
            <div className="flex justify-end gap-2 border-t border-border px-5 py-3">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setSendOpen(false)}
                disabled={busy === "send"}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                className="gap-1.5"
                disabled={busy === "send" || sendable.length === 0}
                onClick={() => void sendBatch()}
              >
                {busy === "send" ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Send className="h-3.5 w-3.5" />
                )}
                Send {sendable.length} emails
              </Button>
            </div>
          </div>
        </div>
      )}
      </PageBody>
    </div>
  );
}
