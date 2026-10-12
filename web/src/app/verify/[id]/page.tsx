"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import { use, useEffect, useState } from "react";
import type { Address, Hex } from "viem";
import { usePublicClient } from "wagmi";
import { Reveal } from "@/components/Reveal";
import { Stage } from "@/components/Stage";
import { Terminal } from "@/components/Terminal";
import { contractQuery, explorerBlock, resolveContract, short } from "@/lib/config";
import { nextAbi } from "@/lib/shared/abi";
import { deriveSeed, deriveSeedV1, firstMismatch, selectIndices } from "@/lib/shared/select";
import { detectSeedFormula, loadRegistrants } from "@/lib/registrants";

type Result = {
  name: string; slots: number; drawBlock: bigint; blockHash: Hex; seed: Hex; onchainSeed: Hex;
  registrants: Address[]; picks: number[]; onchain: readonly Address[]; seedOk: boolean; winnersOk: boolean; mismatchAt: number;
};

type Step = { label: string; state: "wait" | "run" | "ok" | "bad"; detail?: string };

export default function VerifyPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ contract?: string }> }) {
  const { id: raw } = use(params);
  const { address: contract, legacy } = resolveContract(use(searchParams).contract);
  const id = /^\d+$/.test(raw) ? BigInt(raw) : 0n;
  const client = usePublicClient();
  const [steps, setSteps] = useState<Step[]>([]);
  const [res, setRes] = useState<Result>();
  const [err, setErr] = useState<string>();

  useEffect(() => {
    if (!client || id === 0n) return;
    let cancelled = false;
    const s: Step[] = [
      { label: "Read campaign from contract", state: "wait" },
      { label: "Fetch seed block hash directly from the RPC", state: "wait" },
      { label: "Recompute the seed from the block hash", state: "wait" },
      { label: "Download every registrant in on-chain order", state: "wait" },
      { label: "Run partial Fisher-Yates locally, in your browser", state: "wait" },
      { label: "Compare with the winners stored on-chain", state: "wait" },
    ];
    const upd = (i: number, state: Step["state"], detail?: string) => {
      s[i] = { ...s[i], state, detail };
      if (!cancelled) setSteps([...s]);
    };
    (async () => {
      try {
        upd(0, "run");
        const c = await client.readContract({ address: contract, abi: nextAbi, functionName: "getCampaign", args: [id] });
        if (!c.drawn) throw new Error("This campaign hasn't been drawn yet. Come back after the draw.");
        upd(0, "ok", `"${c.name}" · ${c.slots} slots · seed block #${c.drawBlock}`);

        upd(1, "run");
        const block = await client.getBlock({ blockNumber: c.drawBlock });
        upd(1, "ok", block.hash);

        // Registrants first: the v3 seed includes their count.
        upd(3, "run");
        const { list: registrants, source } = await loadRegistrants(client, contract, id);
        upd(3, "ok", `${registrants.length} registrants · source: ${source === "envio" ? "Envio indexer" : "RPC (contract reads)"}`);

        upd(2, "run");
        const formula = await detectSeedFormula(client, contract);
        const seed = formula === "v3" ? deriveSeed(block.hash, id, BigInt(registrants.length)) : deriveSeedV1(block.hash, id);
        const seedOk = seed === c.seed;
        const formulaText = formula === "v3" ? "keccak256(abi.encode(blockhash, campaignId, registrantCount))" : "keccak256(abi.encode(blockhash, campaignId)) · previous contract version";
        upd(2, seedOk ? "ok" : "bad", `${formulaText}
${seed} ${seedOk ? "= on-chain seed" : `≠ on-chain ${c.seed}`}`);

        upd(4, "run");
        const picks = selectIndices(seed, registrants.length, c.slots);
        upd(4, "ok", registrants.length <= c.slots ? `${registrants.length} in line for ${c.slots} slots: everyone wins, no shuffle needed` : `${picks.length} picks`);

        upd(5, "run");
        const onchain = await client.readContract({ address: contract, abi: nextAbi, functionName: "getWinners", args: [id] });
        const mine = picks.map((i) => registrants[i]);
        const mismatchAt = firstMismatch(mine, onchain);
        const winnersOk = mismatchAt === -1;
        upd(5, winnersOk ? "ok" : "bad", winnersOk
          ? `MATCH · all ${onchain.length} winners, in the same order`
          : `MISMATCH at index ${mismatchAt}: recomputed ${mine[mismatchAt] ?? "(none)"}, on-chain ${onchain[mismatchAt] ?? "(none)"}`);

        if (!cancelled) setRes({ name: c.name, slots: c.slots, drawBlock: c.drawBlock, blockHash: block.hash, seed, onchainSeed: c.seed, registrants, picks, onchain, seedOk, winnersOk, mismatchAt });
      } catch (e) {
        const i = s.findIndex((x) => x.state === "run");
        if (i >= 0) upd(i, "bad");
        if (!cancelled) setErr((e as Error).message.split("\n")[0]);
      }
    })();
    return () => { cancelled = true; };
  }, [client, id, contract]);

  const verified = res?.seedOk && res?.winnersOk;
  const passed = steps.filter((x) => x.state === "ok").length;
  const failed = steps.some((x) => x.state === "bad") || !!err;
  const verdict = res ? (verified ? "ok" : "bad") : failed ? "bad" : "run";

  return (
    <div className="mx-auto max-w-6xl px-4 sm:px-6 pt-16 sm:pt-24 pb-10">
      <Reveal><p className="label">Verify · campaign #{raw}{legacy ? " · previous contract version" : ""}</p></Reveal>
      <h1 className="t-hero font-display font-extrabold mt-5">
        <span className="word-in inline-block">Don&apos;t trust us.</span>{" "}
        <span className="word-in inline-block text-mute" style={{ animationDelay: "120ms" }}>Recompute it.</span>
      </h1>
      <p className="t-lead text-mute mt-8 max-w-[44ch] word-in" style={{ animationDelay: "240ms" }}>
        This page re-runs the draw in your browser using only public chain data and the same algorithm as the contract.
      </p>

      <div className="mt-14 grid grid-cols-1 gap-6 lg:grid-cols-[1.4fr_1fr] items-start">
        {/* step log */}
        <Reveal>
          <Stage title="verifier · running in your browser" right={`${passed}/${steps.length || 6} checks`}>
            <ol className="p-5 sm:p-7">
              {steps.map((st, i) => (
                <motion.li key={i} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.05 }}
                  className="relative grid grid-cols-[auto_1fr] gap-x-4 pb-6 last:pb-0">
                  {i < steps.length - 1 && (
                    <span aria-hidden className={`absolute left-[15px] top-9 bottom-1 w-px ${st.state === "ok" ? "bg-ok/40" : "bg-line"}`} />
                  )}
                  <StateBadge state={st.state} n={i + 1} />
                  <div className="min-w-0 pt-1">
                    <p className={`font-semibold ${st.state === "wait" ? "text-mute" : ""}`}>{st.label}</p>
                    {st.detail && <p className="mt-1 font-mono text-xs text-mute break-all whitespace-pre-line">{st.detail}</p>}
                  </div>
                </motion.li>
              ))}
            </ol>
          </Stage>
        </Reveal>

        {/* verdict */}
        <Reveal delay={120} className="lg:sticky lg:top-24">
          <section aria-label="Result" className="rounded-[2rem] tactile p-6 sm:p-8">
            {/* keyed so the new verdict re-animates in; no exit wait, so it never lags behind the checks */}
            <motion.div key={verdict} initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.3 }}>
                <span className={`squircle grid place-items-center size-16 ${verdict === "ok" ? "bg-ok text-ink" : verdict === "bad" ? "bg-bad text-ink" : "bg-volt/20 text-volt-2"}`} aria-hidden>
                  {verdict === "ok" ? <Check className="size-8" /> : verdict === "bad" ? <span className="font-display text-3xl font-extrabold">!</span> : <span className="size-6 rounded-full border-2 border-volt-2 border-t-transparent animate-spin motion-reduce:animate-none" />}
                </span>
                <p role="status" className={`mt-6 t-h3 font-display font-extrabold ${verdict === "ok" ? "text-ok" : verdict === "bad" ? "text-bad" : ""}`}>
                  {verdict === "ok" ? "MATCH. The draw is honest to its seed." : verdict === "bad" ? (res ? (res.seedOk ? `MISMATCH at winner index ${res.mismatchAt}. Do not trust this result.` : "MISMATCH: the seed differs. Do not trust this result.") : "Couldn't verify.") : "Recomputing…"}
                </p>
                {err && <p role="alert" className="mt-3 text-sm text-bad">{err}</p>}
            </motion.div>

            <dl className="mt-8 grid grid-cols-3 gap-3 text-sm border-t border-line pt-5">
              <div><dt className="label">Seed block</dt><dd className="mt-1 font-mono truncate">{res ? <a className="underline" href={explorerBlock(res.drawBlock)} target="_blank" rel="noreferrer">#{res.drawBlock.toString()}</a> : "…"}</dd></div>
              <div><dt className="label">Entrants</dt><dd className="mt-1 font-mono">{res ? res.registrants.length : "…"}</dd></div>
              <div><dt className="label">Winners</dt><dd className="mt-1 font-mono">{res ? res.onchain.length : "…"}</dd></div>
            </dl>
            <Link href={`/c/${raw}${contractQuery(contract)}`} className="glow mt-6 block rounded-2xl border border-line px-5 py-3 text-center font-semibold">← Back to campaign</Link>
          </section>
        </Reveal>
      </div>

      {/* pick by pick */}
      {res && res.registrants.length > res.slots && (
        <section aria-labelledby="picks-h" className="mt-20">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <Reveal><h2 id="picks-h" className="t-h2 font-display font-extrabold">Pick by pick</h2></Reveal>
            <span className="label">pool index → address</span>
          </div>
          <details className="mt-8 group">
            <summary className="glow inline-flex cursor-pointer list-none rounded-2xl tactile px-5 py-3 font-semibold">
              <span className="group-open:hidden">Show all {res.picks.length} picks</span>
              <span className="hidden group-open:inline">Hide picks</span>
            </summary>
            <ol className="mt-6 grid gap-2 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 font-mono text-xs">
              {res.picks.map((p, i) => (
                <li key={i} className="min-w-0 flex items-center gap-3 rounded-2xl tactile px-3 py-2.5">
                  <span className="squircle grid grid-cols-1 place-items-center size-7 shrink-0 bg-volt/20 text-volt-2 text-[10px]">{i + 1}</span>
                  <span className="text-mute">[{p}]</span>
                  <span className="truncate">{short(res.registrants[p], 6)}</span>
                </li>
              ))}
            </ol>
          </details>
        </section>
      )}

      {/* do it yourself */}
      <section aria-labelledby="diy-h" className="mt-20 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="lg:col-span-2"><Reveal><h2 id="diy-h" className="t-h2 font-display font-extrabold">Or run it yourself</h2></Reveal></div>
        <Reveal><Terminal title="terminal" code={`cd scripts && pnpm install\npnpm verify ${raw} --contract ${contract}`} /></Reveal>
        <Reveal delay={100}>
          <Terminal title="the algorithm, in full" code={`seed = keccak256(abi.encode(blockhash(drawBlock), campaignId, n))
if n <= slots: everyone wins
for i in 0..slots-1:
    j = i + uint256(keccak256(abi.encode(seed, i))) % (n - i)
    winner[i] = pool[j];  pool[j] = pool[i]   // virtual swap`} />
        </Reveal>
        <p className="lg:col-span-2 text-sm text-mute max-w-prose">
          A shared test vector, checked by both the Foundry tests and the TypeScript tests, shows that the Solidity and TypeScript versions return the same winners.
        </p>
      </section>
    </div>
  );
}

function Check({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden>
      <path d="M5 12.5l4.2 4.2L19 7" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function StateBadge({ state, n }: { state: Step["state"]; n: number }) {
  const txt = { wait: "pending", run: "running", ok: "passed", bad: "failed" } as const;
  const cls = {
    wait: "bg-ink-3 text-mute",
    run: "bg-volt/25 text-volt-2",
    ok: "bg-ok text-ink",
    bad: "bg-bad text-ink",
  }[state];
  return (
    <span role="img" aria-label={`Step ${n}: ${txt[state]}`} className={`squircle relative z-10 grid place-items-center size-8 font-mono text-xs font-bold transition-colors duration-300 ${cls}`}>
      {state === "ok" ? <Check className="size-4" /> : state === "bad" ? "!" : state === "run" ? <span className="size-3.5 rounded-full border-2 border-current border-t-transparent animate-spin motion-reduce:animate-none" /> : n}
    </span>
  );
}
