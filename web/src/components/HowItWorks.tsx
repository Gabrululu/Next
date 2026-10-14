"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useT } from "@/lib/i18n";
import { useId, useState } from "react";
import { QueueDots } from "./QueueDots";
import { Reveal } from "./Reveal";

const STEPS = [
  { t: "Open", d: "An organizer picks how many spots there are and how long people can join. The moment of the draw is fixed from the start, so nobody can choose a convenient time." },
  { t: "Join", d: "People join once while it's open. Joining first gives no advantage, so there's nothing to rush for." },
  { t: "Draw", d: "When the time comes, anyone can start the draw. The result comes from a random number nobody knew in advance, and it is the same no matter who presses the button." },
  { t: "Claim", d: "Winners claim a pass that can't be transferred. Anyone can check the result was fair, with one click." },
  { t: "Check in", d: "At the door, winners show a QR from their phone. The organizer scans it and sees right away if the pass is real." },
];

const EASE = [0.835, 0.12, 0.225, 0.77] as const;

/* Illustrative visuals for each step (decorative; not live data). */
function Visual({ step }: { step: number }) {
  const t = useT();
  if (step === 0)
    return (
      <div className="flex h-full items-center justify-center gap-10">
        <div className="relative size-40 rounded-full tactile grid place-items-center">
          <motion.div className="absolute inset-3" animate={{ rotate: [-100, 40, -20] }} transition={{ duration: 2.4, ease: "easeInOut" }}>
            <span className="absolute left-1/2 top-1 h-7 w-1.5 -translate-x-1/2 rounded-full bg-volt shadow-[0_0_12px_var(--color-volt)]" />
          </motion.div>
          <span className="font-display text-3xl font-bold">10m</span>
        </div>
        <div className="relative h-44 w-3 rounded-full tactile-pressed">
          <motion.div className="absolute bottom-0 inset-x-0 rounded-full bg-volt" initial={{ height: "10%" }} animate={{ height: "55%" }} transition={{ duration: 1.6, ease: "easeOut" }} />
        </div>
      </div>
    );
  if (step === 1) return <div className="flex h-full items-center p-8"><QueueDots count={60} cols={12} /></div>;
  if (step === 2) return <div className="flex h-full items-center p-8"><QueueDots count={60} cols={12} winners={12} shuffleKey="how-it-works" /></div>;
  if (step === 4)
    return (
      <div className="flex h-full items-center justify-center p-8">
        <motion.div initial={{ scale: 0.92, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: "spring", stiffness: 120, damping: 14 }}
          className="relative rounded-3xl bg-paper p-4 shadow-[0_30px_60px_-20px_rgba(157,107,255,0.6)]">
          {/* stylised QR (decorative, not scannable) */}
          <div className="grid grid-cols-9 gap-[3px]" aria-hidden>
            {Array.from({ length: 81 }, (_, i) => {
              const r = Math.floor(i / 9), c = i % 9;
              const finder = (r < 3 && c < 3) || (r < 3 && c > 5) || (r > 5 && c < 3);
              const on = finder || ((r * 7 + c * 13 + r * c) % 3 === 0);
              return <span key={i} className={`size-3.5 rounded-[3px] ${on ? "bg-ink" : "bg-transparent"}`} />;
            })}
          </div>
          {/* scan line moves with a transform, so MotionConfig reducedMotion="user" stills it */}
          <motion.span className="absolute inset-x-3 top-5 h-0.5 bg-volt shadow-[0_0_12px_var(--color-volt)]" animate={{ y: [0, 140, 0] }} transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }} />
          <p className="mt-3 text-center font-mono text-xs text-ink">{t("Valid pass")} ✓</p>
        </motion.div>
      </div>
    );
  return (
    <div className="flex h-full items-center justify-center p-8">
      <motion.div initial={{ rotate: -6, y: 20, opacity: 0 }} animate={{ rotate: -3, y: 0, opacity: 1 }} transition={{ type: "spring", stiffness: 120, damping: 14 }}
        className="w-64 rounded-3xl p-6 bg-gradient-to-br from-volt to-[#5b2fd0] text-ink shadow-[0_30px_60px_-20px_rgba(157,107,255,0.7)]">
        <p className="font-mono text-xs uppercase tracking-widest opacity-70">{t("Pass · example")}</p>
        <p className="mt-10 font-display text-4xl font-extrabold">{t("You're in.")}</p>
        <div className="mt-6 flex items-center justify-between font-mono text-xs opacity-80"><span>{t("your pass")}</span><span>{t("can't be transferred")}</span></div>
      </motion.div>
    </div>
  );
}

export function HowItWorks() {
  const t = useT();
  const [open, setOpenRaw] = useState(0);
  const [layer, setLayer] = useState(1); // newest visual always stacks on top, even when going backwards
  const setOpen = (i: number) => { if (i !== open) { setOpenRaw(i); setLayer((l) => l + 1); } };
  const reduce = useReducedMotion();
  const base = useId();

  return (
    <section id="how" aria-labelledby="how-h" className="mx-auto max-w-6xl px-4 sm:px-6 py-24 md:py-36 scroll-mt-24">
      <div className="grid gap-12 md:grid-cols-2 items-center">
        {/* visual: each step wipes in from the right over the previous one */}
        <Reveal className="order-2 md:order-1">
          <div className="relative aspect-[1/1.05] rounded-[2rem] tactile overflow-hidden" aria-hidden>
            <AnimatePresence initial={false}>
              <motion.div
                key={layer}
                className="absolute inset-0"
                initial={reduce ? { opacity: 0 } : { clipPath: "inset(0 0 0 100%)" }}
                animate={reduce ? { opacity: 1 } : { clipPath: "inset(0 0 0 0%)" }}
                exit={reduce ? { opacity: 0 } : { opacity: 1 }}
                transition={{ duration: reduce ? 0.01 : 0.6, ease: EASE }}
                style={{ zIndex: layer, background: "linear-gradient(180deg,#1d1924,#131117)" }}
              >
                <Visual step={open} />
              </motion.div>
            </AnimatePresence>
            <span className="absolute left-5 top-5 z-[9999] label">{t("Illustration")}</span>
          </div>
        </Reveal>

        <div className="order-1 md:order-2">
          <Reveal><p className="label">{t("Five steps, no race")}</p></Reveal>
          <h2 id="how-h" className="sr-only">{t("How it works")}</h2>
          <ol className="mt-6">
            {STEPS.map((s, i) => {
              const isOpen = open === i;
              return (
                <li key={s.t} className="border-b border-line last:border-0">
                  <h3>
                    <button
                      id={`${base}-t${i}`}
                      aria-expanded={isOpen}
                      aria-controls={`${base}-p${i}`}
                      onClick={() => setOpen(i)}
                      className={`group flex w-full items-baseline gap-4 py-4 text-left transition-colors duration-500 ${isOpen ? "text-paper" : "text-paper/30 hover:text-paper/55"}`}
                    >
                      <span className="font-mono text-sm text-volt-2 tabular-nums">0{i + 1}</span>
                      <span className="t-h2 font-display font-extrabold">{t(s.t)}</span>
                    </button>
                  </h3>
                  <AnimatePresence initial={false}>
                    {isOpen && (
                      <motion.div
                        id={`${base}-p${i}`}
                        role="region"
                        aria-labelledby={`${base}-t${i}`}
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.4, ease: EASE }}
                        className="overflow-hidden"
                      >
                        <p className="t-lead text-mute pb-6 pl-9 max-w-[40ch]">{t(s.d)}</p>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </li>
              );
            })}
          </ol>
        </div>
      </div>
    </section>
  );
}
