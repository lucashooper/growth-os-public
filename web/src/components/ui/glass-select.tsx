"use client";

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

export const GLASS_PANEL =
  "bg-[#141416]/90 backdrop-blur-xl border border-white/[0.08] shadow-2xl rounded-xl p-1.5 z-50";

export const GLASS_SHEET =
  "rounded-2xl border border-white/[0.08] bg-[#141416]/95 backdrop-blur-xl shadow-2xl";

export const GLASS_TRIGGER =
  "flex w-full min-w-0 items-center justify-between gap-2 rounded-lg border border-white/[0.08] bg-white/[0.04] px-2.5 text-left text-zinc-200 transition-colors hover:bg-white/[0.06] disabled:opacity-50";

export const GLASS_ITEM =
  "w-full px-3 py-2 text-left text-sm text-zinc-300 rounded-lg cursor-pointer transition-colors duration-150 hover:bg-white/[0.06] hover:text-white";

export const GLASS_ITEM_SELECTED = "bg-white/[0.08] text-white font-medium";

export function glassItemClass(selected?: boolean) {
  return cn(GLASS_ITEM, selected && GLASS_ITEM_SELECTED);
}

export type GlassOption = {
  value: string;
  label: string;
  disabled?: boolean;
};

function useDismiss(
  open: boolean,
  onClose: () => void,
  triggerRef: RefObject<HTMLElement | null>,
  panelRef: RefObject<HTMLElement | null>,
) {
  useEffect(() => {
    if (!open) return;
    const onPointer = (e: MouseEvent) => {
      const t = e.target as Node;
      if (triggerRef.current?.contains(t) || panelRef.current?.contains(t)) {
        return;
      }
      onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    const onScroll = (e: Event) => {
      if (panelRef.current?.contains(e.target as Node)) return;
      onClose();
    };
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onScroll);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onScroll);
    };
  }, [open, onClose, triggerRef, panelRef]);
}

function menuStyle(
  trigger: HTMLElement,
  opts: { minWidth?: number; matchTriggerWidth?: boolean; align?: "start" | "end" },
): CSSProperties {
  const r = trigger.getBoundingClientRect();
  const width = opts.matchTriggerWidth === false
    ? (opts.minWidth ?? Math.max(r.width, 176))
    : Math.max(r.width, opts.minWidth ?? r.width);
  const spaceBelow = window.innerHeight - r.bottom;
  const openUp = spaceBelow < 240 && r.top > spaceBelow;
  let left = opts.align === "end" ? r.right - width : r.left;
  left = Math.max(8, Math.min(left, window.innerWidth - width - 8));
  return {
    position: "fixed",
    left,
    width,
    top: openUp ? undefined : r.bottom + 6,
    bottom: openUp ? window.innerHeight - r.top + 6 : undefined,
    zIndex: 80,
  };
}

export function GlassPopover({
  open,
  onClose,
  triggerRef,
  children,
  className,
  align = "start",
  minWidth,
  matchTriggerWidth = true,
}: {
  open: boolean;
  onClose: () => void;
  triggerRef: RefObject<HTMLElement | null>;
  children: ReactNode;
  className?: string;
  align?: "start" | "end";
  minWidth?: number;
  matchTriggerWidth?: boolean;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<CSSProperties>({});
  useDismiss(open, onClose, triggerRef, panelRef);

  useEffect(() => {
    if (!open || !triggerRef.current) return;
    setPos(
      menuStyle(triggerRef.current, { minWidth, matchTriggerWidth, align }),
    );
  }, [open, triggerRef, minWidth, matchTriggerWidth, align]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div
      ref={panelRef}
      style={pos}
      className={cn(GLASS_PANEL, className)}
    >
      {children}
    </div>,
    document.body,
  );
}

export function GlassSelect({
  value,
  onChange,
  options,
  "aria-label": ariaLabel,
  disabled,
  className,
  triggerClassName,
  placeholder = "Select…",
  size = "sm",
}: {
  value: string;
  onChange: (value: string) => void;
  options: GlassOption[];
  "aria-label"?: string;
  disabled?: boolean;
  className?: string;
  triggerClassName?: string;
  placeholder?: string;
  size?: "sm" | "md";
}) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listId = useId();
  const selected = options.find((o) => o.value === value);
  const close = useCallback(() => setOpen(false), []);

  return (
    <div className={cn("relative min-w-0", className)}>
      <button
        ref={triggerRef}
        type="button"
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        className={cn(
          GLASS_TRIGGER,
          size === "md" ? "h-10 text-sm" : "h-9 text-xs",
          triggerClassName,
        )}
      >
        <span className="truncate">{selected?.label || placeholder}</span>
        <ChevronDown
          className={cn(
            "h-3.5 w-3.5 shrink-0 text-zinc-500 transition",
            open && "rotate-180",
          )}
        />
      </button>
      <GlassPopover
        open={open}
        onClose={close}
        triggerRef={triggerRef}
        className="max-h-64 overflow-y-auto"
        minWidth={176}
      >
        <div id={listId} role="listbox" aria-label={ariaLabel}>
          {options.map((o) => {
            const isOn = o.value === value;
            return (
              <button
                key={o.value}
                type="button"
                role="option"
                aria-selected={isOn}
                disabled={o.disabled}
                className={cn(
                  glassItemClass(isOn),
                  o.disabled && "cursor-not-allowed opacity-40 hover:bg-transparent hover:text-zinc-300",
                )}
                onClick={() => {
                  if (o.disabled) return;
                  onChange(o.value);
                  setOpen(false);
                }}
              >
                {o.label}
              </button>
            );
          })}
        </div>
      </GlassPopover>
    </div>
  );
}
