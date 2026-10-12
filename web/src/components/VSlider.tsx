"use client";

import { motion, useReducedMotion } from "framer-motion";
import { useRef } from "react";

type Props = { min: number; max: number; value: number; onChange: (v: number) => void; label: string; ticks?: number[] };

/** Vertical fader. Drag the cap, click the track, or use arrow / PageUp / PageDown keys. */
export function VSlider({ min, max, value, onChange, label, ticks = [] }: Props) {
  const track = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();
  const pct = (value - min) / (max - min);
  const clamp = (v: number) => Math.max(min, Math.min(max, Math.round(v)));

  const fromY = (y: number) => {
    const r = track.current!.getBoundingClientRect();
    const p = 1 - (y - r.top) / r.height;
    const v = clamp(min + p * (max - min));
    if (v !== value) onChange(v);
  };

  return (
    <div className="flex flex-col items-center gap-4 select-none">
      <div className="relative h-64 w-24 flex justify-center">
        {/* scale */}
        <div className="absolute inset-y-0 left-0 w-6" aria-hidden>
          {ticks.map((t) => (
            <span key={t} className="absolute right-0 -translate-y-1/2 font-mono text-[10px] text-mute" style={{ top: `${(1 - (t - min) / (max - min)) * 100}%` }}>{t}</span>
          ))}
        </div>
        <div
          ref={track}
          role="slider"
          tabIndex={0}
          aria-label={label}
          aria-orientation="vertical"
          aria-valuemin={min}
          aria-valuemax={max}
          aria-valuenow={value}
          className="relative h-full w-3 rounded-full tactile-pressed cursor-pointer touch-none"
          onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); fromY(e.clientY); }}
          onPointerMove={(e) => { if (e.buttons) fromY(e.clientY); }}
          onKeyDown={(e) => {
            const big = Math.max(1, Math.round((max - min) / 10));
            const map: Record<string, number> = { ArrowUp: 1, ArrowRight: 1, ArrowDown: -1, ArrowLeft: -1, PageUp: big, PageDown: -big };
            if (e.key in map) { e.preventDefault(); onChange(clamp(value + map[e.key])); }
            if (e.key === "Home") { e.preventDefault(); onChange(min); }
            if (e.key === "End") { e.preventDefault(); onChange(max); }
          }}
        >
          <motion.div
            className="absolute bottom-0 inset-x-0 rounded-full bg-volt shadow-[0_0_16px_var(--color-volt)]"
            animate={{ height: `${pct * 100}%` }}
            transition={reduce ? { duration: 0 } : { type: "spring", stiffness: 500, damping: 40 }}
          />
          {/* fader cap */}
          <motion.div
            className="absolute left-1/2 -translate-x-1/2 translate-y-1/2 h-7 w-14 rounded-lg tactile grid place-items-center"
            animate={{ bottom: `${pct * 100}%` }}
            transition={reduce ? { duration: 0 } : { type: "spring", stiffness: 500, damping: 40 }}
            aria-hidden
          >
            <span className="h-0.5 w-8 rounded bg-paper/70" />
          </motion.div>
        </div>
      </div>
      <span className="font-display text-3xl font-bold tabular-nums">{value}</span>
      <span className="label">{label}</span>
    </div>
  );
}
