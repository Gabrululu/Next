"use client";

import Link from "next/link";
import { useT } from "@/lib/i18n";
import { useRef } from "react";
import { useReadContract, useReadContracts } from "wagmi";
import type { Address } from "viem";
import { LEGACY_NEXT_ADDRESS, NEXT_ADDRESS, contractQuery, hasLegacy, isConfigured } from "@/lib/config";
import { nextAbi } from "@/lib/shared/abi";

const LOOKBACK = 10; // how many recent campaigns to inspect per contract
const POLL_MS = 15_000; // gentle on the RPC
const SHOW = 6;
/** Internal test runs (stress tests, smoke tests) are real on-chain data but not events: they stay off the landing page. */
const IS_TEST = /simulated entrants|smoke test/i;

type C = { name: string; slots: number; drawn: boolean; closeAt: bigint };
type Row = { contract: Address; id: bigint; c: C; regs: bigint; open: boolean };

/** Real campaigns from the deployed contract(s), newest first. Empty finished ones and test runs are hidden. */
export function RecentCampaigns() {
  const current = useRows(NEXT_ADDRESS, true);
  const legacy = useRows(LEGACY_NEXT_ADDRESS, hasLegacy);
  const t = useT();
  const rows = [...current, ...legacy].slice(0, SHOW);
  if (!isConfigured || rows.length === 0) return null;

  return (
    <section aria-labelledby="recent-h" className="mx-auto max-w-6xl px-4 sm:px-6 py-16">
      <h2 id="recent-h" className="t-h3 font-display font-bold mb-6">{t("Recent campaigns")}</h2>
      <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {rows.map(({ contract, id, c, regs, open }) => (
          <li key={`${contract}-${id}`} className="min-w-0">
            <Link href={`/c/${id}${contractQuery(contract)}`} className="glow block rounded-[1.75rem] tactile p-5 transition-transform duration-500 hover:-translate-y-1">
              <div className="flex justify-end label">
                <span className={open ? "text-volt-2" : ""}>{c.drawn ? t("Drawn") : open ? t("Open") : t("Closed")}</span>
              </div>
              <p className="mt-3 font-display text-xl font-bold truncate">{c.name}</p>
              <p className="mt-2 text-sm text-mute">{t(c.slots === 1 ? "{n} in line · {s} spot" : "{n} in line · {s} spots", { n: regs.toString(), s: c.slots })}</p>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

function useRows(contract: Address, enabled: boolean): Row[] {
  const { data: total } = useReadContract({ address: contract, abi: nextAbi, functionName: "campaignCount", query: { enabled: isConfigured && enabled, refetchInterval: POLL_MS } });
  const n = Number(total ?? 0n);
  const ids = Array.from({ length: Math.min(n, LOOKBACK) }, (_, i) => BigInt(n - i));
  const { data } = useReadContracts({
    contracts: ids.flatMap((id) => [
      { address: contract, abi: nextAbi, functionName: "getCampaign", args: [id] } as const,
      { address: contract, abi: nextAbi, functionName: "registrantCount", args: [id] } as const,
    ]),
    query: { enabled: enabled && ids.length > 0, refetchInterval: POLL_MS },
  });
  // Remember the last good read per campaign so a single failed RPC call doesn't make a card vanish.
  const cache = useRef(new Map<string, { c: C; regs: bigint }>());
  if (data) ids.forEach((id, k) => {
    const c = data[k * 2]?.result as C | undefined;
    const regs = data[k * 2 + 1]?.result as bigint | undefined;
    if (c && regs !== undefined) cache.current.set(id.toString(), { c, regs });
  });
  if (!enabled) return [];
  const nowSec = Date.now() / 1000;
  return ids
    .map((id) => ({ id, hit: cache.current.get(id.toString()) }))
    .filter((r): r is { id: bigint; hit: { c: C; regs: bigint } } => !!r.hit)
    .map(({ id, hit }) => ({ contract, id, c: hit.c, regs: hit.regs, open: !hit.c.drawn && nowSec < Number(hit.c.closeAt) }))
    .filter((r) => !IS_TEST.test(r.c.name) && (r.open || r.regs > 0n));
}
