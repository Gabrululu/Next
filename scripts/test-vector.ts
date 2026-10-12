// Re-checks the committed vector against the TS algorithm (the Foundry test checks it against Solidity).
import { readFileSync } from "node:fs";
import { deriveSeed, firstMismatch, selectWinners } from "./lib/select.js";

const v = JSON.parse(readFileSync(new URL("./vector.json", import.meta.url), "utf8"));
const seed = deriveSeed(v.blockHash, BigInt(v.campaignId), BigInt(v.registrants.length));
const winners = selectWinners(seed, v.registrants, v.slots);
const ok = seed === v.seed && JSON.stringify(winners) === JSON.stringify(v.winners);

// Edge case: fewer registrants than slots -> everyone wins, in registration order.
const few = selectWinners(seed, v.registrants.slice(0, 3), v.slots);
const okFew = JSON.stringify(few) === JSON.stringify(v.registrants.slice(0, 3));

// Mismatch reporting: tamper with one winner and the verifier must point at that exact index.
const tampered = [...v.winners];
tampered[4] = "0x000000000000000000000000000000000000dEaD";
const okMismatch = firstMismatch(winners, tampered) === 4 && firstMismatch(winners, v.winners) === -1
  && firstMismatch(winners, v.winners.slice(0, 5)) === 5;

console.log(ok && okFew && okMismatch ? "PASS: TS selection matches shared vector (incl. mismatch index reporting)" : "FAIL");
if (!(ok && okFew && okMismatch)) process.exit(1);
