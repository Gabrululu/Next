"use client";

import { motion, useReducedMotion, useScroll, useTransform, type MotionValue } from "framer-motion";
import { useT } from "@/lib/i18n";
import { useRef, type ReactNode } from "react";

/* ---------- tiny inline chips (decorative, our own visuals) ---------- */

function Chip({ children, label }: { children: ReactNode; label: string }) {
  return (
    <span
      role="img"
      aria-label={label}
      className="squircle squircle-glow relative inline-grid place-items-center align-[-0.12em] mx-[0.18em] size-[0.95em] bg-gradient-to-b from-[#2a2433] to-[#141118] overflow-hidden"
    >
      {children}
    </span>
  );
}

function DotsChip() {
  return (
    <Chip label="people in line">
      <span className="grid grid-cols-3 gap-[0.07em]">
        {Array.from({ length: 9 }, (_, i) => (
          <span key={i} className="size-[0.12em] rounded-full bg-paper chip-pulse" style={{ animationDelay: `${(i * 137) % 900}ms` }} />
        ))}
      </span>
    </Chip>
  );
}

function DialChip() {
  return (
    <Chip label="a dial">
      <span className="relative size-[0.62em] rounded-full border-[0.04em] border-paper/30 chip-spin">
        <span className="absolute left-1/2 top-[8%] h-[30%] w-[0.07em] -translate-x-1/2 rounded-full bg-volt" />
      </span>
    </Chip>
  );
}

function HashChip() {
  return (
    <Chip label="a die">
      <svg viewBox="0 0 24 24" className="size-[0.55em]" aria-hidden>
        <rect x="3.5" y="3.5" width="17" height="17" rx="4" fill="none" stroke="var(--color-volt)" strokeWidth="2.2" />
        {[[8.5, 8.5], [15.5, 8.5], [12, 12], [8.5, 15.5], [15.5, 15.5]].map(([cx, cy]) => <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r="1.6" fill="var(--color-volt-2)" />)}
      </svg>
    </Chip>
  );
}

function CheckChip() {
  return (
    <Chip label="a verified check mark">
      <svg viewBox="0 0 24 24" className="size-[0.55em]" aria-hidden>
        <path d="M5 12.5l4.2 4.2L19 7" fill="none" stroke="var(--color-volt)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="chip-draw" />
      </svg>
    </Chip>
  );
}

/* ---------- sentence with scroll-linked word highlight ---------- */

type Piece = string | ReactNode;
const PIECES: Piece[] = [
  "Everyone", <DotsChip key="d" />, "gets in line.", "The window", <DialChip key="w" />, "closes on time.",
  "A fair draw", <HashChip key="h" />, "picks who's in.", "And anyone", <CheckChip key="c" />, "can check it.",
];

function Word({ children, progress, range }: { children: ReactNode; progress: MotionValue<number>; range: [number, number] }) {
  const opacity = useTransform(progress, range, [0.18, 1]);
  return <motion.span style={{ opacity }}>{children}</motion.span>;
}

export function Statement() {
  const t = useT();
  const ref = useRef<HTMLElement>(null);
  const reduce = useReducedMotion();
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start 0.85", "end 0.55"] });

  // flatten into words so each one lights up in sequence
  const tokens: Piece[] = PIECES.flatMap((p) => (typeof p === "string" ? t(p).split(" ").flatMap((w) => [w, " "]) : [p, " "]));
  const total = tokens.length;

  return (
    <section ref={ref} aria-label={t("What Next does")} className="mx-auto max-w-6xl px-4 sm:px-6 py-28 md:py-44">
      <h2 className="t-h2 font-display font-bold text-center max-w-[22ch] mx-auto">
        {reduce
          ? tokens
          : tokens.map((tok, i) => (tok === " " ? " " : (
            <Word key={i} progress={scrollYProgress} range={[i / total, Math.min(1, (i + 2) / total)]}>{tok}</Word>
          )))}
      </h2>
    </section>
  );
}
