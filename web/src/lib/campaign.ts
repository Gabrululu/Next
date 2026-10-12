"use client";

import { useEffect, useState } from "react";
import { useBlockNumber, useReadContract } from "wagmi";
import { nextAbi } from "./shared/abi";
import type { Address } from "viem";
import { NEXT_ADDRESS } from "./config";

export type Phase = "upcoming" | "open" | "sealing" | "drawable" | "drawn";

export const BLOCK_MS = 300; // docs.monad.xyz: 300 ms blocks (measured ~302 ms)

export function useNow(intervalMs = 250) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}

export function useCampaign(id: bigint, contract: Address = NEXT_ADDRESS) {
  const enabled = id > 0n;
  const campaign = useReadContract({
    address: contract, abi: nextAbi, functionName: "getCampaign", args: [id],
    query: { enabled, refetchInterval: 2000 },
  });
  const count = useReadContract({
    address: contract, abi: nextAbi, functionName: "registrantCount", args: [id],
    query: { enabled, refetchInterval: 1500 },
  });
  const { data: block } = useBlockNumber({ watch: { enabled: true, pollingInterval: 1000 } });
  const now = useNow();

  const c = campaign.data;
  let phase: Phase | undefined;
  if (c) {
    const sec = now / 1000;
    if (c.drawn) phase = "drawn";
    else if (sec < Number(c.openAt)) phase = "upcoming";
    else if (sec < Number(c.closeAt) && (block === undefined || block < c.drawBlock)) phase = "open";
    else if (block !== undefined && block > c.drawBlock) phase = "drawable";
    else phase = "sealing";
  }
  const blocksToSeed = c && block !== undefined ? Number(c.drawBlock - block) : undefined;

  return {
    campaign: c,
    error: campaign.error,
    isLoading: campaign.isLoading,
    registrants: count.data,
    block,
    now,
    phase,
    blocksToSeed,
    refetch: () => { campaign.refetch(); count.refetch(); },
  };
}

export function fmtDuration(ms: number) {
  if (ms <= 0) return "0s";
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
  if (d) return `${d}d ${h}h ${m}m`;
  if (h) return `${h}h ${m}m ${r}s`;
  if (m) return `${m}m ${r}s`;
  return `${r}s`;
}

/** Locale-independent integer formatting (same output on server and client, avoids hydration mismatches). */
const INT = new Intl.NumberFormat("en-US");
export const fmtInt = (n: number | bigint) => INT.format(n);
