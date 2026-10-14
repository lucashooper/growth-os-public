"use client";

import { LiquidOrb } from "@/components/liquid-orb";
import { cn } from "@/lib/utils";

const DEFAULT_STAGES = [
  "Analyzing performance data...",
  "Matching image pack aesthetic...",
  "Crafting 5-slide hook & narrative...",
  "Finalizing carousel...",
];

type Props = {
  /** Active stage index (clamped). Pass steps.length or higher when done. */
  stageIndex: number;
  /** Optional custom stage labels; defaults to generator stages. */
  stages?: string[];
  className?: string;
};

/**
 * Single-line Perplexity/ChatGPT-style thinking indicator.
 * Mini liquid orb + one muted animated status line — zero layout shift.
 */
export function ThinkingStatus({
  stageIndex,
  stages = DEFAULT_STAGES,
  className,
}: Props) {
  const idx = Math.min(Math.max(stageIndex, 0), Math.max(stages.length - 1, 0));
  const label = stages[idx] || stages[0] || "Thinking...";

  return (
    <div
      className={cn(
        "flex h-10 items-center gap-2.5 overflow-hidden",
        className,
      )}
      role="status"
      aria-live="polite"
    >
      <LiquidOrb size="mini" mode="thinking" className="!h-10 !w-10 shrink-0" />
      <p
        key={label}
        className="truncate text-xs text-muted animate-pulse"
      >
        {label}
      </p>
    </div>
  );
}

export const GENERATOR_THINKING_STAGES = DEFAULT_STAGES;
