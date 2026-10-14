"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { PageHeader, PageBody } from "@/components/page-header";
import { FadeIn } from "@/components/fade-in";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAccentTheme, type AccentTheme } from "@/components/theme-provider";
import { useProject } from "@/lib/project-context";
import type { ProviderStatus } from "@/lib/ai/types";
import { cn } from "@/lib/utils";
import { LoadingBlock } from "@/components/empty-state";
import { useDemoMode } from "@/lib/demo-recording";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";

const ACCENTS: { id: AccentTheme; label: string; swatch: string }[] = [
  { id: "emerald", label: "Emerald", swatch: "oklch(0.72 0.12 160)" },
  { id: "violet", label: "Violet", swatch: "oklch(0.72 0.16 305)" },
];

export default function SettingsPage() {
  const router = useRouter();
  const { project, loading: projectLoading } = useProject();
  const { accent, setAccent } = useAccentTheme();
  const { enabled: demoMode, setEnabled: setDemoMode } = useDemoMode();
  const [providers, setProviders] = useState<ProviderStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [profileName, setProfileName] = useState("");
  const [profileEmail, setProfileEmail] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [profileBusy, setProfileBusy] = useState(false);
  const [profileMsg, setProfileMsg] = useState<string | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch("/api/ai/status")
      .then((r) => r.json())
      .then((d) => setProviders(d.providers ?? []))
      .finally(() => setLoading(false));
    void (async () => {
      const res = await fetch("/api/me");
      if (!res.ok) return;
      const data = await res.json();
      const u = data.user || data.data?.user;
      if (u?.name) setProfileName(u.name);
      if (u?.email) setProfileEmail(u.email);
      if (u?.avatarUrl) setAvatarUrl(u.avatarUrl);
    })();
  }, []);

  async function saveProfile() {
    setProfileBusy(true);
    setProfileMsg(null);
    const res = await fetch("/api/me", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: profileName, avatarUrl }),
    });
    const data = await res.json().catch(() => ({}));
    setProfileBusy(false);
    setProfileMsg(res.ok ? "Profile saved" : data.error || "Save failed");
  }

  async function onAvatar(file: File) {
    setProfileBusy(true);
    const form = new FormData();
    form.append("file", file);
    const res = await fetch("/api/upload", { method: "POST", body: form });
    const data = await res.json();
    if (!res.ok) {
      setProfileBusy(false);
      setProfileMsg(data.error || "Upload failed");
      return;
    }
    setAvatarUrl(data.url);
    const save = await fetch("/api/me", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ avatarUrl: data.url, name: profileName }),
    });
    setProfileBusy(false);
    setProfileMsg(save.ok ? "Photo updated" : "Uploaded but profile save failed");
  }

  async function deleteAccount() {
    const ok = window.confirm(
      "Delete your account permanently? This cancels any Stripe subscription, removes your workspace data, and cannot be undone.",
    );
    if (!ok) return;
    const confirmText = window.prompt('Type DELETE to confirm account deletion:');
    if (confirmText !== "DELETE") {
      setDeleteError("Deletion cancelled — type DELETE exactly to confirm.");
      return;
    }
    setDeleteBusy(true);
    setDeleteError(null);
    try {
      const res = await fetch("/api/me", { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setDeleteError(data.error || "Could not delete account");
        setDeleteBusy(false);
        return;
      }
      if (isSupabaseConfigured()) {
        try {
          const supabase = createClient();
          await supabase.auth.signOut();
        } catch {
          /* ignore */
        }
      }
      router.replace("/login?deleted=1");
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "Delete failed");
      setDeleteBusy(false);
    }
  }

  // Settings must stay reachable without a project (e.g. unpaid / delete account).
  if (projectLoading && !project) {
    return (
      <div className="flex min-h-full flex-col">
        <PageHeader title="Settings" description="Profile and account." />
        <PageBody>
          <LoadingBlock />
        </PageBody>
      </div>
    );
  }

  return (
    <div className="flex min-h-full flex-col">
      <PageHeader
        title="Settings"
        description="Profile, theme, demo mode, and AI providers. Keys stay on the server."
      />
      <PageBody>
      <div className="grid max-w-3xl gap-4">
        <FadeIn>
          <Card>
            <CardHeader>
              <CardTitle>Profile</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  className="relative h-14 w-14 overflow-hidden rounded-full border border-border bg-surface-2"
                >
                  {avatarUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={avatarUrl} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <span className="flex h-full w-full items-center justify-center text-sm text-muted">
                      {(profileName || profileEmail || "U").slice(0, 1).toUpperCase()}
                    </span>
                  )}
                </button>
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-ink">{profileEmail || "Signed in"}</p>
                  <p className="text-[11px] text-muted">Click the circle to change photo</p>
                </div>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void onAvatar(f);
                  }}
                />
              </div>
              <div>
                <label className="text-xs text-muted">Display name</label>
                <input
                  value={profileName}
                  onChange={(e) => setProfileName(e.target.value)}
                  className="mt-1 h-10 w-full rounded-xl border border-border bg-bg px-3 text-sm"
                />
              </div>
              {profileMsg && <p className="text-xs text-muted">{profileMsg}</p>}
              <Button size="sm" disabled={profileBusy} onClick={() => void saveProfile()}>
                {profileBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Save profile"}
              </Button>
            </CardContent>
          </Card>
        </FadeIn>
        <FadeIn delay={0.02}>
          <Card>
            <CardHeader>
              <CardTitle>Demo mode</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-xs text-muted">
                Overlays recording-friendly Insights and dashboard numbers. Saved on this device.
              </p>
              <div className="flex flex-wrap gap-2">
                {(
                  [
                    [false, "Off"],
                    [true, "On"],
                  ] as const
                ).map(([on, label]) => (
                  <button
                    key={label}
                    type="button"
                    onClick={() => setDemoMode(on)}
                    className={cn(
                      "rounded-xl border px-4 py-2.5 text-sm",
                      demoMode === on
                        ? "border-primary/40 bg-primary/10 text-ink"
                        : "border-border text-muted hover:text-ink",
                    )}
                  >
                    {label}
                    {demoMode === on && (
                      <Badge tone="primary" className="ml-2">
                        Active
                      </Badge>
                    )}
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>
        </FadeIn>
        <FadeIn delay={0.03}>
          <Card>
            <CardHeader>
              <CardTitle>Accent color</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-xs text-muted">
                Changes buttons, active tabs, and highlights across Growth OS. Saved on this
                device.
              </p>
              <div className="flex flex-wrap gap-2">
                {ACCENTS.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setAccent(t.id)}
                    className={cn(
                      "flex items-center gap-2 rounded-xl border px-3 py-2.5 text-sm",
                      accent === t.id
                        ? "border-primary/40 bg-primary/10 text-ink"
                        : "border-border text-muted hover:text-ink",
                    )}
                  >
                    <span
                      className="h-4 w-4 rounded-full ring-1 ring-white/20"
                      style={{ background: t.swatch }}
                    />
                    {t.label}
                    {accent === t.id && <Badge tone="primary">Active</Badge>}
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>
        </FadeIn>
        <FadeIn delay={0.03}>
          <Card>
            <CardHeader>
              <CardTitle>AI Provider</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-xs text-muted">
                Change <code className="text-ink">AI_PROVIDER</code> in{" "}
                <code className="text-ink">.env.local</code> and restart the server.
              </p>
              {loading && (
                <div className="flex items-center gap-2 text-sm text-muted">
                  <Loader2 className="h-4 w-4 animate-spin" /> Checking…
                </div>
              )}
              {providers.map((p) => (
                <div
                  key={p.id}
                  className={cn(
                    "flex items-center justify-between rounded-xl border px-4 py-3",
                    p.isDefault
                      ? "border-primary/35 bg-primary/5"
                      : "border-border",
                  )}
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-ink">{p.label}</p>
                      {p.isDefault && <Badge tone="primary">Default</Badge>}
                    </div>
                    <p className="font-mono text-[11px] text-muted">{p.model}</p>
                  </div>
                  <Badge tone={p.configured ? "success" : "default"}>
                    {p.configured ? "Configured" : "Missing key"}
                  </Badge>
                </div>
              ))}
            </CardContent>
          </Card>
        </FadeIn>
        <FadeIn delay={0.05}>
          <Card>
            <CardHeader>
              <CardTitle>Active project</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-muted">
              {project ? (
                <>
                  <p>
                    Name: <span className="text-ink">{project.name}</span>
                  </p>
                  <p>
                    Slug: <span className="font-mono text-ink">{project.slug}</span>
                  </p>
                </>
              ) : (
                <p>No project loaded yet.</p>
              )}
              <p>
                Auth: Supabase · App data: Prisma (
                {process.env.NEXT_PUBLIC_SUPABASE_URL ? "cloud-ready" : "local"}
                )
              </p>
            </CardContent>
          </Card>
        </FadeIn>
        <FadeIn delay={0.08}>
          <Card className="border-danger/30">
            <CardHeader>
              <CardTitle className="text-danger">Delete account</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-xs text-muted">
                Permanently delete your Growth OS account, cancel any active Stripe
                subscription, and remove workspace data. Available even without a
                paid plan.
              </p>
              {deleteError && (
                <p className="text-xs text-danger">{deleteError}</p>
              )}
              <Button
                variant="outline"
                className="border-danger/40 text-danger hover:bg-danger/10"
                disabled={deleteBusy}
                onClick={() => void deleteAccount()}
              >
                {deleteBusy ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  "Delete my account"
                )}
              </Button>
            </CardContent>
          </Card>
        </FadeIn>
        <FadeIn delay={0.1}>
          <Card>
            <CardHeader>
              <CardTitle>Credits &amp; licenses</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-muted">
              <p>
                <span className="text-ink">TikTok Sans</span> — Copyright 2024 TikTok Inc.
                Licensed under the{" "}
                <a
                  className="text-primary hover:underline"
                  href="/fonts/tiktok-sans/OFL.txt"
                  target="_blank"
                  rel="noreferrer"
                >
                  SIL Open Font License 1.1
                </a>
                . Bundled at{" "}
                <code className="text-ink">/fonts/tiktok-sans/</code>.
              </p>
              <p className="text-xs">
                Source:{" "}
                <a
                  className="text-primary hover:underline"
                  href="https://github.com/tiktok/TikTokSans"
                  target="_blank"
                  rel="noreferrer"
                >
                  github.com/tiktok/TikTokSans
                </a>
              </p>
            </CardContent>
          </Card>
        </FadeIn>
      </div>
      </PageBody>
    </div>
  );
}
