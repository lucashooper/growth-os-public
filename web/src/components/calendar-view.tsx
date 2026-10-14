"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import Link from "next/link";
import {
  DragDropContext,
  Draggable,
  Droppable,
  type DropResult,
} from "@hello-pangea/dnd";
import {
  ChevronLeft,
  ChevronRight,
  Clock,
  Copy,
  Eye,
  EyeOff,
  GripVertical,
  Loader2,
  Trash2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ErrorBlock, LoadingBlock } from "@/components/empty-state";
import { apiFetch } from "@/lib/api-client";
import { cn } from "@/lib/utils";

type CalendarPost = {
  id: string;
  hook: string;
  caption?: string;
  status: string;
  coverUrl?: string;
  scheduledAt: string | null;
  accountId?: string | null;
  meta?: {
    visualSlides?: { backgroundUrl?: string; backgroundImageUrl?: string }[];
  };
};

type CalendarAccount = {
  id: string;
  username: string;
  nickname?: string;
  platform: string;
};

type ViewMode = "week" | "day" | "month";

const HOURS = Array.from({ length: 24 }, (_, i) => i);
const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const CELL =
  "w-full min-w-0 max-w-full h-12 p-1 relative border-r border-b border-white/[0.05] overflow-hidden flex flex-col justify-center transition-colors";

function startOfWeekMonday(d: Date) {
  const out = new Date(d);
  out.setHours(0, 0, 0, 0);
  const day = out.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  out.setDate(out.getDate() + diff);
  return out;
}

function addDays(d: Date, n: number) {
  const out = new Date(d);
  out.setDate(out.getDate() + n);
  return out;
}

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

/** Local calendar date — UTC toISOString was shifting slots and snapping drops back. */
function dateKey(d: Date) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function slotId(day: Date, hour: number) {
  return `droppable-${dateKey(day)}-${hour}`;
}

function parseSlotId(id: string): { day: string; hour: number } | null {
  const m = id.match(/^droppable-(\d{4}-\d{2}-\d{2})-(\d{1,2})$/);
  if (!m) return null;
  return { day: m[1], hour: Number(m[2]) };
}

function scheduledToSlot(post: CalendarPost): string | null {
  if (!post.scheduledAt) return null;
  const d = new Date(post.scheduledAt);
  return slotId(d, d.getHours());
}

function statusLabel(status: string) {
  if (status === "publishing") return "Publishing";
  if (status === "published") return "Published";
  if (status === "scheduled") return "Scheduled";
  if (status === "failed") return "Failed";
  return "Draft";
}

function dragCloneStyle(
  style: React.CSSProperties | undefined,
  isDragging: boolean,
) {
  return {
    ...style,
    ...(isDragging
      ? { width: 168, maxWidth: 168, minWidth: 168 }
      : { width: "100%", maxWidth: "100%" }),
  };
}

