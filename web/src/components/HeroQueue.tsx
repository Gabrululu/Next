"use client";

import { motion, useReducedMotion } from "framer-motion";
import { useEffect, useState } from "react";
import { QueueDots } from "./QueueDots";

const TOTAL = 120;
const WINNERS = 24;
const HOLD_MS = 5200;

/** Decorative loop: people join the line in any order, the window closes, the line reshuffles. */
export function HeroQueue() {
  const reduce = useReducedMotion();
  const [count, setCount] = useState(reduce ? TOTAL : 0);
  const [round, setRound] = useState(0);
  const [cols, setCols] = useState(24);
  const closed = count >= TOTAL;

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 640px)");
    const apply = () => setCols(mq.matches ? 24 : 12);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  useEffect(() => {
    if (reduce) { setCount(TOTAL); return; }
    if (!closed) {
      const t = setTimeout(() => setCount((c) => Math.min(TOTAL, c + 1 + Math.floor(Math.random() * 3))), 45);
      return () => clearTimeout(t);
    }
    const t = setTimeout(() => { setCount(0); setRound((r) => r + 1); }, HOLD_MS);
    return () => clearTimeout(t);
  }, [count, closed, reduce]);

  return (
    <div className="relative rounded-[2rem] bg-[#0f0d13] border border-line shadow-[0_40px_120px_-40px_rgba(157,107,255,0.45)] overflow-hidden">
      {/* window chrome */}
      <div className="flex items-center gap-3 px-5 py-3 border-b border-line">
        <span className="size-2.5 rounded-full bg-ink-3" /><span className="size-2.5 rounded-full bg-ink-3" /><span className="size-2.5 rounded-full bg-ink-3" />
        <span className="label ml-2 truncate">Illustration · the line</span>
        <span className="ml-auto font-mono text-sm tabular-nums whitespace-nowrap">{count} in line</span>
      </div>

      <div className="p-5 sm:p-8">
        <QueueDots count={count} winners={closed ? WINNERS : 0} shuffleKey={closed ? `round-${round}` : undefined} cols={cols} />
      </div>

      {/* timeline: the window fills, closes, then the draw */}
      <div className="px-5 sm:px-8 pb-6">
        <div className="relative h-9 rounded-xl tactile-pressed overflow-hidden">
          <motion.div
            className="absolute inset-y-1 left-1 rounded-lg bg-volt/25 border border-volt/40"
            animate={{ width: `calc(${(Math.min(count, TOTAL) / TOTAL) * 70}% - 4px)` }}
            transition={{ duration: reduce ? 0 : 0.15 }}
          />
          <span className="absolute left-3 top-1/2 -translate-y-1/2 label text-[10px]">Window open</span>
          <div className={`absolute inset-y-1 right-1 w-[29%] rounded-lg grid place-items-center transition-colors duration-500 ${closed ? "bg-volt text-ink" : "bg-ink-3 text-mute"}`}>
            <span className="font-mono text-[10px] uppercase tracking-wider">{closed ? `Drawn · ${WINNERS} picked` : "Seed block"}</span>
          </div>
          <motion.div
            className="absolute inset-y-0 w-0.5 bg-paper shadow-[0_0_8px_white]"
            animate={{ left: closed ? "85%" : `${(count / TOTAL) * 70}%` }}
            transition={{ duration: reduce ? 0 : 0.3 }}
            aria-hidden
          />
        </div>
        <p className="label mt-3">{closed ? "Picked from a public seed. Anyone can recompute it." : "Arrival order doesn't matter"}</p>
      </div>
    </div>
  );
}
