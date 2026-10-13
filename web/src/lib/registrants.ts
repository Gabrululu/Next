import type { Address, PublicClient } from "viem";
import { envioCovers, envioRegistrants } from "./envio";
import { nextAbi } from "./shared/abi";

export type RegistrantSource = "envio" | "rpc";

/**
 * Registrant list in on-chain order. Source order per spec: Envio indexer first, RPC fallback.
 * The indexer's answer is only used if it has exactly the on-chain registrantCount (a lagging or
 * unreachable indexer silently falls back to RPC); the source is always reported to the user.
 * Either way the verifier recomputes winners and compares them with the contract's getWinners().
 */
export async function loadRegistrants(client: PublicClient, contract: Address, id: bigint): Promise<{ list: Address[]; source: RegistrantSource }> {
  const total = await client.readContract({ address: contract, abi: nextAbi, functionName: "registrantCount", args: [id] });
  if (envioCovers(contract)) {
    try {
      const list = await envioRegistrants(id, Number(total));
      if (list.length === Number(total)) return { list, source: "envio" };
    } catch {
      /* fall through to RPC */
    }
  }
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
