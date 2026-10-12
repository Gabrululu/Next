"use client";

import { motion, useReducedMotion } from "framer-motion";
import { useMemo } from "react";

type Props = {
  count: number;
  /** Number of dots to highlight as winners after a draw (0 = no draw yet). */
  winners?: number;
  /** Changing this reshuffles the line (e.g. the draw seed). */
  shuffleKey?: string;
  cols?: number;
  className?: string;
};

// Small deterministic PRNG so the visual reshuffle is stable for a given key.
function mulberry32(a: number) {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const hashStr = (s: string) => [...s].reduce((h, ch) => (Math.imul(h, 31) + ch.charCodeAt(0)) | 0, 7);

/**
 * Abstract queue: one dot per person, in arrival order. When shuffleKey is set the dots
 * glide to shuffled positions and the first `winners` positions light up. Decorative only;
 * the real winners are listed as text elsewhere.
 */
export function QueueDots({ count, winners = 0, shuffleKey, cols = 20, className = "" }: Props) {
  const reduce = useReducedMotion();
  const order = useMemo(() => {
    const idx = Array.from({ length: count }, (_, i) => i);
    if (!shuffleKey) return idx;
    const rnd = mulberry32(hashStr(shuffleKey));
    for (let i = idx.length - 1; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      [idx[i], idx[j]] = [idx[j], idx[i]];
    }
    return idx;
  }, [count, shuffleKey]);

  // position[p] = slot index of person p
  const slotOf = useMemo(() => {
    const s = new Array<number>(count);
    order.forEach((person, slot) => { s[person] = slot; });
    return s;
  }, [order, count]);

  const rows = Math.max(1, Math.ceil(count / cols));
  const cell = 100 / cols;

  return (
    <div className={`relative w-full ${className}`} style={{ aspectRatio: `${cols} / ${Math.max(rows, 3)}` }} aria-hidden>
      {Array.from({ length: count }, (_, p) => {
        const slot = slotOf[p] ?? p;
        const win = shuffleKey !== undefined && slot < winners;
        return (
          <motion.span
            key={p}
            className="absolute rounded-full"
            style={{ width: `${cell * 0.55}%`, aspectRatio: "1", x: "-50%", y: "-50%" }}
            initial={reduce ? false : { opacity: 0, scale: 0 }}
            animate={{
              left: `${((slot % cols) + 0.5) * cell}%`,
              top: `${(Math.floor(slot / cols) + 0.5) * (100 / Math.max(rows, 3))}%`,
              opacity: 1,
              scale: win ? 1.15 : 1,
              backgroundColor: win ? "#9d6bff" : shuffleKey ? "#3a3542" : "#d9d4e2",
              boxShadow: win ? "0 0 14px #9d6bff" : "0 0 0px transparent",
            }}
            transition={reduce ? { duration: 0 } : { type: "spring", stiffness: 120, damping: 18, delay: shuffleKey ? (p % 40) * 0.012 : Math.min(p, 60) * 0.01 }}
          />
        );
      })}
    </div>
  );
}
