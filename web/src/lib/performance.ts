/**
 * Performance monitoring and optimization utilities
 */

export type PerformanceMetric = {
  name: string;
  duration: number;
  startTime: number;
  endTime: number;
};

const metrics: PerformanceMetric[] = [];

export function startMeasure(name: string): () => void {
  const startTime = performance.now();
  
  return () => {
    const endTime = performance.now();
    const duration = endTime - startTime;
    
    const metric: PerformanceMetric = {
      name,
      duration,
      startTime,
      endTime,
    };
    
    metrics.push(metric);
    
    if (typeof window !== "undefined" && window.localStorage.getItem("growthOS:perf") === "true") {
      console.log(`[perf] ${name}: ${duration.toFixed(2)}ms`);
    }
    
    // Send to analytics in production
    if (typeof window !== "undefined" && process.env.NODE_ENV === "production") {
      // Could send to PostHog, Google Analytics, etc.
    }
  };
}

export function getMetrics(): PerformanceMetric[] {
  return [...metrics];
}

export function clearMetrics(): void {
  metrics.length = 0;
}

export function getMetricsSummary(): Record<string, { count: number; avg: number; min: number; max: number }> {
  const summary: Record<string, { count: number; total: number; min: number; max: number }> = {};
  
  for (const metric of metrics) {
    if (!summary[metric.name]) {
      summary[metric.name] = { count: 0, total: 0, min: Infinity, max: -Infinity };
    }
    
    summary[metric.name].count++;
    summary[metric.name].total += metric.duration;
    summary[metric.name].min = Math.min(summary[metric.name].min, metric.duration);
    summary[metric.name].max = Math.max(summary[metric.name].max, metric.duration);
  }
  
  return Object.fromEntries(
    Object.entries(summary).map(([name, stats]) => [
      name,
      {
        count: stats.count,
        avg: stats.total / stats.count,
        min: stats.min,
        max: stats.max,
      },
    ]),
  );
}

/**
 * Enable performance logging in browser console
 */
export function enablePerfLogging(): void {
  if (typeof window !== "undefined") {
    window.localStorage.setItem("growthOS:perf", "true");
    console.log("[perf] Performance logging enabled");
  }
}

/**
 * Disable performance logging
 */
export function disablePerfLogging(): void {
  if (typeof window !== "undefined") {
    window.localStorage.removeItem("growthOS:perf");
    console.log("[perf] Performance logging disabled");
  }
}

/**
 * Simple in-memory cache with TTL
 */
const cache = new Map<string, { value: any; expires: number }>();

export function getCached<T>(key: string): T | null {
  const cached = cache.get(key);
  if (!cached) return null;
  
  if (Date.now() > cached.expires) {
    cache.delete(key);
    return null;
  }
  
  return cached.value as T;
}

export function setCached<T>(key: string, value: T, ttlMs: number = 60000): void {
  cache.set(key, {
    value,
    expires: Date.now() + ttlMs,
  });
}

export function clearCache(prefix?: string): void {
  if (prefix) {
    for (const key of cache.keys()) {
      if (key.startsWith(prefix)) {
        cache.delete(key);
      }
    }
  } else {
    cache.clear();
  }
}

/**
 * Prefetch a URL for faster navigation
 */
export function prefetchUrl(url: string): void {
  if (typeof window === "undefined") return;
  
  const link = document.createElement("link");
  link.rel = "prefetch";
  link.href = url;
  document.head.appendChild(link);
}

/**
 * Prefetch data by calling an API endpoint
 */
export async function prefetchData(url: string): Promise<void> {
  if (typeof window === "undefined") return;
  
  try {
    const response = await fetch(url, {
      method: "GET",
      credentials: "same-origin",
      priority: "low" as any, // Hint for browsers that support it
    });
    
    if (response.ok) {
      // Cache the response
      const data = await response.json();
      setCached(url, data, 60000); // 1 minute TTL
    }
  } catch (err) {
    // Silent failure for prefetch
  }
}
