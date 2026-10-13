"use client";

// Envio HyperIndex GraphQL client (Hasura). Optional: when NEXT_PUBLIC_ENVIO_GRAPHQL_URL is unset or the
// indexer is unreachable/slow, every caller falls back to direct contract reads over RPC.
// The indexer only covers the current deployment (NEXT_ADDRESS); legacy contracts always use RPC.
import { useEffect, useState } from "react";
import { getAddress, type Address } from "viem";
import { NEXT_ADDRESS } from "./config";

export const ENVIO_GRAPHQL_URL = process.env.NEXT_PUBLIC_ENVIO_GRAPHQL_URL ?? "";
export const hasEnvio = !!ENVIO_GRAPHQL_URL;

/** True when the indexer covers this contract. */
export const envioCovers = (contract: Address) => hasEnvio && contract.toLowerCase() === NEXT_ADDRESS.toLowerCase();

export async function gql<T>(query: string, variables: Record<string, unknown> = {}, timeoutMs = 4000): Promise<T> {
  if (!hasEnvio) throw new Error("Envio not configured");
  const res = await fetch(ENVIO_GRAPHQL_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ query, variables }),
    signal: AbortSignal.timeout(timeoutMs),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Envio HTTP ${res.status}`);
  const json = (await res.json()) as { data?: T; errors?: { message: string }[] };
  if (json.errors?.length) throw new Error(json.errors[0]!.message);
  return json.data as T;
}

export type LiveStats = {
  global?: { campaigns: number; registrations: number; draws: number; winners: number; passes: number };
  latest?: {
    id: string;
    name: string;
    slots: number;
    registrantCount: number;
    drawn: boolean;
    stats?: { registrations: number; blocksWithRegistrations: number; maxPerBlock: number; firstBlock?: string; lastBlock?: string; firstTimestamp?: number; lastTimestamp?: number };
    blocks: { blockNumber: string; registrations: number }[];
  };
};

const LIVE_QUERY = `query Live {
  GlobalStats(where: {id: {_eq: "global"}}) { campaigns registrations draws winners passes }
  Campaign(order_by: {createdBlock: desc}, limit: 1) { id name slots registrantCount drawn }
}`;
const CAMPAIGN_LIVE_QUERY = `query CampaignLive($id: String!) {
  CampaignStats(where: {id: {_eq: $id}}) { registrations blocksWithRegistrations maxPerBlock firstBlock lastBlock firstTimestamp lastTimestamp }
  CampaignBlockStat(where: {campaign_id: {_eq: $id}}, order_by: {blockNumber: desc}, limit: 60) { blockNumber registrations }
}`;

type LiveRaw = { GlobalStats: NonNullable<LiveStats["global"]>[]; Campaign: Omit<NonNullable<LiveStats["latest"]>, "stats" | "blocks">[] };
type CampaignRaw = { CampaignStats: NonNullable<NonNullable<LiveStats["latest"]>["stats"]>[]; CampaignBlockStat: { blockNumber: string; registrations: number }[] };

/**
 * Polls the indexer for the global counters and the most recent campaign's per-block registrations.
 * status: "off" (not configured) | "loading" | "live" | "error" (unreachable: the UI says so, no fake data).
 */
export function useLiveStats(intervalMs = 2000) {
  const [data, setData] = useState<LiveStats>();
  const [status, setStatus] = useState<"off" | "loading" | "live" | "error">(hasEnvio ? "loading" : "off");
  useEffect(() => {
    if (!hasEnvio) return;
    let stop = false;
    const tick = async () => {
      try {
        const live = await gql<LiveRaw>(LIVE_QUERY);
        const c = live.Campaign[0];
        let latest: LiveStats["latest"];
        if (c) {
          const d = await gql<CampaignRaw>(CAMPAIGN_LIVE_QUERY, { id: c.id });
          latest = { ...c, stats: d.CampaignStats[0], blocks: [...d.CampaignBlockStat].reverse() };
        }
        if (!stop) { setData({ global: live.GlobalStats[0], latest }); setStatus("live"); }
      } catch {
        if (!stop) setStatus("error");
      }
    };
    void tick();
    const t = setInterval(tick, intervalMs);
    return () => { stop = true; clearInterval(t); };
  }, [intervalMs]);
  return { data, status };
}

const REGISTRANTS_QUERY = `query Registrants($id: String!, $offset: Int!) {
  Registration(where: {campaign_id: {_eq: $id}}, order_by: {index: asc}, limit: 1000, offset: $offset) { account index }
}`;

/** Registrants in arrival order from the indexer (paged). Caller must cross-check the count on-chain. */
export async function envioRegistrants(id: bigint, expected: number): Promise<Address[]> {
  const out: Address[] = [];
  while (out.length < expected) {
    const d = await gql<{ Registration: { account: string; index: number }[] }>(REGISTRANTS_QUERY, { id: id.toString(), offset: out.length }, 8000);
    if (!d.Registration.length) break;
    for (const r of d.Registration) {
      if (r.index !== out.length) throw new Error("Envio registrant order has a gap");
      out.push(getAddress(r.account));
    }
  }
  return out;
}

const RECENT_QUERY = `query Recent($id: String!) {
  Registration(where: {campaign_id: {_eq: $id}}, order_by: {index: desc}, limit: 5) { account index blockNumber timestamp }
}`;
export type RecentJoin = { account: string; index: number; blockNumber: string; timestamp: number };

/** Latest arrivals for one campaign from the indexer; undefined when Envio doesn't cover it or is unreachable. */
export function useRecentJoins(contract: Address, id: bigint, intervalMs = 3000) {
  const [joins, setJoins] = useState<RecentJoin[]>();
  useEffect(() => {
    if (!envioCovers(contract) || id === 0n) return;
    let stop = false;
    const tick = () =>
      gql<{ Registration: RecentJoin[] }>(RECENT_QUERY, { id: id.toString() })
        .then((d) => { if (!stop) setJoins(d.Registration); })
        .catch(() => { if (!stop) setJoins(undefined); });
    void tick();
    const t = setInterval(tick, intervalMs);
    return () => { stop = true; clearInterval(t); };
  }, [contract, id, intervalMs]);
  return joins;
}
