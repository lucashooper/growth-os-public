"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export const DEMO_MODE_STORAGE_KEY = "growthos.demo-mode";

export function readStoredDemoMode() {
  try {
    return localStorage.getItem(DEMO_MODE_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

export const DEMO_METRICS = {
  views: 284_500,
  posts: 48,
  avgViews: 12_800,
  engagementRate: 6.4,
  hashtagAvgMin: 40_000,
  hashtagAvgMax: 80_000,
  viewsToday: 18_400,
  likesToday: 1_260,
  followersToday: 42,
  postsToday: 2,
} as const;

type ViewPoint = { date: string; views: number };

function fabricateChart(targetTotal: number, days = 14): ViewPoint[] {
  const weights = Array.from({ length: days }, (_, i) => {
    const rise = 0.55 + (i / Math.max(days - 1, 1)) * 0.7;
    const wave = 0.18 * Math.sin((i / days) * Math.PI * 2);
    return Math.max(0.2, rise + wave);
  });
  const sum = weights.reduce((a, b) => a + b, 0);
  const start = new Date();
  start.setUTCDate(start.getUTCDate() - days + 1);
  return weights.map((w, i) => {
    const d = new Date(start);
    d.setUTCDate(start.getUTCDate() + i);
    return {
      date: d.toISOString().slice(0, 10),
      views: Math.round(targetTotal * (w / sum)),
    };
  });
}

export function scaleViewSeries<T extends { views: number; date?: string }>(
  rows: T[] | undefined,
  targetTotal: number,
): T[] {
  if (!rows?.length) {
    return fabricateChart(targetTotal) as T[];
  }
  const sum = rows.reduce((s, r) => s + (Number(r.views) || 0), 0);
  const factor = sum > 0 ? targetTotal / sum : 1;
  return rows.map((r) => ({
    ...r,
    views: Math.round((Number(r.views) || 0) * factor),
  }));
}

export function demoHashtags<T extends { avgViews: number }>(tags: T[] | undefined): T[] {
  const list = tags?.length
    ? tags
    : ([
        { tag: "#mentalclarity", avgViews: 0, count: 14 },
        { tag: "#burnoutrecovery", avgViews: 0, count: 11 },
        { tag: "#stoicism", avgViews: 0, count: 9 },
        { tag: "#selfimprovement", avgViews: 0, count: 8 },
        { tag: "#journaling", avgViews: 0, count: 7 },
      ] as unknown as T[]);
  const n = Math.max(list.length - 1, 1);
  const min = DEMO_METRICS.hashtagAvgMin;
  const max = DEMO_METRICS.hashtagAvgMax;
  return list.map((h, i) => ({
    ...h,
    avgViews: Math.round(max - (i / n) * (max - min)),
  }));
}

export function applyDemoInsights<
  T extends {
    totals?: {
      views: number;
      posts: number;
      avgViews: number;
      engagementRate: number;
    };
    hashtags?: { tag: string; avgViews: number; count: number }[];
    viewsOverTime?: ViewPoint[];
  },
>(report: T | null | undefined, enabled: boolean): T | null {
  if (!enabled || !report) return report ?? null;
  return {
    ...report,
    totals: {
      ...report.totals,
      views: DEMO_METRICS.views,
      posts: DEMO_METRICS.posts,
      avgViews: DEMO_METRICS.avgViews,
      engagementRate: DEMO_METRICS.engagementRate,
    },
    hashtags: demoHashtags(report.hashtags),
    viewsOverTime: scaleViewSeries(report.viewsOverTime, DEMO_METRICS.views),
  };
}

export function applyDemoDashboard<
  T extends {
    totals?: { views: number; posts: number };
    todayOverview?: {
      viewsToday: number;
      likesToday: number;
      followersToday: number;
      postsPublishedToday: number;
      avgViewsPerPostToday: number;
    };
    metrics?: { date: string; views: number }[];
  },
>(data: T | null | undefined, enabled: boolean): T | null {
  if (!enabled || !data) return data ?? null;
  return {
    ...data,
    totals: data.totals
      ? {
          ...data.totals,
          views: DEMO_METRICS.views,
          posts: DEMO_METRICS.posts,
        }
      : data.totals,
    todayOverview: data.todayOverview
      ? {
          ...data.todayOverview,
          viewsToday: DEMO_METRICS.viewsToday,
          likesToday: DEMO_METRICS.likesToday,
          followersToday: DEMO_METRICS.followersToday,
          postsPublishedToday: DEMO_METRICS.postsToday,
          avgViewsPerPostToday: DEMO_METRICS.avgViews,
        }
      : data.todayOverview,
    metrics: scaleViewSeries(data.metrics, DEMO_METRICS.views),
  };
}

type DemoCtx = {
  enabled: boolean;
  setEnabled: (on: boolean) => void;
};

const Ctx = createContext<DemoCtx | null>(null);

export function DemoModeProvider({ children }: { children: ReactNode }) {
  const [enabled, setEnabledState] = useState(false);

  useEffect(() => {
    try {
      setEnabledState(readStoredDemoMode());
    } catch {
      /* ignore */
    }
  }, []);

  const setEnabled = useCallback((on: boolean) => {
    setEnabledState(on);
    try {
      localStorage.setItem(DEMO_MODE_STORAGE_KEY, on ? "1" : "0");
    } catch {
      /* ignore */
    }
  }, []);

  const value = useMemo(() => ({ enabled, setEnabled }), [enabled, setEnabled]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useDemoMode() {
  const ctx = useContext(Ctx);
  if (!ctx) return { enabled: false, setEnabled: (_on: boolean) => {} };
  return ctx;
}
