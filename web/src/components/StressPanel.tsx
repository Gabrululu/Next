"use client";

import { motion, useInView, useReducedMotion } from "framer-motion";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { CHAIN_NAME, contractQuery } from "@/lib/config";
import { useStressRun, type StressRun } from "@/lib/stress";

/**
 * Replays a REAL recorded Monad-testnet stress run: counters and the timeline advance
 * along the recorded send/confirm timestamps. No synthetic data is ever shown.
 */
export function StressPanel({ compact = false }: { compact?: boolean }) {
  const run = useStressRun();
  if (run === undefined) return <PanelFrame><p className="label p-8">Loading run…</p></PanelFrame>;
  if (run === null)
    return (
      <PanelFrame>
        <div className="p-8 sm:p-12">
          <p className="font-display text-3xl font-bold">No testnet run published yet.</p>
          <p className="mt-3 text-mute max-w-prose">
            This panel only shows numbers from a real {CHAIN_NAME} run of <code className="font-mono text-paper">scripts/stress.ts</code>.
            Nothing is shown until a run exists.
          </p>
        </div>
      </PanelFrame>
    );
  return <Replay run={run} compact={compact} />;
}

function PanelFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-[2rem] bg-[#0f0d13] border border-line shadow-[0_40px_120px_-40px_rgba(157,107,255,0.35)] overflow-hidden">
      <div className="flex items-center gap-2 px-5 py-3 border-b border-line">
        <span className="size-3 rounded-full bg-ink-3" /><span className="size-3 rounded-full bg-ink-3" /><span className="size-3 rounded-full bg-ink-3" />
        <span className="label ml-3">stress.ts · {CHAIN_NAME}</span>
      </div>
      {children}
    </div>
  );
}