function ScheduledPill({
  post,
  dragHandleProps,
  onSelect,
  onHide,
  onDelete,
}: {
  post: CalendarPost;
  dragHandleProps?: React.HTMLAttributes<HTMLDivElement>;
  onSelect: () => void;
  onHide: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="group/pill relative mb-0.5 w-full min-w-0 max-w-full">
      <div className="absolute inset-x-0 top-0 z-20 hidden h-[18px] items-center justify-end gap-0.5 rounded-t-md bg-[#5b4dff] px-1 group-hover/pill:flex">
        <button
          type="button"
          title="Duplicate text"
          className="rounded p-0.5 text-white/90 hover:bg-white/20"
          onClick={(e) => {
            e.stopPropagation();
            void navigator.clipboard.writeText(post.hook || post.caption || "");
          }}
        >
          <Copy className="h-3 w-3" />
        </button>
        <button
          type="button"
          title="Preview"
          className="rounded p-0.5 text-white/90 hover:bg-white/20"
          onClick={(e) => {
            e.stopPropagation();
            onSelect();
          }}
        >
          <Eye className="h-3 w-3" />
        </button>
        <button
          type="button"
          title="Remove from calendar"
          className="rounded p-0.5 text-white/90 hover:bg-white/20"
          onClick={(e) => {
            e.stopPropagation();
            onHide();
          }}
        >
          <EyeOff className="h-3 w-3" />
        </button>
        <button
          type="button"
          title="Delete post"
          className="rounded p-0.5 text-white/90 hover:bg-white/20"
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
        >
          <Trash2 className="h-3 w-3" />
        </button>
      </div>
      <div
        className="flex h-8 w-full min-w-0 max-w-full cursor-pointer items-center gap-1.5 overflow-hidden rounded-md border border-white/10 bg-[#1c1c1f] px-2 hover:bg-[#252528]"
        onClick={(e) => {
          e.stopPropagation();
          onSelect();
        }}
      >
        <div
          {...dragHandleProps}
          className="shrink-0 cursor-grab text-zinc-600 active:cursor-grabbing"
        >
          <GripVertical className="h-3 w-3" />
        </div>
        {post.coverUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={post.coverUrl} alt="" className="h-5 w-5 shrink-0 rounded-full object-cover" />
        ) : (
          <div className="h-5 w-5 shrink-0 rounded-full bg-white/[0.06]" />
        )}
        <span className="min-w-0 flex-1 truncate text-[11px] font-medium leading-tight text-zinc-200">
          {post.hook || "Untitled"}
        </span>
      </div>
    </div>
  );
}

