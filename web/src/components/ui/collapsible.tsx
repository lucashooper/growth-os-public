"use client";

import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

export function Collapsible({
  title,
  subtitle,
  open,
  onToggle,
  children,
  defaultOpen,
}: {
  title: string;
  subtitle?: string;
  open?: boolean;
  onToggle?: () => void;
  children: React.ReactNode;
  /** uncontrolled initial */
  defaultOpen?: boolean;
}) {
  const controlled = open != null;
  // When uncontrolled, use details/summary for simplicity
  if (!controlled) {
    return (
      <details
        className="group mb-4 rounded-xl border border-white/[0.08] bg-[#141416]/60 backdrop-blur-xl"
        open={defaultOpen}
      >
        <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-3 py-2.5 text-sm marker:content-none [&::-webkit-details-marker]:hidden">
          <span>
            <span className="font-medium text-ink">{title}</span>
            {subtitle ? (
              <span className="mt-0.5 block text-[11px] text-muted">{subtitle}</span>
            ) : null}
          </span>
          <ChevronDown className="h-4 w-4 shrink-0 text-muted transition group-open:rotate-180" />
        </summary>
        <div className="border-t border-white/[0.08] px-3 py-3">{children}</div>
      </details>
    );
  }

  return (
    <div className="mb-4 rounded-xl border border-white/[0.08] bg-[#141416]/60 backdrop-blur-xl">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left text-sm"
      >
        <span>
          <span className="font-medium text-ink">{title}</span>
          {subtitle ? (
            <span className="mt-0.5 block text-[11px] text-muted">{subtitle}</span>
          ) : null}
        </span>
        <ChevronDown
          className={cn(
            "h-4 w-4 shrink-0 text-muted transition",
            open && "rotate-180",
          )}
        />
      </button>
      {open ? <div className="border-t border-white/[0.08] px-3 py-3">{children}</div> : null}
    </div>
  );
}
