// AUTO-COPIED from scripts/lib/select.ts by scripts/gen-abi.mjs — edit the original.
// Exact TypeScript port of Next.sol's draw(). Shared by the verifier, the vector
// generator and the web app (/verify/[id]). Any change here must match the contract.
import { encodeAbiParameters, keccak256, type Address, type Hex } from "viem";

/** seed = keccak256(abi.encode(blockhash(drawBlock), campaignId, registrantCount)) */
export function deriveSeed(blockHash: Hex, campaignId: bigint, registrantCount: bigint): Hex {
  return keccak256(
    encodeAbiParameters(
      [{ type: "bytes32" }, { type: "uint256" }, { type: "uint256" }],
      [blockHash, campaignId, registrantCount],
    ),
  );
}

/** Seed formula of the first deployment (v1/v2), which did not include the registrant count. */
export function deriveSeedV1(blockHash: Hex, campaignId: bigint): Hex {
  return keccak256(encodeAbiParameters([{ type: "bytes32" }, { type: "uint256" }], [blockHash, campaignId]));
}

/** First index where two winner lists differ (case-insensitive), or -1 if identical. */
export function firstMismatch(a: readonly string[], b: readonly string[]): number {
  const n = Math.max(a.length, b.length);
  for (let i = 0; i < n; i++) if (a[i]?.toLowerCase() !== b[i]?.toLowerCase()) return i;
  return -1;
}

/** Partial Fisher-Yates over a virtual [0..n) array. Returns winner indices in pick order. */
export function selectIndices(seed: Hex, n: number, slots: number): number[] {
  if (n <= slots) return Array.from({ length: n }, (_, i) => i);
  const swap = new Map<number, number>();
  const out: number[] = [];
  for (let i = 0; i < slots; i++) {
    const r = BigInt(
      keccak256(encodeAbiParameters([{ type: "bytes32" }, { type: "uint256" }], [seed, BigInt(i)])),
    );
    const j = i + Number(r % BigInt(n - i));
    const vj = swap.get(j) ?? j;
    const vi = swap.get(i) ?? i;
    swap.set(j, vi);
    out.push(vj);
  }
  return out;
}

export function selectWinners(seed: Hex, registrants: readonly Address[], slots: number): Address[] {
  return selectIndices(seed, registrants.length, slots).map((i) => registrants[i]);
}