function Replay({ run, compact }: { run: StressRun; compact: boolean }) {
  const reduce = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.3 });
  const [speed, setSpeed] = useState(0.25);
  const [t, setT] = useState(0);
  const [nonce, setNonce] = useState(0);
  const end = Math.max(run.wallClockMs, 1);

  useEffect(() => {
    if (!inView) return;
    if (reduce) { setT(end); return; }
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const v = Math.min(end, (now - start) * speed);
      setT(v);
      if (v < end) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [inView, reduce, speed, end, nonce]);

  const sent = run.timeline.filter((x) => x.sentMs !== null && x.sentMs <= t).length;
  const lastFiredMs = Math.max(0, ...run.timeline.map((x) => x.sentMs ?? 0));
  const confirmed = run.timeline.filter((x) => x.confirmMs !== null && x.confirmMs <= t).length;
  const blocksSoFar = useMemo(() => {
    const set = new Set<number>();
    for (const x of run.timeline) if (x.confirmMs !== null && x.confirmMs <= t && x.block) set.add(x.block);
    return set.size;
  }, [run.timeline, t]);
  const done = t >= end;
  const pct = (ms: number) => `${(ms / end) * 100}%`;

  // per-block bars in block order
  const blocks = run.blockRange.span > 0
    ? Array.from({ length: run.blockRange.span }, (_, k) => {
        const b = run.blockRange.first + k;
        return { b, n: run.perBlock[String(b)] ?? 0 };
      })
    : [];
  const maxPer = Math.max(1, ...blocks.map((x) => x.n));
  const blockFirstSeen = new Map<number, number>();
  for (const x of run.timeline) if (x.block && x.confirmMs !== null) blockFirstSeen.set(x.block, Math.min(blockFirstSeen.get(x.block) ?? Infinity, x.confirmMs));

  return (
    <div ref={ref}>
      <PanelFrame>
        <div className="p-5 sm:p-8">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <span className="rounded-full border border-volt text-volt-2 px-3 py-1 text-xs font-mono uppercase tracking-wider">Simulated entrants</span>
            <span className="label">Replay of a recorded run · {new Date(run.startedAt).toLocaleString()}</span>
            <div className="ml-auto flex items-center gap-1" role="group" aria-label="Replay speed">
              {[0.25, 1].map((s) => (
                <button key={s} onClick={() => { setSpeed(s); setNonce((n) => n + 1); }} aria-pressed={speed === s}
                  className="label px-2.5 py-1 rounded-full aria-pressed:bg-ink-3 aria-pressed:text-paper">{s}×</button>
              ))}
              <button onClick={() => setNonce((n) => n + 1)} className="label px-2.5 py-1 rounded-full hover:text-paper">Replay</button>
            </div>
          </div>

          {/* counters */}
          <div className={`mt-6 grid gap-4 ${compact ? "grid-cols-2 sm:grid-cols-4" : "grid-cols-2 lg:grid-cols-4"}`}>
            <Counter label="Fired" value={sent} of={run.n} note={`all within ${lastFiredMs} ms`} />
            <Counter label="Confirmed" value={confirmed} of={run.n} accent note={done && run.failedToSend > 0 ? `${run.failedToSend} refused by the RPC` : undefined} />
            <Counter label="Blocks spanned" value={done ? run.blockRange.span : blocksSoFar} note={done ? `${blocks.filter((x) => x.n > 0).length} with registrations` : undefined} />
            <Counter label="Elapsed" value={Math.round(t)} unit="ms" />
          </div>

          {/* timeline */}
          <div className="mt-8" aria-label="Confirmation timeline" role="img"
            title={`${run.sent} sent, ${run.confirmed} confirmed over ${run.wallClockMs} ms`}>
            <div className="flex justify-between label mb-2"><span>0 ms</span><span>{run.wallClockMs} ms</span></div>
            <div className="relative h-28 rounded-xl tactile-pressed overflow-hidden">
              {/* block boundaries */}
              {(() => {
                let lastLabel = -Infinity;
                return [...blockFirstSeen.entries()].sort((a, b) => a[1] - b[1]).map(([b, ms]) => {
                  const showLabel = !compact && ms - lastLabel > end * 0.09;
                  if (showLabel) lastLabel = ms;
                  return (
                    <div key={b} className="absolute inset-y-0 border-l border-dashed border-line" style={{ left: pct(ms) }} title={`block #${b}`}>
                      {showLabel && <span className="absolute top-1 left-1 font-mono text-[9px] text-mute whitespace-nowrap">#{b}</span>}
                    </div>
                  );
                });
              })()}
              {/* sent row */}
              <div className="absolute left-2 top-[34%] label text-[9px]">fired</div>
              {run.timeline.map((x) => x.sentMs !== null && (
                <motion.span key={`s${x.i}`} className="absolute top-[42%] h-3 w-px bg-paper/60"
                  style={{ left: pct(x.sentMs) }} initial={false} animate={{ opacity: x.sentMs <= t ? 1 : 0 }} />
              ))}
              {/* confirmed row */}
              <div className="absolute left-2 top-[64%] label text-[9px]">confirmed</div>
              {run.timeline.map((x) => x.confirmMs !== null && (
                <motion.span key={`c${x.i}`} className="absolute top-[72%] h-4 w-0.5 bg-volt shadow-[0_0_6px_var(--color-volt)]"
                  style={{ left: pct(x.confirmMs) }} initial={false} animate={{ opacity: x.confirmMs <= t ? 1 : 0 }} />
              ))}
              {/* playhead */}
              <div className="absolute inset-y-0 w-0.5 bg-paper" style={{ left: pct(t) }} aria-hidden />
            </div>
          </div>

          {/* per-block bars */}
          {!compact && blocks.length > 0 && (
            <div className="mt-8">
              <p className="label mb-2">Confirmed registrations per block · every block in the range</p>
              <div className="flex items-end gap-1 h-24">
                {blocks.map(({ b, n }) => (
                  <div key={b} className="flex-1 min-w-1 flex flex-col items-center justify-end gap-1 h-full" title={`block ${b}: ${n}`}>
                    <span className="font-mono text-[10px] text-mute">{n}</span>
                    {n > 0
                      ? <motion.div className="w-full rounded-t bg-volt/80" initial={{ height: 0 }} animate={{ height: done || reduce ? `${(n / maxPer) * 100}%` : 0 }} transition={{ type: "spring", stiffness: 120, damping: 20 }} />
                      : <div className="w-full h-0.5 rounded bg-line" />}
                  </div>
                ))}
              </div>
              <div className="flex justify-between font-mono text-[10px] text-mute mt-1"><span>#{run.blockRange.first}</span><span>#{run.blockRange.last}</span></div>
            </div>
          )}

          {/* summary */}
          <dl className="mt-8 grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm border-t border-line pt-6">
            <Stat k="Avg confirmation" v={`${run.avgConfirmMs} ms`} />
            <Stat k="p95 confirmation" v={`${run.p95ConfirmMs} ms`} />
            <Stat k="Block range" v={`#${run.blockRange.first} → #${run.blockRange.last}`} mono />
            <Stat k="Failed / reverted" v={`${run.failedToSend} / ${run.reverted}`} />
          </dl>
          <p className="mt-4 text-xs text-mute leading-relaxed">
            {run.n} throwaway wallets were generated and funded by the test script. They are not real users. Each sent one{" "}
            <code className="font-mono">register()</code> at the same moment. Confirmation time runs from the RPC send to the first time
            its block was visible through the public RPC, so it includes polling latency.
            {run.failedToSend > 0 && <> {run.failedToSend} sends were refused by the public RPC before reaching the chain (&ldquo;{run.sendErrors[0]?.replace(/\.$/, "")}&rdquo;). </>}
            {" "}Every transaction the RPC accepted was confirmed, and {run.reverted === 0 ? "none reverted" : `${run.reverted} reverted`}.
            {" "}<Link className="underline" href={`/c/${run.campaignId}${contractQuery(run.contract)}`}>Campaign #{run.campaignId}</Link>
            {run.draw && <> · drawn in block #{run.draw.block}, {run.draw.verified ? "verifier matched" : "verifier MISMATCH"} · <Link className="underline" href={`/verify/${run.campaignId}${contractQuery(run.contract)}`}>verify</Link></>}
          </p>
        </div>
      </PanelFrame>
    </div>
  );
}

function Counter({ label, value, of, unit, accent, note }: { label: string; value: number; of?: number; unit?: string; accent?: boolean; note?: string }) {
  return (
    <div className="rounded-2xl tactile p-4">
      <p className="label">{label}</p>
      <p className={`mt-1 font-display text-4xl sm:text-5xl font-extrabold tabular-nums ${accent ? "text-volt-2" : ""}`} aria-live="off">
        {value}{unit && <span className="text-lg text-mute ml-1">{unit}</span>}
        {of !== undefined && <span className="text-lg text-mute">/{of}</span>}
      </p>
      <p className="mt-1 h-4 font-mono text-[10px] text-mute truncate">{note ?? ""}</p>
    </div>
  );
}

function Stat({ k, v, mono }: { k: string; v: string; mono?: boolean }) {
  return <div><dt className="label">{k}</dt><dd className={`mt-1 ${mono ? "font-mono text-xs" : ""}`}>{v}</dd></div>;
}
