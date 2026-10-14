"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

const routes: Record<string, string> = {
  a: "/agent",
  c: "/chat",
  d: "/dashboard",
  g: "/generate",
  l: "/library",
  x: "/experiments",
  o: "/competitors",
  n: "/accounts",
  y: "/analytics",
  v: "/developer",
};

/** Press `g` then a letter to navigate (Linear-style). */
export function KeyboardNav() {
  const router = useRouter();
  const armed = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName?.toLowerCase();
      if (
        tag === "input" ||
        tag === "textarea" ||
        tag === "select" ||
        target?.isContentEditable
      ) {
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      if (e.key === "g" && !armed.current) {
        armed.current = true;
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => {
          armed.current = false;
        }, 1200);
        return;
      }

      if (armed.current) {
        const path = routes[e.key.toLowerCase()];
        armed.current = false;
        if (timer.current) clearTimeout(timer.current);
        if (path) {
          e.preventDefault();
          router.push(path);
        }
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [router]);

  return null;
}
