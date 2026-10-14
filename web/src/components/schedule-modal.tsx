"use client";

import { useEffect, useMemo, useState } from "react";
import { CalendarClock, Loader2, Send, Sparkles } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { apiFetch, peekApi } from "@/lib/api-client";
import { invalidateApiCache } from "@/lib/api-cache";
import { cn } from "@/lib/utils";
import { TikTokPublishModal } from "@/components/tiktok-publish-modal";
import type { ExportSlide } from "@/lib/carousel-export";

/** Minimal spacing the batch API enforces (0.25h). Same start time preference. */
const BATCH_INTERVAL_HOURS = 0;

type Draft = {
  id: string;
  hook: string;
  caption?: string;
  coverUrl?: string;
  status: string;
  slides?: string[];
  meta?: {
    visualSlides?: {
      text?: string;
      backgroundUrl?: string;
      textPosition?: string;
      positionY?: number;
    }[];
    textStyleId?: string;
    captionBoxId?: string;
    dimLevel?: string;
  };
};

type Account = {
  id: string;
  username: string;
  nickname?: string;
  oauthConnected?: boolean;
};

function draftToExportSlides(d: Draft): ExportSlide[] {
  const visuals = d.meta?.visualSlides;
  if (visuals?.length) {
    return visuals.map((v, i) => ({
      index: i + 1,
      text: v.text || "",
      backgroundUrl: v.backgroundUrl,
      textPosition:
        v.textPosition === "none" ? "top" : v.textPosition || "center",
      positionY:
        typeof v.positionY === "number"
          ? v.positionY
          : v.textPosition === "top" || v.textPosition === "none"
            ? 18
            : v.textPosition === "bottom"
              ? 78
              : 48,
    }));
  }
  const texts = d.slides?.length ? d.slides : [d.hook];
  return texts.map((t, i) => ({
    index: i + 1,
    text: t,
    backgroundUrl: i === 0 ? d.coverUrl : undefined,
  }));
}

function defaultScheduleLocal(): { date: string; time: string } {
  const d = new Date();
  d.setMinutes(0, 0, 0);
  d.setHours(d.getHours() + 1);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  return { date: `${yyyy}-${mm}-${dd}`, time: `${hh}:${mi}` };
}

