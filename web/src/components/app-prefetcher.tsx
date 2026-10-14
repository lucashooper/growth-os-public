"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useProject } from "@/lib/project-context";
import { apiFetch } from "@/lib/api-client";
import { warmWorkspaceCache } from "@/lib/workspace-cache";

const CRITICAL_ROUTES = [
  "/agent",
  "/generate",
  "/queue",
  "/insights",
  "/library",
];

const IDLE_ROUTES = [
  "/accounts",
  "/chat",
  "/hooks",
  "/creatives",
  "/publishes",
  "/projects",
  "/settings",
  "/competitors",
];

/**
 * Global background data pre-warmer. Critical workspace data first;
 * everything else waits for idle so publish/upload isn't starved.
 */
export function AppPrefetcher() {
  const router = useRouter();
  const { projectId, loading } = useProject();

  useEffect(() => {
    if (loading) return;
    for (const href of CRITICAL_ROUTES) {
      try {
        router.prefetch(href);
      } catch {
        /* ignore */
      }
    }
    const prefetchIdle = () => {
      for (const href of IDLE_ROUTES) {
        try {
          router.prefetch(href);
        } catch {
          /* ignore */
        }
      }
    };
    const timeoutId = window.setTimeout(prefetchIdle, 2000);
    return () => window.clearTimeout(timeoutId);
  }, [loading, router]);

  useEffect(() => {
    if (!projectId) return;
    const controllers: AbortController[] = [];
    const warm = (url: string) => {
      const c = new AbortController();
      controllers.push(c);
      void apiFetch(url, {
        signal: c.signal as AbortSignal,
      }).catch(() => {});
    };

    // warmWorkspaceCache already hits drafts, packs, format-refs, dashboard
    const critical = window.setTimeout(() => {
      void warmWorkspaceCache(projectId);
      warm(`/api/accounts?projectId=${projectId}`);
    }, 40);

    const secondary = window.setTimeout(() => {
      warm(`/api/flows?projectId=${projectId}`);
      warm(`/api/posts?projectId=${projectId}&status=published`);
      warm(`/api/insights/${projectId}`);
      warm(`/api/library?projectId=${projectId}`);
    }, 1500);

    const idle = window.setTimeout(() => {
      warm(`/api/ai/briefing?projectId=${projectId}`);
      warm(`/api/creatives?projectId=${projectId}`);
      warm(`/api/hooks?projectId=${projectId}`);
      warm(`/api/competitors?projectId=${projectId}`);
      warm(`/api/experiments?projectId=${projectId}`);
      warm(`/api/conversations?projectId=${projectId}`);
      warm(`/api/publish-attempts?projectId=${projectId}&limit=40`);
      warm(`/api/sync-logs?projectId=${projectId}&limit=30`);
    }, 4000);

    return () => {
      window.clearTimeout(critical);
      window.clearTimeout(secondary);
      window.clearTimeout(idle);
      for (const c of controllers) c.abort();
    };
  }, [projectId]);

  return null;
}

/** @deprecated use AppPrefetcher */
export { AppPrefetcher as RouteWarmer };
