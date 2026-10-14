"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";

export type AccentTheme = "emerald" | "violet";

const STORAGE_KEY = "growthos.accent";

type ThemeCtx = {
  accent: AccentTheme;
  setAccent: (t: AccentTheme) => void;
};

const Ctx = createContext<ThemeCtx | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [accent, setAccentState] = useState<AccentTheme>("emerald");

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY) as AccentTheme | null;
    if (saved === "emerald" || saved === "violet") {
      setAccentState(saved);
      document.documentElement.dataset.accent = saved;
    }
  }, []);

  const setAccent = (t: AccentTheme) => {
    setAccentState(t);
    localStorage.setItem(STORAGE_KEY, t);
    document.documentElement.dataset.accent = t;
  };

  const value = useMemo(() => ({ accent, setAccent }), [accent]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAccentTheme() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useAccentTheme requires ThemeProvider");
  return ctx;
}
