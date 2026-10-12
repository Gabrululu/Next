// Independent verifier: recomputes a draw from public chain data only.
//   pnpm verify <campaignId> [--contract 0x…]     (default contract: NEXT_ADDRESS from .env)
// 0. re-checks the shared test vector (scripts/vector.json) against this TypeScript port
// 1. reads registrants + drawBlock from the contract
// 2. fetches drawBlock's hash straight from the RPC (not from the contract)
// 3. recomputes seed and winners with scripts/lib/select.ts (seed formula picked per contract version)
// 4. compares with what is stored on-chain and reports MATCH or the first mismatching index
import { readFileSync } from "node:fs";
import type { Address, Hex } from "viem";
import { nextAbi } from "./lib/abi.js";
import { publicClient, nextAddress } from "./lib/env.js";
import { deriveSeed, deriveSeedV1, firstMismatch, selectWinners } from "./lib/select.js";

const PAGE = 500n;

/** v3+ exposes pass(); the first deployments (v1/v2) didn't and used the 2-field seed. */
export async function detectSeedFormula(address: Address): Promise<"v3" | "v1"> {
  try {
    await publicClient.readContract({ address, abi: nextAbi, functionName: "pass" });
    return "v3";
  } catch {
    return "v1";
  }
}

export function checkVector() {
  const v = JSON.parse(readFileSync(new URL("./vector.json", import.meta.url), "utf8"));
  const seed = deriveSeed(v.blockHash, BigInt(v.campaignId), BigInt(v.registrants.length));
  const winners = selectWinners(seed, v.registrants, v.slots);
  return { seedMatches: seed === v.seed, mismatchAt: firstMismatch(winners, v.winners) };
}

export async function verifyCampaign(id: bigint, address: Address = nextAddress()) {
  const formula = await detectSeedFormula(address);
  const c = await publicClient.readContract({ address, abi: nextAbi, functionName: "getCampaign", args: [id] });
  if (!c.drawn) throw new Error(`Campaign ${id} has not been drawn yet (drawBlock ${c.drawBlock}).`);

  const total = await publicClient.readContract({ address, abi: nextAbi, functionName: "registrantCount", args: [id] });
  const registrants: Address[] = [];
  for (let start = 0n; start < total; start += PAGE) {
    const page = await publicClient.readContract({ address, abi: nextAbi, functionName: "getRegistrantsSlice", args: [id, start, PAGE] });
    registrants.push(...page);
  }

  const block = await publicClient.getBlock({ blockNumber: c.drawBlock });
  const seed: Hex = formula === "v3" ? deriveSeed(block.hash, id, BigInt(registrants.length)) : deriveSeedV1(block.hash, id);
  const expected = selectWinners(seed, registrants, c.slots);
  const onchain = await publicClient.readContract({ address, abi: nextAbi, functionName: "getWinners", args: [id] });

  const mismatchAt = firstMismatch(expected, onchain);
  return {
    id, address, formula, name: c.name, slots: c.slots, drawBlock: c.drawBlock, blockHash: block.hash,
    seed, onchainSeed: c.seed, registrants: registrants.length, expected, onchain,
    seedMatches: seed === c.seed, winnersMatch: mismatchAt === -1, mismatchAt,
  };
}

if (process.argv[1]?.replace(/\\/g, "/").endsWith("verify.ts")) {
  const args = process.argv.slice(2);
  const ci = args.indexOf("--contract");
  const contract = (ci >= 0 ? args[ci + 1] : undefined) as Address | undefined;
  const id = BigInt(args.find((a, i) => /^\d+$/.test(a) && args[i - 1] !== "--contract") ?? "1");

  const vec = checkVector();
  console.log(`Shared vector (scripts/vector.json): seed ${vec.seedMatches ? "MATCH" : "MISMATCH"}, winners ${vec.mismatchAt === -1 ? "MATCH" : `MISMATCH at index ${vec.mismatchAt}`}`);

  const r = await verifyCampaign(id, contract ?? nextAddress());
  console.log(`Campaign #${r.id} "${r.name}" on ${r.address} (seed formula ${r.formula})`);
  console.log(`  drawBlock        ${r.drawBlock}`);
  console.log(`  blockhash (RPC)  ${r.blockHash}`);
  console.log(`  seed recomputed  ${r.seed}`);
  console.log(`  seed on-chain    ${r.onchainSeed}  ${r.seedMatches ? "MATCH" : "MISMATCH"}`);
  console.log(`  registrants      ${r.registrants}, slots ${r.slots}, winners ${r.onchain.length}`);
  console.log(`  winners          ${r.winnersMatch ? "MATCH" : `MISMATCH at index ${r.mismatchAt} (expected ${r.expected[r.mismatchAt]}, on-chain ${r.onchain[r.mismatchAt]})`}`);
  if (!vec.seedMatches || vec.mismatchAt !== -1 || !r.seedMatches || !r.winnersMatch) process.exit(1);
  console.log("VERIFIED: vector and on-chain result both equal the independent recomputation.");
}
