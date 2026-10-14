"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

type Props = {
  /** Frequency bins 0..1, length 4–8 */
  levels: number[];
  active?: boolean;
  className?: string;
};

/** Cortana / Gemini-style organic pill waveform. */
export function VoiceWaveform({ levels, active, className }: Props) {
  const bars = levels.length ? levels : [0.15, 0.25, 0.35, 0.25, 0.15, 0.2];

  return (
    <div
      className={cn(
        "flex h-10 items-end justify-center gap-1.5",
        className,
      )}
      aria-hidden
    >
      {bars.map((level, i) => {
        const h = Math.max(0.12, Math.min(1, level)) * 100;
        return (
          <span
            key={i}
            className={cn(
              "w-1.5 rounded-full transition-[height,background-color] duration-75",
              active
                ? "bg-gradient-to-t from-[#5bcd1d] to-[#a3e635]"
                : "bg-white/25",
            )}
            style={{ height: `${h}%`, minHeight: 6 }}
          />
        );
      })}
    </div>
  );
}

/** Hook helper: drive waveform + RMS from AnalyserNode. */
export function useAnalyserLevels(
  analyser: AnalyserNode | null,
  enabled: boolean,
  onLevel: (rms: number, bars: number[]) => void,
) {
  const raf = useRef(0);

  useEffect(() => {
    if (!analyser || !enabled) {
      onLevel(0, [0.12, 0.14, 0.16, 0.14, 0.12, 0.13]);
      return;
    }
    const data = new Uint8Array(analyser.frequencyBinCount);
    const tick = () => {
      analyser.getByteFrequencyData(data);
      let sum = 0;
      for (let i = 0; i < data.length; i++) sum += data[i]!;
      const rms = Math.min(1, (sum / data.length / 255) * 2.4);
      const barCount = 6;
      const bars: number[] = [];
      const slice = Math.floor(data.length / barCount);
      for (let b = 0; b < barCount; b++) {
        let s = 0;
        for (let i = b * slice; i < (b + 1) * slice; i++) s += data[i] || 0;
        bars.push(Math.min(1, (s / slice / 255) * 1.8 + 0.08));
      }
      onLevel(rms, bars);
      raf.current = requestAnimationFrame(tick);
    };
    tick();
    return () => {
      if (raf.current) cancelAnimationFrame(raf.current);
    };
  }, [analyser, enabled, onLevel]);
}
