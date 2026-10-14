"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, useRef } from "react";
import {
  Blocks,
  Calendar,
  CalendarDays,
  ChevronDown,
  FileCode2,
  FileSearch,
  FolderKanban,
  Link2,
  LogOut,
  Megaphone,
  MessageSquare,
  Settings,
  Sparkles,
  Terminal,
  Wand2,
  BarChart3,
  CreditCard,
  Loader2,
} from "lucide-react";
import { ProjectSwitcher } from "@/components/project-switcher";
import { cn } from "@/lib/utils";
import { isSupabaseConfigured, createClient } from "@/lib/supabase/client";
import { useProject } from "@/lib/project-context";
import { apiFetch } from "@/lib/api-client";
import { isPaidTier } from "@/lib/billing-plans";
import { openBillingPortal } from "@/lib/billing-client";

const pillars = [
  { href: "/agent", label: "Studio", icon: Sparkles },
  { href: "/generate", label: "Generator & Assets", icon: Wand2 },
  { href: "/calendar", label: "Calendar", icon: Calendar },
  { href: "/outreach", label: "Creator Outreach", icon: Megaphone },
  { href: "/queue", label: "Queue & Publishing", icon: CalendarDays },
  { href: "/insights", label: "Insights", icon: BarChart3 },
  { href: "/integrations", label: "Integrations", icon: Blocks },
];

const secondary = [
  { href: "/chat", label: "AI Chat", icon: MessageSquare },
  { href: "/library", label: "Content Library", icon: FolderKanban },
  { href: "/accounts", label: "Connected Accounts", icon: Link2 },
  { href: "/projects", label: "Projects", icon: FolderKanban },
];

const system = [
  { href: "/billing", label: "Billing", icon: CreditCard },
  { href: "/diagnostics", label: "Diagnostics", icon: FileSearch },
  { href: "/architecture", label: "Architecture", icon: FileCode2 },
  { href: "/developer", label: "Developer Console", icon: Terminal },
  { href: "/settings", label: "Settings", icon: Settings },
];

const PREFETCH_ROUTES = [
  "/agent",
  "/generate",
  "/calendar",
  "/outreach",
  "/queue",
  "/insights",
  "/integrations",
  "/library",
  "/accounts",
  "/chat",
  "/billing",
  "/hooks",
  "/creatives",
  "/publishes",
];

function NavGroup({
  label,
  items,
  pathname,
  projectId,
  collapsible,
  isOpen,
  onToggle,
}: {
  label?: string;
  items: typeof pillars;
  pathname: string;
  projectId?: string | null;
  collapsible?: boolean;
  isOpen?: boolean;
  onToggle?: () => void;
}) {
  const prefetchTimers = useRef<Record<string, NodeJS.Timeout>>({});

  const getApiEndpoint = (href: string) => {
    if (!projectId) return null;
    const endpointMap: Record<string, string> = {
      "/insights": `/api/insights/${projectId}`,
      "/library": `/api/library?projectId=${projectId}`,
      "/agent": `/api/projects/${projectId}/dashboard`,
      "/queue": `/api/projects/${projectId}/dashboard`,
      "/calendar": `/api/calendar?projectId=${projectId}`,
      "/integrations": `/api/integrations?projectId=${projectId}`,
      "/accounts": `/api/accounts?projectId=${projectId}`,
      "/generate": `/api/posts?projectId=${projectId}&status=draft`,
    };
    return endpointMap[href] || null;
  };

  const handleMouseEnter = (href: string) => {
    const apiUrl = getApiEndpoint(href);
    if (!apiUrl) return;
    const timer = setTimeout(() => {
      void apiFetch(apiUrl).catch(() => {});
    }, 200);
    prefetchTimers.current[href] = timer;
  };

  const handleMouseLeave = (href: string) => {
    const timer = prefetchTimers.current[href];
    if (timer) {
      clearTimeout(timer);
      delete prefetchTimers.current[href];
    }
  };

  return (
    <div className="space-y-0.5">
      {label && (
        <button
          type="button"
          onClick={collapsible ? onToggle : undefined}
          className={cn(
            "mb-1.5 mt-5 flex w-full items-center justify-between px-3 text-[11px] font-semibold uppercase tracking-wider text-zinc-600",
            collapsible && "cursor-pointer hover:text-zinc-400",
          )}
        >
          <span>{label}</span>
          {collapsible && (
            <ChevronDown
              className={cn(
                "h-3 w-3 transition-transform",
                isOpen && "rotate-180",
              )}
            />
          )}
        </button>
      )}
      {(!collapsible || isOpen) &&
        items.map((item) => {
          const active =
            pathname === item.href ||
            pathname.startsWith(`${item.href}/`) ||
            (item.href === "/insights" &&
              ["/dashboard", "/analytics", "/experiments", "/competitors"].some(
                (p) => pathname === p || pathname.startsWith(`${p}/`),
              )) ||
            (item.href === "/generate" &&
              ["/hooks", "/creatives", "/library"].includes(pathname)) ||
            (item.href === "/queue" && ["/publishes"].includes(pathname));
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              prefetch
              className={cn(
                "group flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                active
                  ? "border border-white/[0.06] bg-white/[0.08] text-white shadow-sm"
                  : "text-zinc-400 hover:bg-white/[0.04] hover:text-zinc-200",
              )}
              onMouseEnter={() => handleMouseEnter(item.href)}
              onMouseLeave={() => handleMouseLeave(item.href)}
            >
              <Icon
                className={cn(
                  "h-4 w-4 shrink-0 stroke-[1.5]",
                  active
                    ? "text-white stroke-[1.75]"
                    : "text-zinc-500 group-hover:text-zinc-300",
                )}
              />
              {item.label}
            </Link>
          );
        })}
    </div>
  );
}

