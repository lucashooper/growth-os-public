/**
 * Lightweight timing helper for spotting slow publish / load steps.
 * Logs to the browser or server console as `[perf] label · step +Nms`.
 */
export type PerfTimer = {
  mark: (step: string, extra?: Record<string, unknown>) => number;
  fail: (step: string, err: unknown) => void;
  end: (extra?: Record<string, unknown>) => number;
  elapsed: () => number;
};

function nowMs(): number {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}

export function createPerfTimer(label: string): PerfTimer {
  const t0 = nowMs();
  const marks: { step: string; ms: number }[] = [];

  const elapsed = () => Math.round(nowMs() - t0);

  return {
    elapsed,
    mark(step, extra) {
      const ms = elapsed();
      marks.push({ step, ms });
      if (extra) console.info(`[perf] ${label} · ${step} +${ms}ms`, extra);
      else console.info(`[perf] ${label} · ${step} +${ms}ms`);
      return ms;
    },
    fail(step, err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[perf] ${label} · FAIL ${step} +${elapsed()}ms`, message);
    },
    end(extra) {
      const total = elapsed();
      console.info(`[perf] ${label} · done ${total}ms`, {
        marks,
        ...extra,
      });
      return total;
    },
  };
}
