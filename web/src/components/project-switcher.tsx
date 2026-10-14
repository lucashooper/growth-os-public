"use client";

import { useEffect, useRef, useState } from "react";
import { Check, ChevronsUpDown, Loader2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useProject } from "@/lib/project-context";
import { cn } from "@/lib/utils";
import { GLASS_PANEL, glassItemClass } from "@/components/ui/glass-select";

export function ProjectSwitcher() {
  const { project, projects, setProjectId, loading, error } = useProject();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  if (loading) {
    return (
      <div className="flex h-[52px] items-center gap-2 rounded-xl border border-white/[0.06] bg-white/[0.025] px-3 text-xs text-muted">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        Loading projects…
      </div>
    );
  }

  if (error || !project) {
    return (
      <div className="rounded-xl border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger">
        {error || "No projects yet"}
      </div>
    );
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2.5 rounded-xl border border-white/[0.06] bg-white/[0.025] px-3 py-2.5 text-left transition-colors hover:bg-white/[0.04]"
      >
        <span
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-xs font-semibold text-primary-fg"
          style={{ background: project.color }}
        >
          {project.name.slice(0, 1)}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium text-ink">
            {project.name}
          </span>
          <span className="block truncate text-[11px] text-muted">
            {project._count?.accounts ?? 0} accounts · {project._count?.posts ?? 0} posts
          </span>
        </span>
        <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 text-muted" />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 4 }}
            transition={{ duration: 0.15 }}
            className={cn(
              GLASS_PANEL,
              "absolute left-0 right-0 top-[calc(100%+6px)] z-50 overflow-hidden",
            )}
          >
            <div>
              <p className="px-3 py-2 text-[10px] font-medium uppercase tracking-wider text-zinc-500">
                Projects
              </p>
              {projects.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => {
                    setProjectId(p.id);
                    setOpen(false);
                  }}
                  className={cn(
                    glassItemClass(p.id === project.id),
                    "flex items-center gap-2.5",
                  )}
                >
                  <span
                    className="flex h-6 w-6 items-center justify-center rounded-md text-[10px] font-semibold text-primary-fg"
                    style={{ background: p.color }}
                  >
                    {p.name.slice(0, 1)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm text-ink">{p.name}</span>
                    <span className="block truncate text-[11px] text-muted">
                      {p.description || "No description"}
                    </span>
                  </span>
                  {p.id === project.id && (
                    <Check className="h-3.5 w-3.5 text-primary" />
                  )}
                </button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
