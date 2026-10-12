// Generates the shared test vector consumed by BOTH the Foundry test (contracts/test/Next.t.sol)
// and scripts/test-vector.ts. Inputs are fixed; outputs come from the TS port of the algorithm.
// The Solidity test then proves the contract produces the same winners.
import { writeFileSync } from "node:fs";
import { keccak256, toHex, getAddress, pad, type Address } from "viem";
import { deriveSeed, selectWinners } from "./lib/select.js";

const campaignId = 1n;
const slots = 7;
const registrants: Address[] = Array.from({ length: 25 }, (_, i) =>
  getAddress(pad(toHex(0x1000 + i), { size: 20 })),
);
const blockHash = keccak256(toHex("next-test-vector"));
const seed = deriveSeed(blockHash, campaignId, BigInt(registrants.length));
const winners = selectWinners(seed, registrants, slots);

const vector = {
  _note: "Shared Solidity/TypeScript test vector. Inputs are fixed; outputs come from scripts/lib/select.ts and are asserted by contracts/test/Next.t.sol.",
  campaignId: Number(campaignId), slots, blockHash, seed, registrants, winners,
};
writeFileSync(new URL("./vector.json", import.meta.url), JSON.stringify(vector, null, 2) + "\n");
console.log(vector);