export function ScheduleModal({
  open,
  onClose,
  projectId,
  onScheduled,
}: {
  open: boolean;
  onClose: () => void;
  projectId: string;
  onScheduled?: () => void;
}) {
  const postsUrl = `/api/posts?projectId=${projectId}`;
  const accountsUrl = `/api/accounts?projectId=${projectId}`;

  const [drafts, setDrafts] = useState<Draft[]>(() => {
    const cached = peekApi<{ posts: Draft[] }>(postsUrl);
    return (cached?.posts || []).filter(
      (p) => p.status === "draft" || p.status === "scheduled",
    );
  });
  const [accounts, setAccounts] = useState<Account[]>(
    () => peekApi<{ accounts: Account[] }>(accountsUrl)?.accounts || [],
  );
  const [selectedIds, setSelectedIds] = useState<string[]>(() =>
    drafts[0]?.id ? [drafts[0].id] : [],
  );
  const [accountIds, setAccountIds] = useState<string[]>(() => {
    const first = accounts.find((a) => a.oauthConnected)?.id || accounts[0]?.id;
    return first ? [first] : [];
  });
  const [mode, setMode] = useState<"schedule" | "now">("now");
  const initialLocal = defaultScheduleLocal();
  const [scheduleDate, setScheduleDate] = useState(initialLocal.date);
  const [scheduleTime, setScheduleTime] = useState(initialLocal.time);
  const [distributeEvenly, setDistributeEvenly] = useState(true);
  const [loading, setLoading] = useState(drafts.length === 0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [publishOpen, setPublishOpen] = useState(false);
  const [variantBusy, setVariantBusy] = useState(false);

  useEffect(() => {
    if (!open || !projectId) return;
    setDone(null);
    setError(null);
    setMode("now");
    const next = defaultScheduleLocal();
    setScheduleDate(next.date);
    setScheduleTime(next.time);
    const hasCache = drafts.length > 0;
    if (!hasCache) setLoading(true);
    Promise.all([
      apiFetch<{ posts: Draft[] }>(postsUrl),
      apiFetch<{ accounts: Account[] }>(accountsUrl),
    ]).then(([postsRes, accRes]) => {
      if (postsRes.ok) {
        const list = (postsRes.data.posts || []).filter(
          (p) => p.status === "draft" || p.status === "scheduled",
        );
        setDrafts(list);
        setSelectedIds((prev) => {
          const valid = prev.filter((id) => list.some((d) => d.id === id));
          return valid.length ? valid : list[0]?.id ? [list[0].id] : [];
        });
      }
      if (accRes.ok) {
        const list = accRes.data.accounts || [];
        setAccounts(list);
        setAccountIds((prev) => {
          const valid = prev.filter((id) => list.some((a) => a.id === id));
          if (valid.length) return valid;
          const ready = list.find((a) => a.oauthConnected)?.id || list[0]?.id;
          return ready ? [ready] : [];
        });
      }
      setLoading(false);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, projectId]);

  const primarySelected = useMemo(
    () => drafts.find((d) => d.id === selectedIds[0]) || null,
    [drafts, selectedIds],
  );

  const exportSlides = primarySelected
    ? draftToExportSlides(primarySelected)
    : [];
  const publishReady = accounts.some((a) => a.oauthConnected);

  function toggleDraft(id: string) {
    setSelectedIds((prev) => {
      if (prev.includes(id)) {
        if (prev.length === 1) return prev;
        return prev.filter((x) => x !== id);
      }
      return [...prev, id];
    });
  }

  function toggleAccount(id: string) {
    setAccountIds((prev) => {
      if (prev.includes(id)) {
        if (prev.length === 1) return prev;
        return prev.filter((x) => x !== id);
      }
      return [...prev, id];
    });
  }

  async function generateVariants() {
    if (!selectedIds[0]) return;
    setVariantBusy(true);
    setError(null);
    try {
      const gen = await fetch("/api/agent/voice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          transcript: `Use template ${selectedIds[0]} and generate 10 viral slideshow variants`,
        }),
      });
      const data = await gen.json();
      if (!gen.ok) {
        setError(data.error || "Variant generation failed");
        return;
      }
      invalidateApiCache("/api/posts");
      const postsRes = await apiFetch<{ posts: Draft[] }>(postsUrl);
      if (postsRes.ok) {
        const list = (postsRes.data.posts || []).filter(
          (p) => p.status === "draft" || p.status === "scheduled",
        );
        setDrafts(list);
        const newIds = (data.drafts || []).map((d: { id: string }) => d.id);
        if (newIds.length) setSelectedIds(newIds);
      }
      setDone(`Generated ${data.drafts?.length || 0} variants`);
    } finally {
      setVariantBusy(false);
    }
  }

  async function schedule() {
    if (!selectedIds.length || !accountIds.length) return;
    setBusy(true);
    setError(null);

    const startAt = new Date(`${scheduleDate}T${scheduleTime}:00`);
    if (Number.isNaN(startAt.getTime())) {
      setBusy(false);
      setError("Pick a valid date and time.");
      return;
    }

    const res = await apiFetch<{ count: number }>("/api/schedule/batch", {
      method: "POST",
      body: JSON.stringify({
        projectId,
        postIds: selectedIds,
        accountIds,
        startAt: startAt.toISOString(),
        intervalHours: BATCH_INTERVAL_HOURS,
        randomJitterMinutes: 0,
        uploadAsDraft: true,
        distributeEvenly,
      }),
    });

    setBusy(false);
    if (!res.ok) {
      setError(typeof res.error === "string" ? res.error : "Schedule failed");
      return;
    }
    invalidateApiCache("/api/posts");
    invalidateApiCache("/api/publish-attempts");
    setDone(`Scheduled ${res.data.count} draft push${res.data.count === 1 ? "" : "es"}`);
    onScheduled?.();
  }

  function postNow() {
    if (!primarySelected) return;
    if (!publishReady) {
      setError("Connect a TikTok account with publish scopes first (Accounts).");
      return;
    }
    if (!exportSlides.length) {
      setError("This draft has no slides to publish.");
      return;
    }
    setPublishOpen(true);
  }

  return (
    <>
      <Modal
        open={open && !publishOpen}
        onClose={onClose}
        title="Step 1 of 2: Select Drafts to Push"
        description="Choose carousels to send to TikTok drafts now, or schedule a draft push."
        className="max-w-lg"
      >
        {loading ? (
          <div className="flex items-center gap-2 py-8 text-sm text-muted">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading drafts…
          </div>
        ) : drafts.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted">
            No drafts yet. Generate or paste scripts in the Generator first.
          </p>
        ) : (
          <div className="space-y-4">
            <div>
              <div className="mb-2 flex items-center justify-between gap-2">
                <p className="text-[10px] font-medium uppercase tracking-wide text-muted">
                  Drafts ({selectedIds.length} selected)
                </p>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  className="gap-1 text-[11px]"
                  disabled={!selectedIds[0] || variantBusy}
                  onClick={() => void generateVariants()}
                >
                  {variantBusy ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <Sparkles className="h-3 w-3" />
                  )}
                  Generate 10 variants
                </Button>
              </div>
              <div className="max-h-40 space-y-1.5 overflow-y-auto">
                {drafts.map((d) => {
                  const on = selectedIds.includes(d.id);
                  return (
                    <button
                      key={d.id}
                      type="button"
                      onClick={() => toggleDraft(d.id)}
                      className={cn(
                        "flex w-full items-center gap-2 rounded-xl border px-2.5 py-2 text-left",
                        on
                          ? "border-primary/40 bg-primary/10"
                          : "border-border",
                      )}
                    >
                      <span
                        className={cn(
                          "flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded border text-[9px]",
                          on
                            ? "border-primary bg-primary text-primary-fg"
                            : "border-border",
                        )}
                      >
                        {on ? "✓" : ""}
                      </span>
                      <div className="h-10 w-8 shrink-0 overflow-hidden rounded-md bg-surface-2">
                        {d.coverUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={d.coverUrl}
                            alt=""
                            className="h-full w-full object-cover"
                          />
                        ) : null}
                      </div>
                      <span className="line-clamp-2 text-xs text-ink">
                        {d.hook}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {accounts.length > 0 && (
              <div>
                <p className="mb-1.5 text-[11px] text-muted">
                  Accounts (select one or more)
                </p>
                <div className="max-h-28 space-y-1 overflow-y-auto rounded-lg border border-border p-1.5">
                  {accounts.map((a) => {
                    const on = accountIds.includes(a.id);
                    return (
                      <button
                        key={a.id}
                        type="button"
                        onClick={() => toggleAccount(a.id)}
                        className={cn(
                          "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs",
                          on
                            ? "bg-primary/15 text-ink"
                            : "text-muted hover:bg-surface",
                        )}
                      >
                        <span
                          className={cn(
                            "flex h-3.5 w-3.5 items-center justify-center rounded border text-[9px]",
                            on
                              ? "border-primary bg-primary text-primary-fg"
                              : "border-border",
                          )}
                        >
                          {on ? "✓" : ""}
                        </span>
                        @{a.username}
                        {a.oauthConnected ? (
                          <span className="ml-auto text-[10px] text-primary">
                            publish ready
                          </span>
                        ) : null}
                      </button>
                    );
                  })}
                </div>
                <label className="mt-2 flex items-center gap-2 text-[11px] text-muted">
                  <input
                    type="checkbox"
                    checked={distributeEvenly}
                    onChange={(e) => setDistributeEvenly(e.target.checked)}
                  />
                  Distribute evenly across selected accounts
                </label>
              </div>
            )}

            {mode === "schedule" ? (
              <div className="space-y-2">
                <p className="text-[10px] font-medium uppercase tracking-wide text-muted">
                  Draft push time
                </p>
                <div className="grid grid-cols-2 gap-2">
                  <label className="text-[11px] text-muted">
                    Date
                    <input
                      type="date"
                      value={scheduleDate}
                      onChange={(e) => setScheduleDate(e.target.value)}
                      className="mt-1 h-9 w-full rounded-lg border border-border bg-bg px-2 text-xs text-ink [color-scheme:dark]"
                    />
                  </label>
                  <label className="text-[11px] text-muted">
                    Time
                    <input
                      type="time"
                      value={scheduleTime}
                      onChange={(e) => setScheduleTime(e.target.value)}
                      className="mt-1 h-9 w-full rounded-lg border border-border bg-bg px-2 text-xs text-ink [color-scheme:dark]"
                    />
                  </label>
                </div>
              </div>
            ) : (
              <p className="rounded-lg border border-border bg-surface/40 px-3 py-2.5 text-[11px] leading-relaxed text-muted">
                Opens the TikTok composer — choose privacy, disclosures, and post
                directly or save as a draft in the TikTok app.
              </p>
            )}

            {error && <p className="text-xs text-warning">{error}</p>}
            {done && <p className="text-xs text-primary">{done}</p>}

            <div className="flex flex-wrap justify-end gap-2">
              <Button variant="secondary" size="sm" onClick={onClose}>
                Close
              </Button>
              {mode === "schedule" ? (
                <>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => setMode("now")}
                  >
                    Back
                  </Button>
                  <Button
                    size="sm"
                    className="gap-1.5"
                    disabled={!selectedIds.length || !accountIds.length || busy}
                    onClick={() => void schedule()}
                  >
                    {busy ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <CalendarClock className="h-3.5 w-3.5" />
                    )}
                    Schedule Draft Push
                    {selectedIds.length > 1 ? ` · ${selectedIds.length}` : ""}
                  </Button>
                </>
              ) : (
                <>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    className="gap-1.5"
                    disabled={!selectedIds.length || !accountIds.length}
                    onClick={() => setMode("schedule")}
                  >
                    <CalendarClock className="h-3.5 w-3.5" />
                    Schedule Draft Push
                  </Button>
                  <Button
                    size="sm"
                    className="gap-1.5"
                    disabled={!selectedIds.length}
                    onClick={postNow}
                  >
                    <Send className="h-3.5 w-3.5" />
                    Send to TikTok
                  </Button>
                </>
              )}
            </div>
          </div>
        )}
      </Modal>

      <TikTokPublishModal
        open={publishOpen}
        onClose={() => {
          setPublishOpen(false);
          onClose();
          onScheduled?.();
        }}
        projectId={projectId}
        accounts={accounts}
        slides={exportSlides}
        title={primarySelected?.hook || ""}
        caption={primarySelected?.caption || primarySelected?.hook || ""}
        textStyleId={primarySelected?.meta?.textStyleId || "tiktok-sans"}
        captionBoxId={primarySelected?.meta?.captionBoxId || "highlight"}
        dim={
          primarySelected?.meta &&
          "dimLevel" in primarySelected.meta &&
          primarySelected.meta.dimLevel
            ? (primarySelected.meta.dimLevel as "none" | "soft" | "dark")
            : "none"
        }
        initialAccountIds={accountIds.filter((id) =>
          accounts.some((a) => a.id === id && a.oauthConnected),
        )}
      />
    </>
  );
}
