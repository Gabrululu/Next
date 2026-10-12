import type { Address, PublicClient } from "viem";
import { nextAbi } from "./shared/abi";

export type RegistrantSource = "envio" | "rpc";

/**
 * Registrant list in on-chain order. Source order per spec: Envio indexer first, RPC fallback.
 * Only the RPC path exists until the indexer is deployed (step 6); the source is always reported to the user.
 */
export async function loadRegistrants(client: PublicClient, contract: Address, id: bigint): Promise<{ list: Address[]; source: RegistrantSource }> {
  const total = await client.readContract({ address: contract, abi: nextAbi, functionName: "registrantCount", args: [id] });
  const list: Address[] = [];
  for (let start = 0n; start < total; start += 500n) {
    list.push(...(await client.readContract({ address: contract, abi: nextAbi, functionName: "getRegistrantsSlice", args: [id, start, 500n] })));
  }
  return { list, source: "rpc" };
}

/** v3+ exposes pass(); earlier deployments did not and used the 2-field seed formula. */
export async function detectSeedFormula(client: PublicClient, contract: Address): Promise<"v3" | "v1"> {
  try {
    await client.readContract({ address: contract, abi: nextAbi, functionName: "pass" });
    return "v3";
  } catch {
    return "v1";
  }
}
