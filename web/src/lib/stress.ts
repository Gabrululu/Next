"use client";

import { useEffect, useState } from "react";
import { CHAIN_ID } from "./config";

export type StressRun = {
  label: string;
  network: string;
  chainId: number;
  explorer: string;
  contract: string;
  campaignId: number;
  campaignName: string;
  startedAt: string;
  n: number;
  sent: number;
  confirmed: number;
  reverted: number;
  notFound: number;
  failedToSend: number;
  retried?: number;
  sendErrors: string[];
  registrantsOnChain: number;
  wallClockMs: number;
  sendPhaseMs: number;
  avgConfirmMs: number;
  p50ConfirmMs: number;
  p95ConfirmMs: number;
  blockRange: { first: number; last: number; span: number };
  perBlock: Record<string, number>;
  gas: { estimate: number; limit: number; maxFeePerGasWei: string; usedAvg: number };
  timeline: { i: number; hash: string | null; sentMs: number | null; confirmMs: number | null; block: number | null; status: string }[];
  draw: null | { tx: string; block: number; gasUsed: number; seed: string; winners: number; verified: boolean };
};

/** Loads the latest real testnet run written by scripts/stress.ts. Never falls back to sample data. */
export function useStressRun() {
  const [run, setRun] = useState<StressRun | null | undefined>(undefined);
  useEffect(() => {
    fetch("/stress/latest.json", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => setRun(j && j.chainId === CHAIN_ID ? j : null))
      .catch(() => setRun(null));
  }, []);
  return run;
}
