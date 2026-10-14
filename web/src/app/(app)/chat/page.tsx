"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ImagePlus, Loader2, Plus, Send, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useProject } from "@/lib/project-context";
import { apiFetch } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import { LoadingBlock } from "@/components/empty-state";
import { RichMessage, type PostCardData } from "@/components/post-card";
import {
  CompetitorCard,
  type CompetitorCardData,
} from "@/components/competitor-card";

type Attachment = { name: string; url: string; mime: string };
type Msg = {
  id?: string;
  role: "user" | "assistant";
  content: string;
  attachments?: Attachment[];
  citedPosts?: PostCardData[];
  competitorCards?: CompetitorCardData[];
};
type Conversation = {
  id: string;
  title: string;
  updatedAt: string;
  _count?: { messages: number };
};

export default function ChatPage() {
  const { project, projectId, loading: projectLoading } = useProject();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [streaming, setStreaming] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [dragOver, setDragOver] = useState(false);
  const [postsById, setPostsById] = useState<Record<string, PostCardData>>({});
  const bottomRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  function mergeCited(posts: PostCardData[] | undefined) {
    if (!posts?.length) return;
    setPostsById((prev) => {
      const next = { ...prev };
      for (const p of posts) next[p.id] = p;
      return next;
    });
  }

  const loadConversations = useCallback(async () => {
    const url = projectId
      ? `/api/conversations?projectId=${projectId}`
      : "/api/conversations";
    const res = await apiFetch<{ conversations: Conversation[] }>(url, {
      retries: 1,
    });
    if (res.ok) setConversations(res.data.conversations);
  }, [projectId]);

  const loadConversation = useCallback(async (id: string) => {
    setLoading(true);
    setError(null);
    const res = await apiFetch<{
      conversation: { messages: Msg[] };
    }>(`/api/conversations/${id}`);
    if (!res.ok) {
      setError(res.error);
    } else {
      const msgs = res.data.conversation.messages.map((m) => ({
        id: m.id,
        role: m.role,
        content: m.content,
        attachments: m.attachments,
        citedPosts: m.citedPosts as PostCardData[] | undefined,
        competitorCards: m.competitorCards as CompetitorCardData[] | undefined,
      }));
      setMessages(msgs);
      for (const m of msgs) mergeCited(m.citedPosts);
      setActiveId(id);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void (async () => {
      setLoading(true);
      await loadConversations();
      setLoading(false);
    })();
  }, [loadConversations]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streaming]);

  async function newChat() {
    const res = await apiFetch<{ conversation: Conversation }>(
      "/api/conversations",
      {
        method: "POST",
        body: JSON.stringify({ projectId }),
      },
    );
    if (!res.ok) {
      setError(res.error);
      return;
    }
    await loadConversations();
    setActiveId(res.data.conversation.id);
    setMessages([]);
    setStreaming("");
  }

  async function uploadFiles(files: FileList | File[]) {
    const list = Array.from(files);
    for (const file of list) {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/upload", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Upload failed");
        continue;
      }
      setAttachments((a) => [
        ...a,
        { name: data.name, url: data.url, mime: data.mime },
      ]);
    }
  }

  async function send() {
    if ((!input.trim() && attachments.length === 0) || busy) return;
    let conversationId = activeId;
    if (!conversationId) {
      const created = await apiFetch<{ conversation: Conversation }>(
        "/api/conversations",
        {
          method: "POST",
          body: JSON.stringify({ projectId }),
        },
      );
      if (!created.ok) {
        setError(created.error || "Could not start chat");
        setBusy(false);
        return;
      }
      conversationId = created.data.conversation.id;
      setActiveId(conversationId);
      await loadConversations();
    }

    const userMsg: Msg = {
      role: "user",
      content: input.trim() || "(attached images)",
      attachments: [...attachments],
    };
    setMessages((m) => [...m, userMsg]);
    setInput("");
    const pendingAttachments = [...attachments];
    setAttachments([]);
    setBusy(true);
    setStreaming("");
    setError(null);

    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 55_000);

    try {
      const res = await fetch(`/api/conversations/${conversationId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: userMsg.content,
          attachments: pendingAttachments,
          stream: true,
        }),
        signal: controller.signal,
      });

      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => ({}));
        throw new Error(
          (data as { error?: string }).error ||
            `Chat failed (HTTP ${res.status})`,
        );
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let full = "";
      let gotDone = false;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split("\n\n");
        buffer = parts.pop() || "";
        for (const part of parts) {
          const lines = part.split("\n");
          let event = "message";
          let dataLine = "";
          for (const line of lines) {
            if (line.startsWith("event: ")) event = line.slice(7);
            if (line.startsWith("data: ")) dataLine = line.slice(6);
          }
          if (!dataLine) continue;
          let data: Record<string, unknown>;
          try {
            data = JSON.parse(dataLine) as Record<string, unknown>;
          } catch {
            continue;
          }
          if (event === "token") {
            full += String(data.token ?? "");
            setStreaming(full);
          } else if (event === "error") {
            throw new Error(
              typeof data.error === "string" ? data.error : "Stream error",
            );
          } else if (event === "done") {
            gotDone = true;
            const cited = data.citedPosts as PostCardData[] | undefined;
            mergeCited(cited);
            const msgContent =
              full ||
              (data.message as { content?: string } | undefined)?.content ||
              "";
            setMessages((m) => [
              ...m,
              {
                role: "assistant",
                content: msgContent,
                citedPosts: cited,
                competitorCards: data.competitorCards as
                  | CompetitorCardData[]
                  | undefined,
              },
            ]);
            setStreaming("");
            await loadConversations();
          }
        }
      }

      if (!gotDone && full) {
        setMessages((m) => [...m, { role: "assistant", content: full }]);
        setStreaming("");
      } else if (!gotDone && !full) {
        throw new Error(
          "No response from the model. Check AI keys / database and try again.",
        );
      }
    } catch (err) {
      const message =
        err instanceof DOMException && err.name === "AbortError"
          ? "Chat timed out after 55s. The database or AI provider may be overloaded — try again."
          : err instanceof Error
            ? err.message
            : "Chat failed";
      setError(message);
      setStreaming("");
    } finally {
      window.clearTimeout(timeout);
      setBusy(false);
    }
  }

  async function removeConversation(id: string) {
    await apiFetch(`/api/conversations/${id}`, { method: "DELETE" });
    if (activeId === id) {
      setActiveId(null);
      setMessages([]);
    }
    await loadConversations();
  }

  if (projectLoading) return <LoadingBlock label="Loading workspace…" />;

  return (
    <div className="flex h-full">
      <aside className="flex w-64 shrink-0 flex-col border-r border-border">
        <div className="flex h-[68px] items-center justify-between border-b border-border px-4">
          <p className="text-sm font-semibold text-ink">Conversations</p>
          <Button size="icon" variant="ghost" onClick={newChat}>
            <Plus className="h-4 w-4" />
          </Button>
        </div>
        <div className="flex-1 space-y-0.5 overflow-y-auto px-4 py-3">
          {conversations.length === 0 && (
            <p className="text-xs text-muted">No chats yet.</p>
          )}
          {conversations.map((c) => (
            <div
              key={c.id}
              className={cn(
                "group flex items-center gap-1 rounded-lg px-2 py-2 text-sm",
                activeId === c.id ? "bg-surface-2 text-ink" : "text-muted hover:bg-surface",
              )}
            >
              <button
                type="button"
                className="min-w-0 flex-1 truncate text-left"
                onClick={() => loadConversation(c.id)}
              >
                {c.title}
              </button>
              <button
                type="button"
                className="opacity-0 group-hover:opacity-100"
                onClick={() => removeConversation(c.id)}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      </aside>

      <div
        className="flex min-w-0 flex-1 flex-col"
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          if (e.dataTransfer.files?.length) void uploadFiles(e.dataTransfer.files);
        }}
      >
        <div className="flex h-[68px] flex-col justify-center border-b border-border px-4">
          <h1 className="text-sm font-semibold text-ink">AI Chat</h1>
          <p className="mt-0.5 text-xs text-muted">
            {project
              ? `Context: ${project.name} · projects, analytics, posts, competitors`
              : "Select a project for grounded answers"}
          </p>
        </div>

        {error && (
          <div className="mx-4 mt-3 rounded-xl border border-warning/40 bg-warning/10 px-3 py-2.5 text-xs text-warning">
            <div className="flex items-start justify-between gap-3">
              <p className="min-w-0 flex-1 leading-relaxed">{error}</p>
              <button
                type="button"
                className="shrink-0 text-[11px] underline hover:text-ink"
                onClick={() => setError(null)}
              >
                Dismiss
              </button>
            </div>
          </div>
        )}

        <div className="relative flex-1 space-y-4 overflow-y-auto px-4 py-4">
          {dragOver && (
            <div className="pointer-events-none absolute inset-4 z-10 flex items-center justify-center rounded-2xl border-2 border-dashed border-primary/50 bg-primary/5 text-sm text-primary">
              Drop images to attach
            </div>
          )}

          {loading && messages.length === 0 && (
            <p className="text-sm text-muted">Select or start a conversation.</p>
          )}

          {messages.map((m, i) => (
            <div
              key={i}
              className={cn(
                "flex w-full",
                m.role === "user" ? "justify-end" : "justify-start",
              )}
            >
              <div
                className={cn(
                  "text-sm leading-relaxed",
                  m.role === "assistant"
                    ? "w-full max-w-[640px] rounded-2xl bg-surface-2 px-4 py-3 text-ink"
                    : "w-fit max-w-[75%] rounded-[22px] bg-primary px-3.5 py-2 text-primary-fg",
                )}
              >
                {m.attachments && m.attachments.length > 0 && (
                  <div className="mb-2 flex flex-wrap gap-2">
                    {m.attachments.map((a) => (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        key={a.url}
                        src={a.url}
                        alt={a.name}
                        className="h-20 w-20 rounded-lg object-cover"
                      />
                    ))}
                  </div>
                )}
                {m.role === "assistant" ? (
                  <div className="space-y-2">
                    {m.competitorCards && m.competitorCards.length > 0 && (
                      <div className="space-y-2">
                        <p className="text-[11px] font-medium uppercase tracking-[0.06em] text-muted">
                          Competitors found
                        </p>
                        {m.competitorCards.map((c) => (
                          <CompetitorCard key={c.id} data={c} />
                        ))}
                      </div>
                    )}
                    <RichMessage
                      content={m.content}
                      postsById={{
                        ...postsById,
                        ...Object.fromEntries(
                          (m.citedPosts || []).map((p) => [p.id, p]),
                        ),
                      }}
                      leadingPosts={m.citedPosts}
                      leadingLabel={
                        (m.citedPosts || []).some((p) => p.status === "external")
                          ? "Videos & previews"
                          : "Posts referenced"
                      }
                    />
                  </div>
                ) : (
                  <p className="whitespace-pre-wrap">{m.content}</p>
                )}
              </div>
            </div>
          ))}

          {streaming && (
            <div className="flex justify-start">
              <div className="w-full max-w-[640px] rounded-2xl bg-surface-2 px-4 py-3 text-sm">
                <RichMessage content={streaming} postsById={postsById} />
              </div>
            </div>
          )}
          {busy && !streaming && (
            <div className="flex items-center gap-2 text-xs text-muted">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Thinking…
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        <div className="border-t border-border px-4 py-4">
          {attachments.length > 0 && (
            <div className="mb-2 flex flex-wrap gap-2">
              {attachments.map((a) => (
                <div key={a.url} className="relative">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={a.url} alt={a.name} className="h-14 w-14 rounded-lg object-cover" />
                </div>
              ))}
            </div>
          )}
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              void send();
            }}
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                e.preventDefault();
                void send();
              }
            }}
          >
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(e) => {
                if (e.target.files) void uploadFiles(e.target.files);
              }}
            />
            <Button
              type="button"
              size="icon"
              variant="secondary"
              onClick={() => fileRef.current?.click()}
            >
              <ImagePlus className="h-4 w-4" />
            </Button>
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask anything about growth, hooks, experiments…"
              className="h-11 flex-1 rounded-xl border border-border bg-bg px-3.5 text-sm"
              disabled={busy}
            />
            <Button type="submit" size="icon" disabled={busy}>
              <Send className="h-4 w-4" />
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