function DraftQueueCard({
  post,
  dragHandleProps,
  onSelect,
}: {
  post: CalendarPost;
  dragHandleProps?: React.HTMLAttributes<HTMLDivElement>;
  onSelect: () => void;
}) {
  return (
    <div
      className="rounded-xl border border-white/[0.06] bg-white/[0.04] p-2.5 transition-colors hover:bg-white/[0.07]"
      onClick={onSelect}
    >
      <div className="flex items-start gap-2">
        <div
          {...dragHandleProps}
          className="mt-0.5 shrink-0 cursor-grab text-zinc-600 active:cursor-grabbing"
        >
          <GripVertical className="h-3.5 w-3.5" />
        </div>
        {post.coverUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={post.coverUrl}
            alt=""
            className="h-10 w-10 shrink-0 rounded object-cover"
          />
        ) : (
          <div className="h-10 w-10 shrink-0 rounded bg-white/[0.06]" />
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate text-[11px] font-medium text-zinc-200">
            {post.hook || "Untitled draft"}
          </p>
          <p className="mt-0.5 text-[10px] text-zinc-500">TikTok · Draft</p>
        </div>
      </div>
    </div>
  );
}

export function CalendarView({ projectId }: { projectId: string }) {
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const [weekStart, setWeekStart] = useState(() => startOfWeekMonday(new Date()));
  const [viewMode, setViewMode] = useState<ViewMode>("week");
  const [focusDay, setFocusDay] = useState(() => new Date());
  const [drafts, setDrafts] = useState<CalendarPost[]>([]);
  const [scheduled, setScheduled] = useState<CalendarPost[]>([]);
  const [accounts, setAccounts] = useState<CalendarAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<CalendarPost | null>(null);
  const draftsRef = useRef(drafts);
  const scheduledRef = useRef(scheduled);
  draftsRef.current = drafts;
  scheduledRef.current = scheduled;

  const weekDays = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)),
    [weekStart],
  );

  const load = useCallback(async () => {
    setLoading(true);
    const res = await apiFetch<{
      drafts: CalendarPost[];
      scheduled: CalendarPost[];
      accounts: CalendarAccount[];
    }>(`/api/calendar?projectId=${projectId}`);
    if (!res.ok) {
      setError(res.error);
    } else {
      setDrafts(res.data.drafts);
      setScheduled(res.data.scheduled);
      setAccounts(res.data.accounts);
      setError(null);
    }
    setLoading(false);
  }, [projectId]);

  useEffect(() => {
    void load();
  }, [load]);

  const postsBySlot = useMemo(() => {
    const map = new Map<string, CalendarPost[]>();
    for (const p of scheduled) {
      const slot = scheduledToSlot(p);
      if (!slot) continue;
      const list = map.get(slot) || [];
      list.push(p);
      map.set(slot, list);
    }
    return map;
  }, [scheduled]);

  const findPost = useCallback((id: string) => {
    return (
      scheduledRef.current.find((p) => p.id === id) ||
      draftsRef.current.find((p) => p.id === id)
    );
  }, []);

  const persistSchedule = useCallback(
    async (postId: string, scheduledAt: Date | null) => {
      const res = await apiFetch<{ post: CalendarPost }>(`/api/posts/${postId}`, {
        method: "PATCH",
        body: JSON.stringify({
          scheduledAt: scheduledAt?.toISOString() ?? null,
          status: scheduledAt ? "scheduled" : "draft",
        }),
      });
      if (!res.ok) throw new Error(res.error);
    },
    [],
  );

  const hideFromCalendar = useCallback(
    (post: CalendarPost) => {
      const prevDrafts = draftsRef.current;
      const prevScheduled = scheduledRef.current;
      const unscheduled = { ...post, scheduledAt: null, status: "draft" };
      flushSync(() => {
        setScheduled((s) => s.filter((p) => p.id !== post.id));
        setDrafts((d) => [unscheduled, ...d.filter((p) => p.id !== post.id)]);
        setSelected((cur) => (cur?.id === post.id ? null : cur));
      });
      setBusy(true);
      void persistSchedule(post.id, null)
        .catch(() => {
          setDrafts(prevDrafts);
          setScheduled(prevScheduled);
          setError("Failed to remove from calendar");
        })
        .finally(() => setBusy(false));
    },
    [persistSchedule],
  );

  const deletePost = useCallback((post: CalendarPost) => {
    if (!confirm(`Delete “${post.hook || "this post"}”?`)) return;
    const prevDrafts = draftsRef.current;
    const prevScheduled = scheduledRef.current;
    flushSync(() => {
      setScheduled((s) => s.filter((p) => p.id !== post.id));
      setDrafts((d) => d.filter((p) => p.id !== post.id));
      setSelected((cur) => (cur?.id === post.id ? null : cur));
    });
    setBusy(true);
    void apiFetch(`/api/posts/${post.id}`, { method: "DELETE" })
      .then((res) => {
        if (!res.ok) throw new Error(res.error);
      })
      .catch(() => {
        setDrafts(prevDrafts);
        setScheduled(prevScheduled);
        setError("Failed to delete post");
      })
      .finally(() => setBusy(false));
  }, []);

  const onDragEnd = useCallback(
    (result: DropResult) => {
      const { draggableId, destination, source } = result;
      if (!destination) return;
      if (
        destination.droppableId === source.droppableId &&
        destination.index === source.index
      ) {
        return;
      }

      const post = findPost(draggableId);
      if (!post) return;

      const prevDrafts = draftsRef.current;
      const prevScheduled = scheduledRef.current;

      if (destination.droppableId === "drafts-queue") {
        if (!source.droppableId.startsWith("droppable-")) return;
        const unscheduled = { ...post, scheduledAt: null, status: "draft" };
        flushSync(() => {
          setScheduled((s) => s.filter((p) => p.id !== draggableId));
          setDrafts((d) => [unscheduled, ...d.filter((p) => p.id !== draggableId)]);
        });
        setBusy(true);
        void persistSchedule(draggableId, null)
          .catch(() => {
            setDrafts(prevDrafts);
            setScheduled(prevScheduled);
            setError("Failed to unschedule post");
          })
          .finally(() => setBusy(false));
        return;
      }

      const slot = parseSlotId(destination.droppableId);
      if (!slot) return;

      const when = new Date(`${slot.day}T${pad2(slot.hour)}:00:00`);
      const updated: CalendarPost = {
        ...post,
        scheduledAt: when.toISOString(),
        status: "scheduled",
      };

      flushSync(() => {
        setDrafts((d) => d.filter((p) => p.id !== draggableId));
        setScheduled((s) => [...s.filter((p) => p.id !== draggableId), updated]);
      });

      setBusy(true);
      void persistSchedule(draggableId, when)
        .catch(() => {
          setDrafts(prevDrafts);
          setScheduled(prevScheduled);
          setError("Failed to schedule post");
        })
        .finally(() => setBusy(false));
    },
    [findPost, persistSchedule],
  );

  const weekLabel = `${weekDays[0].toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  })} – ${weekDays[6].toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  })}`;

  const monthDays = useMemo(() => {
    const first = new Date(weekStart.getFullYear(), weekStart.getMonth(), 1);
    const start = startOfWeekMonday(first);
    return Array.from({ length: 42 }, (_, i) => addDays(start, i));
  }, [weekStart]);

  if (loading) return <LoadingBlock />;

  return (
    <div className="flex h-full min-h-0 flex-col gap-4 bg-bg">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => setWeekStart((w) => addDays(w, viewMode === "month" ? -28 : viewMode === "day" ? -1 : -7))}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setWeekStart(startOfWeekMonday(new Date()))}>
            Today
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setWeekStart((w) => addDays(w, viewMode === "month" ? 28 : viewMode === "day" ? 1 : 7))}>
            <ChevronRight className="h-4 w-4" />
          </Button>
          <span className="text-sm font-semibold tracking-tight text-zinc-100">
            {viewMode === "month"
              ? weekStart.toLocaleDateString(undefined, { month: "long", year: "numeric" })
              : viewMode === "day"
                ? focusDay.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })
                : weekLabel}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-lg border border-white/[0.06] bg-transparent p-0.5">
            {(["month", "week", "day"] as ViewMode[]).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => setViewMode(mode)}
                className={cn(
                  "rounded-md px-3 py-1.5 text-xs font-medium capitalize transition-colors",
                  viewMode === mode ? "bg-white/[0.08] text-white" : "text-zinc-400 hover:text-zinc-200",
                )}
              >
                {mode}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1.5 rounded-lg border border-white/[0.06] px-2.5 py-1.5 text-[11px] text-zinc-400">
            <Clock className="h-3.5 w-3.5" />
            {tz}
          </div>
          {busy && <Loader2 className="h-4 w-4 animate-spin text-zinc-400" />}
        </div>
      </div>

      {error && <ErrorBlock message={error} onRetry={load} />}

      <DragDropContext onDragEnd={onDragEnd}>
        <div className="flex min-h-0 flex-1 gap-4">
          <div className="min-w-0 flex-1 overflow-hidden rounded-xl border border-white/[0.06] bg-bg">
            {viewMode === "week" && (
              <div className="flex h-full flex-col overflow-auto">
                <div className="sticky top-0 z-10 grid grid-cols-[56px_repeat(7,minmax(0,1fr))] border-b border-white/[0.06] bg-bg">
                  <div />
                  {weekDays.map((day, i) => {
                    const isToday = dateKey(day) === dateKey(new Date());
                    return (
                      <div key={dateKey(day)} className="min-w-0 border-l border-white/[0.06] px-2 py-2 text-center">
                        <p className="text-[10px] font-medium uppercase tracking-wider text-zinc-500">{DAY_LABELS[i]}</p>
                        <p className={cn("text-sm font-semibold", isToday ? "text-primary" : "text-zinc-100")}>{day.getDate()}</p>
                      </div>
                    );
                  })}
                </div>
                <div>
                  {HOURS.map((hour) => (
                    <div key={hour} className="grid grid-cols-[56px_repeat(7,minmax(0,1fr))]">
                      <div className="border-b border-white/[0.05] bg-bg px-2 py-2 text-right text-[10px] font-medium text-zinc-400">
                        {String(hour).padStart(2, "0")}:00
                      </div>
                      {weekDays.map((day) => {
                        const id = slotId(day, hour);
                        const items = postsBySlot.get(id) || [];
                        return (
                          <Droppable droppableId={id} key={id} ignoreContainerClipping>
                            {(provided, snapshot) => (
                              <div
                                ref={provided.innerRef}
                                {...provided.droppableProps}
                                className={cn(
                                  CELL,
                                  snapshot.isDraggingOver ? "bg-white/[0.08]" : "bg-transparent hover:bg-white/[0.02]",
                                )}
                              >
                                {items.map((post, index) => (
                                  <Draggable key={post.id} draggableId={post.id} index={index}>
                                    {(dragProvided, dragSnap) => (
                                      <div
                                        ref={dragProvided.innerRef}
                                        {...dragProvided.draggableProps}
                                        style={dragCloneStyle(
                                          dragProvided.draggableProps.style,
                                          dragSnap.isDragging,
                                        )}
                                        className="w-full min-w-0 max-w-full"
                                      >
                                        <ScheduledPill
                                          post={post}
                                          dragHandleProps={dragProvided.dragHandleProps ?? undefined}
                                          onSelect={() => setSelected(post)}
                                          onHide={() => hideFromCalendar(post)}
                                          onDelete={() => deletePost(post)}
                                        />
                                      </div>
                                    )}
                                  </Draggable>
                                ))}
                                {provided.placeholder}
                              </div>
                            )}
                          </Droppable>
                        );
                      })}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {viewMode === "day" && (
              <div className="h-full overflow-auto p-3">
                {HOURS.map((hour) => {
                  const id = slotId(focusDay, hour);
                  const items = postsBySlot.get(id) || [];
                  return (
                    <Droppable droppableId={id} key={id} ignoreContainerClipping>
                      {(provided, snapshot) => (
                        <div
                          ref={provided.innerRef}
                          {...provided.droppableProps}
                          className={cn(
                            "mb-2 flex min-h-[52px] gap-3 rounded-lg border border-white/[0.06] p-2 transition-colors",
                            snapshot.isDraggingOver ? "bg-white/[0.08]" : "bg-transparent hover:bg-white/[0.02]",
                          )}
                        >
                          <span className="w-12 shrink-0 text-xs text-zinc-500">{String(hour).padStart(2, "0")}:00</span>
                          <div className="min-w-0 flex-1 space-y-1">
                            {items.map((post, index) => (
                              <Draggable key={post.id} draggableId={post.id} index={index}>
                                {(dragProvided, dragSnap) => (
                                  <div
                                    ref={dragProvided.innerRef}
                                    {...dragProvided.draggableProps}
                                    style={dragCloneStyle(
                                      dragProvided.draggableProps.style,
                                      dragSnap.isDragging,
                                    )}
                                    className="w-full min-w-0"
                                  >
                                    <ScheduledPill
                                      post={post}
                                      dragHandleProps={dragProvided.dragHandleProps ?? undefined}
                                      onSelect={() => setSelected(post)}
                                      onHide={() => hideFromCalendar(post)}
                                      onDelete={() => deletePost(post)}
                                    />
                                  </div>
                                )}
                              </Draggable>
                            ))}
                            {provided.placeholder}
                          </div>
                        </div>
                      )}
                    </Droppable>
                  );
                })}
              </div>
            )}

            {viewMode === "month" && (
              <div className="grid grid-cols-7 gap-px bg-white/[0.05] p-3">
                {monthDays.map((day) => {
                  const count = scheduled.filter((p) => p.scheduledAt && dateKey(new Date(p.scheduledAt)) === dateKey(day)).length;
                  const isToday = dateKey(day) === dateKey(new Date());
                  return (
                    <button
                      key={dateKey(day)}
                      type="button"
                      onClick={() => { setFocusDay(day); setViewMode("day"); }}
                      className={cn(
                        "rounded-lg bg-white/[0.03] p-2 text-left transition-colors hover:bg-white/[0.06]",
                        isToday && "ring-1 ring-primary/50",
                      )}
                    >
                      <p className="text-xs text-zinc-400">{day.getDate()}</p>
                      {count > 0 && <p className="mt-1 text-[10px] font-medium text-primary">{count} scheduled</p>}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <aside className="flex w-[280px] shrink-0 flex-col rounded-xl border border-white/[0.06] bg-bg">
            <div className="border-b border-white/[0.06] px-4 py-3">
              <h3 className="text-sm font-semibold text-zinc-100">Unscheduled Drafts</h3>
              <p className="text-[11px] text-zinc-500">Drag onto the calendar to schedule</p>
            </div>
            <Droppable droppableId="drafts-queue">
              {(provided, snapshot) => (
                <div
                  ref={provided.innerRef}
                  {...provided.droppableProps}
                  className={cn(
                    "flex-1 space-y-2 overflow-y-auto p-3",
                    snapshot.isDraggingOver && "bg-white/[0.04]",
                  )}
                >
                  {drafts.length === 0 ? (
                    <p className="py-8 text-center text-xs text-zinc-500">No drafts ready. Generate content in Studio first.</p>
                  ) : (
                    drafts.map((post, index) => (
                      <Draggable key={post.id} draggableId={post.id} index={index}>
                        {(dragProvided, dragSnap) => (
                          <div
                            ref={dragProvided.innerRef}
                            {...dragProvided.draggableProps}
                            style={dragCloneStyle(
                              dragProvided.draggableProps.style,
                              dragSnap.isDragging,
                            )}
                          >
                            {dragSnap.isDragging ? (
                              <ScheduledPill
                                post={post}
                                dragHandleProps={dragProvided.dragHandleProps ?? undefined}
                                onSelect={() => undefined}
                                onHide={() => undefined}
                                onDelete={() => undefined}
                              />
                            ) : (
                              <DraftQueueCard
                                post={post}
                                dragHandleProps={dragProvided.dragHandleProps ?? undefined}
                                onSelect={() => setSelected(post)}
                              />
                            )}
                          </div>
                        )}
                      </Draggable>
                    ))
                  )}
                  {provided.placeholder}
                </div>
              )}
            </Droppable>
            {accounts.length > 0 && (
              <div className="border-t border-white/[0.06] px-4 py-2 text-[10px] text-zinc-500">
                {accounts.length} connected channel{accounts.length === 1 ? "" : "s"}
              </div>
            )}
          </aside>
        </div>
      </DragDropContext>

      {selected && (
        <div className="fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col border-l border-white/[0.06] bg-bg shadow-2xl">
          <div className="flex items-start justify-between border-b border-white/[0.06] p-4">
            <div>
              <p className="text-[10px] font-medium uppercase tracking-wider text-zinc-500">{statusLabel(selected.status)}</p>
              <h3 className="mt-1 text-base font-semibold text-zinc-100">{selected.hook}</h3>
              {selected.scheduledAt && (
                <p className="mt-1 text-xs text-zinc-500">{new Date(selected.scheduledAt).toLocaleString()}</p>
              )}
            </div>
            <button type="button" onClick={() => setSelected(null)} className="rounded-lg p-1.5 text-zinc-400 hover:bg-white/[0.06] hover:text-white">
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-4">
            {selected.coverUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={selected.coverUrl} alt="" className="mb-4 w-full rounded-xl border border-white/[0.06] object-cover" />
            )}
            {selected.caption && <p className="whitespace-pre-wrap text-sm text-zinc-400">{selected.caption}</p>}
          </div>
          <div className="border-t border-white/[0.06] p-4">
            <Link
              href={`/generate?postId=${selected.id}`}
              className="inline-flex h-10 w-full items-center justify-center rounded-xl bg-primary text-sm font-medium text-primary-fg hover:brightness-110"
            >
              Edit in Generator
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