export function Sidebar({ className }: { className?: string }) {
  const pathname = usePathname();
  const router = useRouter();
  const { projectId } = useProject();
  const [email, setEmail] = useState("User");
  const [name, setName] = useState("Operator");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [moreOpen, setMoreOpen] = useState(true);
  const [systemOpen, setSystemOpen] = useState(false);
  const [paid, setPaid] = useState(false);
  const [billingReady, setBillingReady] = useState(false);
  const [portalBusy, setPortalBusy] = useState(false);

  useEffect(() => {
    for (const route of PREFETCH_ROUTES) {
      try {
        router.prefetch(route);
      } catch {
        /* ignore */
      }
    }
  }, [router]);

  useEffect(() => {
    void (async () => {
      const res = await fetch("/api/me");
      if (!res.ok) return;
      const data = await res.json();
      const u = data.user || data.data?.user;
      if (u?.email) setEmail(u.email);
      if (u?.name) setName(u.name);
      if (u?.avatarUrl) setAvatarUrl(u.avatarUrl);
    })();
    void (async () => {
      const res = await apiFetch<{
        billing: { tier: string; status: string };
      }>("/api/billing", { skipCache: true });
      if (!res.ok) return;
      setPaid(
        isPaidTier(res.data.billing.tier) &&
          res.data.billing.status !== "canceled" &&
          res.data.billing.status !== "inactive",
      );
      setBillingReady(true);
    })();
  }, []);

  async function signOut() {
    if (isSupabaseConfigured()) {
      const supabase = createClient();
      await supabase.auth.signOut();
    }
    router.push("/login");
    router.refresh();
  }

  const initial = (name || email || "U").slice(0, 1).toUpperCase();

  return (
    <aside
      className={cn(
        "flex h-screen w-[248px] shrink-0 flex-col border-r border-white/[0.06] bg-bg",
        className,
      )}
    >
      <div className="flex items-center gap-2.5 px-4 pb-3 pt-5">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/GrowthOS-Logo.png"
          alt=""
          className="h-8 w-8 rounded-lg object-cover"
        />
        <p className="text-sm font-semibold tracking-tight text-ink">
          Growth OS
        </p>
      </div>

      <div className="px-3 pb-3">
        <ProjectSwitcher />
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto px-2 pb-4">
        <NavGroup items={pillars} pathname={pathname} projectId={projectId} />
        <NavGroup
          label="More"
          items={secondary}
          pathname={pathname}
          projectId={projectId}
          collapsible
          isOpen={moreOpen}
          onToggle={() => setMoreOpen(!moreOpen)}
        />
        <NavGroup
          label="System"
          items={system}
          pathname={pathname}
          projectId={projectId}
          collapsible
          isOpen={systemOpen}
          onToggle={() => setSystemOpen(!systemOpen)}
        />
      </nav>

      <div className="border-t border-white/[0.06] p-3">
        {billingReady && (
          paid ? (
            <button
              type="button"
              disabled={portalBusy}
              onClick={() => {
                setPortalBusy(true);
                void openBillingPortal().catch(() => setPortalBusy(false));
              }}
              className="mb-2 flex w-full items-center justify-center gap-2 rounded-full border border-white/[0.08] bg-white/[0.04] px-3 py-1.5 text-[11px] font-medium text-zinc-300 hover:bg-white/[0.07] hover:text-white"
            >
              {portalBusy ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <CreditCard className="h-3 w-3" strokeWidth={1.75} />
              )}
              Manage subscription
            </button>
          ) : (
            <Link
              href="/billing"
              className="mb-2 flex w-full items-center justify-center gap-2 rounded-full border border-white/[0.08] bg-white/[0.04] px-3 py-1.5 text-[11px] font-medium text-zinc-300 hover:bg-white/[0.07] hover:text-white"
            >
              Upgrade
            </Link>
          )
        )}
        <div className="flex items-center gap-2.5 rounded-xl px-2 py-2">
          <div className="flex h-8 w-8 items-center justify-center overflow-hidden rounded-full bg-white/[0.06] text-xs font-medium text-ink">
            {avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={avatarUrl}
                alt=""
                className="h-full w-full object-cover"
              />
            ) : (
              initial
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm text-ink">{name}</p>
            <p className="truncate text-[11px] text-muted">{email}</p>
          </div>
          <button
            type="button"
            onClick={() => signOut()}
            className="rounded-lg p-1.5 text-muted hover:bg-white/[0.06] hover:text-ink"
            title="Sign out"
          >
            <LogOut className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </aside>
  );
}
