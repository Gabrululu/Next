"use client";

import Link from "next/link";
import { useRef } from "react";
import { useReadContract, useReadContracts } from "wagmi";
import type { Address } from "viem";
import { LEGACY_NEXT_ADDRESS, NEXT_ADDRESS, contractQuery, hasLegacy, isConfigured } from "@/lib/config";
import { nextAbi } from "@/lib/shared/abi";

const LOOKBACK = 10; // how many recent campaigns to inspect
const POLL_MS = 15_000; // gentle on the public RPC (it rate-limits bursts)
const SHOW = 6;

type C = { name: string; slots: number; drawn: boolean; closeAt: bigint };

/**
 * The most recent campaigns actually on the deployed contract (real testnet data).
 * Finished campaigns nobody joined (failed test runs, accidental duplicates) are hidden,
 * and the heading says so; open ones are always shown, even when empty.
 */
export function RecentCampaigns() {
  return (
    <>
      <CampaignList contract={NEXT_ADDRESS} title="Live on testnet" />
      {hasLegacy && <CampaignList contract={LEGACY_NEXT_ADDRESS} title="Earlier contract version" note="before organizers were blocked from joining their own campaigns" />}
    </>
  );
}

function CampaignList({ contract, title, note }: { contract: Address; title: string; note?: string }) {
  const { data: total } = useReadContract({ address: contract, abi: nextAbi, functionName: "campaignCount", query: { enabled: isConfigured, refetchInterval: POLL_MS } });
  const n = Number(total ?? 0n);
  const ids = Array.from({ length: Math.min(n, LOOKBACK) }, (_, i) => BigInt(n - i));
  const { data } = useReadContracts({
    contracts: ids.flatMap((id) => [
      { address: contract, abi: nextAbi, functionName: "getCampaign", args: [id] } as const,
      { address: contract, abi: nextAbi, functionName: "registrantCount", args: [id] } as const,
    ]),
    query: { enabled: ids.length > 0, refetchInterval: POLL_MS },
  });
  // Remember the last good read per campaign so a single failed RPC call doesn't make a card vanish.
  const cache = useRef(new Map<string, { c: C; regs: bigint }>());
  if (data) ids.forEach((id, k) => {
    const c = data[k * 2]?.result as C | undefined;
    const regs = data[k * 2 + 1]?.result as bigint | undefined;
    if (c && regs !== undefined) cache.current.set(id.toString(), { c, regs });
  });

  if (!isConfigured || n === 0) return null;

  const nowSec = Date.now() / 1000;
  const rows = ids
    .map((id) => ({ id, hit: cache.current.get(id.toString()) }))
    .filter((r): r is { id: bigint; hit: { c: C; regs: bigint } } => !!r.hit)
    .map(({ id, hit }) => ({ id, c: hit.c, regs: hit.regs }))
    .map((r) => ({ ...r, open: !r.c.drawn && nowSec < Number(r.c.closeAt) }))
    .filter((r) => r.open || r.regs > 0n)
    .slice(0, SHOW);
  if (rows.length === 0) return null;

  return (
    <section aria-labelledby={`recent-${contract}`} className="mx-auto max-w-6xl px-4 sm:px-6 py-16">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 mb-6">
        <h2 id={`recent-${contract}`} className="t-h3 font-display font-bold">{title}</h2>
        <span className="label">{n} campaign{n === 1 ? "" : "s"}{note ? ` · ${note}` : ""} · finished ones nobody joined are hidden</span>
      </div>
      <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {rows.map(({ id, c, regs, open }) => (
          <li key={id.toString()} className="min-w-0">
            <Link href={`/c/${id}${contractQuery(contract)}`} className="glow block rounded-[1.75rem] tactile p-5 transition-transform duration-500 hover:-translate-y-1">
              <div className="flex justify-between label">
                <span>#{id.toString()}</span>
                <span className={open ? "text-volt-2" : ""}>{c.drawn ? "Drawn" : open ? "Open" : "Closed"}</span>
              </div>
              <p className="mt-3 font-display text-xl font-bold truncate">{c.name}</p>
              <p className="mt-2 text-sm text-mute">{regs.toString()} in line · {c.slots} slot{c.slots === 1 ? "" : "s"}</p>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
