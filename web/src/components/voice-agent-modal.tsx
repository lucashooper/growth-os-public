"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Expand,
  History,
  Loader2,
  Mic,
  MicOff,
  Plus,
  Send,
  Trash2,
  X,
} from "lucide-react";
import { OrbAgent, type OrbMode } from "@/components/orb-agent";
import { VoiceWaveform } from "@/components/voice-waveform";
import { LivePreview, type LivePreviewSlide } from "@/components/live-preview";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { apiFetch } from "@/lib/api-client";

type DraftCard = {
  id: string;
  title?: string;
  hook: string;
  hookText?: string;
  previewUrl?: string;
  coverUrl: string;
  variantTag?: string;
  slides?: string[];
  visualSlides?: LivePreviewSlide[];
  captionBoxId?: string;
  textStyleId?: string;
};

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  drafts?: DraftCard[];
  createdAt?: string;
};

type VoiceConversation = {
  id: string;
  title: string;
  updatedAt: string;
  _count?: { messages: number };
  messages?: { content: string; role: string; createdAt: string }[];
};

type PendingOptions = {
  slideCount: number;
  packLabel: string;
  packSlug: string;
};

type SpeechRec = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((ev: SpeechRecognitionEventLike) => void) | null;
  onerror: ((ev: { error?: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};

type SpeechRecognitionEventLike = {
  resultIndex: number;
  results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }>;
};

const HINTS = [
  "Create a 5-slide carousel on evening routines",
  "Generate 3 hooks for my latest journal draft",
  "Summarize top performing posts this week",
];

const PACK_OPTIONS = [
  { label: "Dark Luxe Reflection", slug: "girl-dark-luxe-night-reflection" },
  { label: "Paper & Books", slug: "philosopher" },
  { label: "Gym / Stoic", slug: "gym-stoic" },
];

function getSpeechRecognition(): (new () => SpeechRec) | null {
  if (typeof window === "undefined") return null;
  const w = window as Window & {
    SpeechRecognition?: new () => SpeechRec;
    webkitSpeechRecognition?: new () => SpeechRec;
  };
  return w.SpeechRecognition || w.webkitSpeechRecognition || null;
}

function applyWorkspaceVocabulary(text: string) {
  const pairs: [RegExp, string][] = [
    [/\b(dallas|girl aesthetic|girl aesthetic pack)\b/gi, "Girl-Aesthetic"],
    [/\binsights?\s+philosophy\b/gi, "Insight philosophy"],
    [/\bphilosopher\b/gi, "Philosopher"],
    [/\bzeno\b/gi, "Zeno"],
    [/\btick\s*tock\b/gi, "TikTok"],
  ];
  let out = text;
  for (const [re, to] of pairs) out = out.replace(re, to);
  return out;
}

type Props = {
  open: boolean;
  onClose: () => void;
  projectId: string;
};

function mapDraft(d: {
  id: string;
  title?: string;
  hook?: string;
  hookText?: string;
  previewUrl?: string;
  coverUrl?: string;
  variantTag?: string;
  slides?: string[];
  visualSlides?: LivePreviewSlide[];
  captionBoxId?: string;
  textStyleId?: string;
}): DraftCard {
  const hook = d.hook || d.hookText || d.title || "Draft";
  const cover = d.coverUrl || d.previewUrl || "";
  const texts =
    Array.isArray(d.slides) && d.slides.length
      ? d.slides
      : d.visualSlides?.map((s) => s.text).filter(Boolean) || [hook];
  const visualSlides: LivePreviewSlide[] =
    Array.isArray(d.visualSlides) && d.visualSlides.length
      ? d.visualSlides.map((s, i) => ({
          index: s.index || i + 1,
          text: s.text || texts[i] || hook,
          backgroundUrl: s.backgroundUrl || cover,
        }))
      : texts.map((text, i) => ({
          index: i + 1,
          text,
          backgroundUrl: cover,
        }));
  return {
    id: d.id,
    title: d.title || hook,
    hook,
    hookText: d.hookText || d.hook || "",
    previewUrl: d.previewUrl || cover,
    coverUrl: cover,
    variantTag: d.variantTag,
    slides: texts,
    visualSlides,
    captionBoxId: d.captionBoxId || "highlight",
    textStyleId: d.textStyleId || "tiktok-sans",
  };
}

function formatRelative(iso: string) {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "";
  const mins = Math.round((Date.now() - t) / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

export function VoiceAgentModal({ open, onClose, projectId }: Props) {
  const router = useRouter();
  const draftsRef = useRef<HTMLDivElement>(null);
  const threadRef = useRef<HTMLDivElement>(null);

  const [mode, setMode] = useState<OrbMode>("idle");
  const [committed, setCommitted] = useState("");
  const [interim, setInterim] = useState("");
  const [textFallback, setTextFallback] = useState("");
  const [listening, setListening] = useState(false);
  const [audioLevel, setAudioLevel] = useState(0);
  const [waveLevels, setWaveLevels] = useState<number[]>([0.12, 0.14, 0.16, 0.14, 0.12, 0.13]);
  const [drafts, setDrafts] = useState<DraftCard[]>([]);
  const [activeDraftId, setActiveDraftId] = useState<string | null>(null);
  const [reply, setReply] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [history, setHistory] = useState<VoiceConversation[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [inputFocused, setInputFocused] = useState(false);
  const [speechSupported, setSpeechSupported] = useState(true);
  const [hintIndex, setHintIndex] = useState(0);
  const [hintVisible, setHintVisible] = useState(true);
  const [pending, setPending] = useState<PendingOptions>({
    slideCount: 5,
    packLabel: "",
    packSlug: "",
  });
  const [presetsTouched, setPresetsTouched] = useState(false);
  const [libraryPacks, setLibraryPacks] = useState<
    { label: string; slug: string }[]
  >([]);
  const [customSlideCount, setCustomSlideCount] = useState("");
  const [optionsOpen, setOptionsOpen] = useState(false);
  const startingMic = useRef(false);
  const [splitPct, setSplitPct] = useState(46);
  const draggingSplit = useRef(false);
  const shellRef = useRef<HTMLDivElement>(null);

  const recognitionRef = useRef<SpeechRec | null>(null);
  const rafRef = useRef(0);
  const listeningRef = useRef(false);
  const committedRef = useRef("");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const busyRef = useRef(false);
  const conversationIdRef = useRef<string | null>(null);

  useEffect(() => {
    busyRef.current = busy;
  }, [busy]);

  useEffect(() => {
    conversationIdRef.current = conversationId;
  }, [conversationId]);

  useEffect(() => {
    if (!open || listening || busy) return;
    const t = setInterval(() => {
      setHintVisible(false);
      setTimeout(() => {
        setHintIndex((i) => (i + 1) % HINTS.length);
        setHintVisible(true);
      }, 300);
    }, 5000);
    return () => clearInterval(t);
  }, [open, listening, busy]);

  const stopMicLevel = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = 0;
    setAudioLevel(0);
    setWaveLevels([0.12, 0.14, 0.16, 0.14, 0.12, 0.13]);
  }, []);

  useEffect(() => {
    if (!listening) return;
    const t = window.setInterval(() => {
      setAudioLevel(0.35 + Math.random() * 0.4);
      setWaveLevels(
        Array.from({ length: 6 }, () => 0.18 + Math.random() * 0.7),
      );
    }, 90);
    return () => window.clearInterval(t);
  }, [listening]);

  useEffect(() => {
    if (!open || !projectId) return;
    void apiFetch<{ packs: { name: string; slug: string }[] }>(
      `/api/image-packs?projectId=${projectId}`,
    ).then((res) => {
      if (!res.ok) return;
      setLibraryPacks(
        (res.data.packs || []).map((p) => ({
          label: p.name,
          slug: p.slug,
        })),
      );
    });
  }, [open, projectId]);

  const loadHistory = useCallback(async () => {
    if (!projectId) return;
    setHistoryLoading(true);
    const res = await apiFetch<{ conversations: VoiceConversation[] }>(
      `/api/conversations?projectId=${encodeURIComponent(projectId)}&kind=voice`,
      { skipCache: true },
    );
    setHistoryLoading(false);
    if (res.ok) setHistory(res.data.conversations || []);
  }, [projectId]);

  useEffect(() => {
    if (open && historyOpen) void loadHistory();
  }, [open, historyOpen, loadHistory]);

  useEffect(() => {
    if (!threadRef.current) return;
    threadRef.current.scrollTop = threadRef.current.scrollHeight;
  }, [messages, reply, busy]);

  const packChoices = libraryPacks.length ? libraryPacks : PACK_OPTIONS;

  const applyDrafts = useCallback((nextDrafts: DraftCard[]) => {
    if (!nextDrafts.length) return;
    setDrafts((prev) => {
      const seen = new Set(prev.map((p) => p.id));
      return [...nextDrafts.filter((d) => !seen.has(d.id)), ...prev];
    });
    setActiveDraftId(nextDrafts[0]!.id);
    setTimeout(() => {
      draftsRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }, 200);
  }, []);

  const startNewChat = useCallback(() => {
    setConversationId(null);
    conversationIdRef.current = null;
    setMessages([]);
    setReply("");
    setDrafts([]);
    setActiveDraftId(null);
    setHistoryOpen(false);
    setMode("idle");
  }, []);

  const loadConversation = useCallback(
    async (id: string) => {
      setBusy(true);
      setHistoryOpen(false);
      const res = await apiFetch<{
        conversation: {
          id: string;
          title: string;
          messages: Array<{
            id: string;
            role: string;
            content: string;
            createdAt: string;
            metaJson?: string;
            citedPosts?: unknown[];
          }>;
        };
      }>(`/api/conversations/${id}`, { skipCache: true });
      setBusy(false);
      if (!res.ok) {
        setReply(res.error || "Could not load chat");
        return;
      }
      const conv = res.data.conversation;
      setConversationId(conv.id);
      conversationIdRef.current = conv.id;
      const loaded: ChatMessage[] = [];
      const allDrafts: DraftCard[] = [];
      for (const m of conv.messages || []) {
        let draftsMeta: DraftCard[] = [];
        try {
          const meta = JSON.parse(m.metaJson || "{}") as { drafts?: unknown[] };
          if (Array.isArray(meta.drafts)) {
            draftsMeta = meta.drafts.map((d) =>
              mapDraft(d as Parameters<typeof mapDraft>[0]),
            );
            allDrafts.push(...draftsMeta);
          }
        } catch {
          /* ignore */
        }
        loaded.push({
          id: m.id,
          role: m.role === "assistant" ? "assistant" : "user",
          content: m.content,
          drafts: draftsMeta,
          createdAt: m.createdAt,
        });
      }
      setMessages(loaded);
      setDrafts(allDrafts);
      setActiveDraftId(allDrafts[0]?.id || null);
      const lastAssistant = [...loaded].reverse().find((m) => m.role === "assistant");
      setReply(lastAssistant?.content || "");
      setMode("idle");
    },
    [],
  );

  const deleteConversation = useCallback(
    async (id: string, e: React.MouseEvent) => {
      e.stopPropagation();
      const res = await apiFetch(`/api/conversations/${id}`, {
        method: "DELETE",
        skipCache: true,
      });
      if (!res.ok) return;
      setHistory((prev) => prev.filter((c) => c.id !== id));
      if (conversationIdRef.current === id) startNewChat();
    },
    [startNewChat],
  );

  const buildTranscript = useCallback(
    (raw: string) => {
      const base = applyWorkspaceVocabulary(raw.trim());
      if (!base) return "";
      if (!presetsTouched) return base;
      const bits: string[] = [];
      if (pending.slideCount) bits.push(`Use ${pending.slideCount} slides`);
      if (pending.packLabel) bits.push(`with the ${pending.packLabel} pack`);
      return bits.length ? `${base}. ${bits.join(" ")}.` : base;
    },
    [pending, presetsTouched],
  );

  const runTurn = useCallback(
    async (text: string) => {
      const cleaned = buildTranscript(text);
      if (!cleaned || !projectId || busyRef.current) return;
      setBusy(true);
      setMode("thinking");
      setReply("");
      const tempUserId = `local-user-${Date.now()}`;
      setMessages((prev) => [
        ...prev,
        { id: tempUserId, role: "user", content: cleaned },
      ]);
      try {
        const res = await fetch("/api/agent/voice", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            projectId,
            transcript: cleaned,
            slideCount: presetsTouched ? pending.slideCount : undefined,
            imagePackSlug: pending.packSlug || undefined,
            conversationId: conversationIdRef.current,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Agent failed");

        const payload = data.data || data;
        if (payload.conversationId) {
          setConversationId(payload.conversationId);
          conversationIdRef.current = payload.conversationId;
        }

        setMode("speaking");
        const assistantReply = payload.reply || "";
        setReply(assistantReply);
        const nextDrafts: DraftCard[] = Array.isArray(payload.drafts)
          ? payload.drafts.map(mapDraft)
          : [];
        setMessages((prev) => [
          ...prev,
          {
            id: `local-assistant-${Date.now()}`,
            role: "assistant",
            content: assistantReply || "Done.",
            drafts: nextDrafts,
          },
        ]);
        applyDrafts(nextDrafts);
        void loadHistory();
        setTimeout(() => {
          setMode("idle");
          setAudioLevel(0);
        }, 1800);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Something went wrong";
        setReply(message);
        setMessages((prev) => [
          ...prev,
          {
            id: `local-error-${Date.now()}`,
            role: "assistant",
            content: message,
          },
        ]);
        setMode("idle");
      } finally {
        setBusy(false);
      }
    },
    [
      projectId,
      buildTranscript,
      pending,
      presetsTouched,
      applyDrafts,
      loadHistory,
    ],
  );

  const stopListening = useCallback(
    (submit = false) => {
      listeningRef.current = false;
      setListening(false);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      try {
        recognitionRef.current?.stop();
      } catch {
        /* ignore */
      }
      stopMicLevel();
      const text = (committedRef.current + " " + interim).trim() || committedRef.current;
      setInterim("");
      if (submit && text) void runTurn(text);
      else if (!busyRef.current) setMode("idle");
    },
    [interim, runTurn, stopMicLevel],
  );

  const startListening = useCallback(async () => {
    if (startingMic.current || listeningRef.current) return;
    const Ctor = getSpeechRecognition();
    if (!Ctor) {
      setSpeechSupported(false);
      return;
    }
    startingMic.current = true;
    setSpeechSupported(true);
    setInterim("");
    setCommitted("");
    committedRef.current = "";
    setMode("listening");
    setListening(true);
    listeningRef.current = true;

    const rec = new Ctor();
    recognitionRef.current = rec;
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = "en-US";
    rec.onresult = (ev) => {
      let finals = "";
      let interimText = "";
      for (let i = ev.resultIndex; i < ev.results.length; i++) {
        const piece = ev.results[i]![0].transcript;
        if (ev.results[i]!.isFinal) finals += piece;
        else interimText += piece;
      }
      if (interimText) setInterim(interimText);
      if (finals) {
        committedRef.current = `${committedRef.current} ${finals}`.trim();
        setCommitted(committedRef.current);
        setInterim("");
        if (debounceRef.current) clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(() => {
          if (!listeningRef.current) return;
          const text = committedRef.current.trim();
          if (text.length > 8) {
            listeningRef.current = false;
            setListening(false);
            try {
              recognitionRef.current?.stop();
            } catch {
              /* ignore */
            }
            stopMicLevel();
            void runTurn(text);
          }
        }, 1600);
      }
    };
    rec.onerror = (ev) => {
      const err = ev.error || "";
      if (err === "aborted" || err === "no-speech") return;
      if (err === "not-allowed" || err === "service-not-allowed") {
        setSpeechSupported(false);
        listeningRef.current = false;
        setListening(false);
        setMode("idle");
        stopMicLevel();
        return;
      }
    };
    rec.onend = () => {
      if (listeningRef.current && !busyRef.current) {
        try {
          rec.start();
        } catch {
          /* ignore */
        }
      }
    };
    try {
      rec.start();
    } catch {
      listeningRef.current = false;
      setListening(false);
      setMode("idle");
    } finally {
      startingMic.current = false;
    }
  }, [runTurn, stopMicLevel]);

  const toggleMic = useCallback(() => {
    if (busy) return;
    if (listening) stopListening(true);
    else void startListening();
  }, [busy, listening, startListening, stopListening]);

  useEffect(() => {
    if (!open) {
      stopListening(false);
      setInterim("");
      setCommitted("");
      committedRef.current = "";
      setReply("");
      setMode("idle");
    }
  }, [open, stopListening]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    const onMove = (e: MouseEvent) => {
      if (!draggingSplit.current || !shellRef.current) return;
      const rect = shellRef.current.getBoundingClientRect();
      const pct = ((e.clientX - rect.left) / rect.width) * 100;
      setSplitPct(Math.min(72, Math.max(28, pct)));
    };
    const onUp = () => {
      draggingSplit.current = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [open, onClose]);

  if (!open) return null;

  const liveLine = [committed, interim].filter(Boolean).join(" ");
  const hasThread = messages.length > 0;
  const showHint =
    !listening &&
    !busy &&
    !liveLine &&
    !textFallback.trim() &&
    !inputFocused &&
    !hasThread;
  const showPreview = drafts.length > 0;
  const activeDraft =
    drafts.find((d) => d.id === activeDraftId) || drafts[0] || null;

  const openInGenerator = (id?: string) => {
    const draftId = id || activeDraft?.id;
    if (!draftId) return;
    onClose();
    router.push(`/generate?draft=${draftId}&path=manual`);
  };

  const chatPane = (
    <div className="relative flex h-full min-h-0 w-full flex-col">
      <div
        ref={threadRef}
        className="flex min-h-0 w-full flex-1 flex-col overflow-y-auto px-4"
      >
        {!hasThread ? (
          <div className="flex h-full w-full flex-col items-center justify-center">
            <OrbAgent mode={mode} audioLevel={audioLevel} className="w-[min(220px,38vmin)]" />
            <VoiceWaveform levels={waveLevels} active={listening || mode === "speaking"} className="mt-5 w-40" />

            {liveLine ? (
              <p className="mt-4 max-w-xl text-center text-sm text-zinc-200">{liveLine}</p>
            ) : null}

            <div className="mt-4 flex items-center justify-center">
              {busy ? (
                <span className="animate-pulse text-xs text-zinc-400">Thinking…</span>
              ) : listening ? (
                <div className="flex items-center gap-2">
                  <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-500" />
                  <span className="text-xs font-medium tracking-wide text-emerald-400">Listening</span>
                </div>
              ) : (
                <span className="text-xs text-zinc-500">Tap to speak</span>
              )}
            </div>

            {showHint ? (
              <p
                className={cn(
                  "mt-3 max-w-md text-center text-xs italic text-zinc-500 transition-opacity duration-300",
                  hintVisible ? "opacity-100" : "opacity-0",
                )}
              >
                {HINTS[hintIndex]}
              </p>
            ) : null}
          </div>
        ) : (
          <div className="mx-auto flex w-full max-w-xl flex-col gap-3 py-6">
            <div className="mb-2 flex justify-center">
              <OrbAgent mode={mode} audioLevel={audioLevel} className="w-[min(120px,22vmin)]" />
            </div>
            {messages.map((m) => (
              <div
                key={m.id}
                className={cn(
                  "rounded-xl border px-3 py-2.5 text-sm leading-relaxed",
                  m.role === "user"
                    ? "ml-8 border-primary/25 bg-primary/10 text-zinc-100"
                    : "mr-4 border-white/[0.08] bg-white/[0.04] text-zinc-300",
                )}
              >
                <p className="mb-1 text-[10px] font-medium uppercase tracking-wider text-zinc-500">
                  {m.role === "user" ? "You" : "Agent"}
                </p>
                <p className="whitespace-pre-wrap">{m.content}</p>
                {m.drafts && m.drafts.length > 0 ? (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {m.drafts.map((d) => (
                      <button
                        key={d.id}
                        type="button"
                        onClick={() => {
                          setActiveDraftId(d.id);
                          setDrafts((prev) => {
                            if (prev.some((p) => p.id === d.id)) return prev;
                            return [d, ...prev];
                          });
                        }}
                        className="rounded-lg border border-white/[0.1] bg-white/[0.05] px-2 py-1 text-[11px] text-zinc-300 hover:text-white"
                      >
                        {d.variantTag || d.title || "Draft"}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            ))}
            {liveLine ? (
              <p className="ml-8 text-sm text-zinc-400">{liveLine}</p>
            ) : null}
            {busy ? (
              <p className="animate-pulse text-xs text-zinc-500">Thinking…</p>
            ) : null}
          </div>
        )}
      </div>

      <div className="shrink-0 border-t border-white/[0.06] px-4 py-4">
        {presetsTouched && (pending.slideCount || pending.packLabel) && (
          <div className="mx-auto mb-2 flex max-w-md flex-wrap gap-1.5">
            {pending.slideCount ? (
              <span className="inline-flex items-center gap-1 rounded-full border border-white/[0.08] bg-white/[0.06] px-2 py-0.5 text-[11px] text-zinc-300">
                {pending.slideCount} slides
                <button
                  type="button"
                  className="text-zinc-500 hover:text-white"
                  aria-label="Clear slide count"
                  onClick={() => {
                    setPending((p) => ({ ...p, slideCount: 5 }));
                    if (!pending.packSlug) setPresetsTouched(false);
                  }}
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            ) : null}
            {pending.packLabel ? (
              <span className="inline-flex items-center gap-1 rounded-full border border-white/[0.08] bg-white/[0.06] px-2 py-0.5 text-[11px] text-zinc-300">
                {pending.packLabel}
                <button
                  type="button"
                  className="text-zinc-500 hover:text-white"
                  aria-label="Clear image pack"
                  onClick={() => {
                    setPending((p) => ({ ...p, packLabel: "", packSlug: "" }));
                    setPresetsTouched(false);
                  }}
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            ) : null}
          </div>
        )}
        <div className="relative mx-auto flex max-w-md items-center gap-2">
          <div className="relative">
            <button
              type="button"
              onClick={() => setOptionsOpen((v) => !v)}
              className={cn(
                "flex h-11 w-11 shrink-0 items-center justify-center rounded-full border text-zinc-300 transition",
                optionsOpen
                  ? "border-white/25 bg-white/[0.08]"
                  : "border-white/15 bg-white/[0.04] hover:border-white/30",
              )}
              aria-label="Generation options"
            >
              <Plus className="h-4 w-4" />
            </button>
            {optionsOpen && (
              <div className="absolute bottom-[calc(100%+10px)] left-0 z-20 w-64 rounded-xl border border-white/[0.08] bg-[#141416]/90 p-3 shadow-2xl backdrop-blur-xl">
                <p className="mb-2 text-[10px] font-medium uppercase tracking-wider text-zinc-500">
                  Slides
                </p>
                <div className="mb-2 flex gap-1.5">
                  {[3, 5, 7, 10].map((n) => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => {
                        setPending((p) => ({ ...p, slideCount: n }));
                        setPresetsTouched(true);
                        setCustomSlideCount("");
                      }}
                      className={cn(
                        "flex-1 rounded-lg px-2 py-1.5 text-[11px]",
                        pending.slideCount === n
                          ? "bg-white/[0.08] font-medium text-white"
                          : "text-zinc-300 hover:bg-white/[0.06] hover:text-white",
                      )}
                    >
                      {n}
                    </button>
                  ))}
                </div>
                <input
                  type="number"
                  min={3}
                  max={10}
                  placeholder="Custom"
                  value={customSlideCount}
                  onChange={(e) => {
                    const v = e.target.value;
                    setCustomSlideCount(v);
                    const n = Number(v);
                    if (n >= 3 && n <= 10) {
                      setPending((p) => ({ ...p, slideCount: n }));
                      setPresetsTouched(true);
                    }
                  }}
                  className="mb-3 h-8 w-full rounded-lg border border-white/[0.08] bg-white/[0.04] px-2 text-[11px] text-white outline-none"
                />
                <p className="mb-2 text-[10px] font-medium uppercase tracking-wider text-zinc-500">
                  Image pack
                </p>
                <div className="max-h-40 space-y-1 overflow-y-auto">
                  {packChoices.map((pack) => (
                    <button
                      key={pack.slug}
                      type="button"
                      onClick={() => {
                        setPending((p) => ({
                          ...p,
                          packLabel: pack.label,
                          packSlug: pack.slug,
                        }));
                        setPresetsTouched(true);
                      }}
                      className={cn(
                        "w-full rounded-lg px-2 py-1.5 text-left text-[11px]",
                        pending.packSlug === pack.slug
                          ? "bg-white/[0.1] text-white"
                          : "text-zinc-400 hover:bg-white/[0.05]",
                      )}
                    >
                      {pack.label}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
          <button
            type="button"
            disabled={busy}
            onClick={toggleMic}
            className={cn(
              "flex h-11 w-11 shrink-0 items-center justify-center rounded-full border transition",
              listening
                ? "border-emerald-500/50 bg-emerald-500/15 text-emerald-400"
                : "border-white/15 bg-white/[0.04] text-zinc-300 hover:border-white/30",
              busy && "opacity-50",
            )}
            aria-label={listening ? "Stop listening" : "Start listening"}
          >
            {busy ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : listening ? (
              <Mic className="h-5 w-5" />
            ) : (
              <MicOff className="h-5 w-5" />
            )}
          </button>
          <form
            className="flex min-w-0 flex-1 gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              const t = textFallback.trim();
              if (!t) return;
              setTextFallback("");
              void runTurn(t);
            }}
          >
            <input
              value={textFallback}
              onChange={(e) => setTextFallback(e.target.value)}
              onFocus={() => setInputFocused(true)}
              onBlur={() => setInputFocused(false)}
              placeholder={speechSupported ? "Write a message…" : "Type a command…"}
              className="h-11 min-w-0 flex-1 rounded-full border border-white/[0.08] bg-white/[0.04] px-4 text-sm text-white placeholder:text-zinc-500 outline-none focus:border-primary/40"
            />
            <Button type="submit" disabled={busy || !textFallback.trim()} size="icon" className="h-11 w-11 rounded-full">
              <Send className="h-4 w-4" />
            </Button>
          </form>
        </div>
      </div>

      {historyOpen ? (
        <div className="absolute inset-y-0 left-0 z-30 flex w-full max-w-sm flex-col border-r border-white/[0.08] bg-[#0c0c0e]/95 shadow-2xl backdrop-blur-xl">
          <div className="flex items-center justify-between border-b border-white/[0.08] px-4 py-3">
            <div>
              <p className="text-sm font-medium text-zinc-100">Previous chats</p>
              <p className="text-[11px] text-zinc-500">Saved voice sessions & generations</p>
            </div>
            <button
              type="button"
              className="rounded-lg p-1.5 text-zinc-500 hover:text-white"
              onClick={() => setHistoryOpen(false)}
              aria-label="Close history"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="border-b border-white/[0.06] px-3 py-2">
            <button
              type="button"
              onClick={startNewChat}
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-white/[0.1] bg-white/[0.04] px-3 py-2 text-sm text-zinc-200 hover:bg-white/[0.07]"
            >
              <Plus className="h-4 w-4" />
              New chat
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
            {historyLoading ? (
              <div className="flex items-center justify-center gap-2 py-8 text-sm text-zinc-500">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading…
              </div>
            ) : history.length === 0 ? (
              <p className="px-3 py-8 text-center text-sm text-zinc-500">
                No saved voice chats yet. Send a message to start one.
              </p>
            ) : (
              <ul className="space-y-1">
                {history.map((c) => (
                  <li key={c.id}>
                    <button
                      type="button"
                      onClick={() => void loadConversation(c.id)}
                      className={cn(
                        "group flex w-full items-start gap-2 rounded-xl px-3 py-2.5 text-left transition",
                        conversationId === c.id
                          ? "bg-white/[0.08]"
                          : "hover:bg-white/[0.05]",
                      )}
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm text-zinc-100">{c.title}</p>
                        <p className="mt-0.5 text-[11px] text-zinc-500">
                          {formatRelative(c.updatedAt)}
                          {c._count?.messages
                            ? ` · ${c._count.messages} messages`
                            : ""}
                        </p>
                      </div>
                      <button
                        type="button"
                        className="rounded-md p-1 text-zinc-600 opacity-0 hover:text-red-400 group-hover:opacity-100"
                        aria-label="Delete chat"
                        onClick={(e) => void deleteConversation(c.id, e)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );

  return (
    <div className="fixed inset-0 z-[100] flex flex-col bg-bg text-white">
      <div className="flex shrink-0 items-center justify-between border-b border-white/[0.06] px-5 py-3">
        <div className="flex items-center gap-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/GrowthOS-Logo.png" alt="" className="h-6 w-6 rounded-md object-cover" />
          <span className="text-sm font-medium text-zinc-200">Growth OS</span>
          <span className="text-sm text-zinc-500">Voice Studio</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={startNewChat}
            className="rounded-lg px-2.5 py-1.5 text-xs text-zinc-400 transition-colors hover:bg-white/[0.06] hover:text-white"
          >
            New
          </button>
          <button
            type="button"
            onClick={() => {
              setHistoryOpen((v) => !v);
              if (!historyOpen) void loadHistory();
            }}
            aria-label="Previous chats"
            className={cn(
              "rounded-lg p-1.5 transition-colors",
              historyOpen
                ? "bg-white/[0.08] text-white"
                : "text-zinc-500 hover:text-white",
            )}
          >
            <History className="h-5 w-5" />
          </button>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-lg p-1.5 text-zinc-500 transition-colors hover:text-white"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      </div>

      <div ref={shellRef} className="flex min-h-0 flex-1 overflow-hidden">
        <div
          className="flex h-full min-w-0 flex-col transition-[width] duration-300 ease-out"
          style={{ width: showPreview ? `${splitPct}%` : "100%" }}
        >
          {chatPane}
        </div>

        <div
          className={cn(
            "flex min-h-0 min-w-0 overflow-hidden transition-all duration-300 ease-out",
            showPreview ? "opacity-100" : "w-0 opacity-0",
          )}
          style={{ width: showPreview ? `${100 - splitPct}%` : 0 }}
        >
          {showPreview && (
            <>
              <button
                type="button"
                aria-label="Resize preview"
                className="w-1 shrink-0 cursor-col-resize bg-white/[0.06] hover:bg-primary/60"
                onMouseDown={(e) => {
                  e.preventDefault();
                  draggingSplit.current = true;
                  document.body.style.cursor = "col-resize";
                  document.body.style.userSelect = "none";
                }}
              />
              <div ref={draftsRef} className="flex min-h-0 min-w-0 flex-1 flex-col bg-bg">
                <div className="flex shrink-0 items-center justify-between border-b border-white/[0.08] px-4 py-2.5">
                  <p className="truncate text-sm font-medium text-zinc-200">
                    {activeDraft?.title || activeDraft?.hook || "Generated drafts"}
                  </p>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      className="rounded-md p-1.5 text-zinc-500 hover:text-white"
                      onClick={() => openInGenerator()}
                      aria-label="Open in Generator"
                    >
                      <Expand className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      className="rounded-md p-1.5 text-zinc-500 hover:text-white"
                      onClick={() => {
                        setDrafts([]);
                        setActiveDraftId(null);
                      }}
                      aria-label="Close preview"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                </div>
                {drafts.length > 1 ? (
                  <div className="flex shrink-0 gap-1.5 overflow-x-auto border-b border-white/[0.06] px-4 py-2">
                    {drafts.map((d, i) => (
                      <button
                        key={d.id}
                        type="button"
                        onClick={() => setActiveDraftId(d.id)}
                        className={cn(
                          "shrink-0 rounded-lg px-2 py-1 text-[11px]",
                          (activeDraft?.id || drafts[0]?.id) === d.id
                            ? "bg-white/[0.1] text-white"
                            : "text-zinc-400 hover:bg-white/[0.05]",
                        )}
                      >
                        {d.variantTag || `Variant ${i + 1}`}
                      </button>
                    ))}
                  </div>
                ) : null}
                {activeDraft ? (
                  <LivePreview
                    key={activeDraft.id}
                    className="min-h-0 flex-1"
                    slides={
                      activeDraft.visualSlides?.length
                        ? activeDraft.visualSlides
                        : [
                            {
                              index: 1,
                              text: activeDraft.hook,
                              backgroundUrl: activeDraft.coverUrl,
                            },
                          ]
                    }
                    captionBoxId={activeDraft.captionBoxId || "highlight"}
                    textStyleId={activeDraft.textStyleId || "tiktok-sans"}
                    onOpenEditor={() => openInGenerator(activeDraft.id)}
                  />
                ) : null}
              </div>
          </>
          )}
        </div>
      </div>
    </div>
  );
}
