"use client";

import { motion, useReducedMotion } from "framer-motion";
import { useT } from "@/lib/i18n";
import type { Phase } from "@/lib/campaign";

const SEGMENTS: { key: Phase | "closed"; label: string; from: number; to: number }[] = [
  { key: "open", label: "Open to join", from: 0, to: 55 },
  { key: "sealing", label: "Closed", from: 55, to: 77 },
  { key: "drawable", label: "Ready to draw", from: 77, to: 88 },
  { key: "drawn", label: "Drawn", from: 88, to: 100 },
];
const ORDER: Phase[] = ["upcoming", "open", "sealing", "drawable", "drawn"];

/** Editor-style timeline of a campaign's lifecycle with a playhead at the current phase. */
export function PhaseTrack({ phase, openProgress }: { phase: Phase; openProgress: number }) {
  const reduce = useReducedMotion();
  const t = useT();
  const idx = ORDER.indexOf(phase);
  const head =
    phase === "upcoming" ? 0 :
    phase === "open" ? 55 * Math.min(1, Math.max(0, openProgress)) :
    phase === "sealing" ? 66 :
    phase === "drawable" ? 82.5 : 100;

  return (
    <div role="img" aria-label={t("Campaign timeline")}>
      <div className="relative h-11 rounded-xl tactile-pressed">
        {SEGMENTS.map((s) => {
          const done = ORDER.indexOf(s.key as Phase) < idx;
          const current = s.key === phase;
          return (
            <div
              key={s.key}
              className={`absolute inset-y-1 rounded-lg grid items-center px-3 transition-colors duration-700 ${
                current ? "bg-volt/25 border border-volt/50" : done ? "bg-volt/10 border border-volt/20" : "bg-ink-3/60 border border-transparent"}`}
              style={{ left: `calc(${s.from}% + 4px)`, width: `calc(${s.to - s.from}% - 6px)` }}
            >
              <span className={`font-mono text-[10px] uppercase tracking-wider truncate ${current ? "text-paper" : "text-mute"}`}>{t(s.label)}</span>
            </div>
          );
        })}
        <motion.div
          className="absolute -inset-y-1 w-0.5 bg-paper shadow-[0_0_10px_white] rounded-full"
          initial={false}
          animate={{ left: `${head}%` }}
          transition={reduce ? { duration: 0 } : { type: "spring", stiffness: 60, damping: 18 }}
          aria-hidden
        >
          <span className="absolute -top-1.5 left-1/2 -translate-x-1/2 size-2.5 rotate-45 bg-paper rounded-[2px]" />
        </motion.div>
      </div>
    </div>
  );
}
