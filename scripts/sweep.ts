// Returns leftover MON from the stress test's throwaway wallets to the deployer.
//   pnpm sweep [--wallets <runId>] [--dry-run]
// Without --wallets it scans every key file in scripts/.wallets/.
//
// Monad specifics (https://docs.monad.xyz/developer-essentials/reserve-balance, docs.monad.xyz gas pricing):
// - Gas is charged on the gas LIMIT, so a plain transfer costs exactly 21000 * effective gas price.
// - Emptying a wallet below the 10 MON reserve is allowed only as an "emptying transaction": undelegated
//   sender with no other tx in the last k=3 blocks. Throwaway wallets qualify (one register() long ago),
//   and this script sends at most one tx per wallet.
// - A wallet is only swept when it holds more than twice the transfer fee; sweeping dust would burn more
//   MON than it returns. Skipped dust is reported, never hidden.
import { readdirSync, readFileSync } from "node:fs";
import { formatEther, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { publicClient, CHAIN_ID, deployerKey } from "./lib/env.js";

const arg = (name: string) => {
  const i = process.argv.indexOf(`--${name}`);
  if (i === -1) return undefined;
  const v = process.argv[i + 1];
  return v && !v.startsWith("--") ? v : "true";
};
const DRY = arg("dry-run") === "true";
const ONLY = arg("wallets");
const log = (...a: unknown[]) => console.log(`[${new Date().toISOString().slice(11, 23)}]`, ...a);

const deployer = privateKeyToAccount(deployerKey()).address;
const dir = new URL("./.wallets/", import.meta.url);
const files = ONLY ? [`${ONLY}.json`] : readdirSync(dir).filter((f) => f.endsWith(".json"));
const keys = [...new Set(files.flatMap((f) => JSON.parse(readFileSync(new URL(f, dir), "utf8")) as Hex[]))];
const accounts = keys.map((k) => privateKeyToAccount(k));
log(`${accounts.length} throwaway wallets in ${files.length} file(s)`);

const GAS = 21_000n; // explicit limit for a plain transfer (Monad charges the full limit)
const { baseFeePerGas } = await publicClient.getBlock();
// maxFee = base fee: the effective price is min(maxFee, base + tip), so nothing is left as dust when the base
// fee stays put (Monad testnet sits at its 100 gwei floor). If it rises, the tx just isn't included.
const maxFeePerGas = baseFeePerGas!;
const fee = GAS * maxFeePerGas;

const balances: bigint[] = [];
for (let i = 0; i < accounts.length; i += 20) {
  // small sequential chunks: the public RPC rate-limits large batches
  balances.push(...(await Promise.all(accounts.slice(i, i + 20).map((a) => publicClient.getBalance({ address: a.address })))));
}
const total = balances.reduce((a, b) => a + b, 0n);
const sweepable = accounts.map((a, i) => ({ a, bal: balances[i]! })).filter((x) => x.bal > fee * 2n);
const dust = balances.filter((b) => b > 0n && b <= fee * 2n);
const recover = sweepable.reduce((s, x) => s + x.bal - fee, 0n);

log(`Transfer fee ${formatEther(fee)} MON (${GAS} gas x ${maxFeePerGas} wei)`);
log(`Leftover in all wallets: ${formatEther(total)} MON`);
log(`Sweepable: ${sweepable.length} wallets -> ${formatEther(recover)} MON back to ${deployer} (fees ${formatEther(fee * BigInt(sweepable.length))})`);
log(`Skipped as dust (sweeping would cost more than it returns): ${dust.length} wallets, ${formatEther(dust.reduce((a, b) => a + b, 0n))} MON`);
if (DRY || !sweepable.length) {
  log(DRY ? "Dry run: nothing sent." : "Nothing worth sweeping.");
  process.exit(0);
}

let ok = 0, failed = 0, returned = 0n;
for (let i = 0; i < sweepable.length; i += 10) {
  await Promise.all(sweepable.slice(i, i + 10).map(async ({ a, bal }) => {
    try {
      const nonce = await publicClient.getTransactionCount({ address: a.address });
      const raw = await a.signTransaction({
        chainId: CHAIN_ID, type: "eip1559", to: deployer, value: bal - fee, nonce, gas: GAS, maxFeePerGas, maxPriorityFeePerGas: 0n,
      });
      const hash = await publicClient.request({ method: "eth_sendRawTransaction", params: [raw] });
      const r = await publicClient.waitForTransactionReceipt({ hash, pollingInterval: 300, retryCount: 20 });
      if (r.status === "success") { ok++; returned += bal - fee; } else failed++;
    } catch (e) {
      failed++;
      log(`  ${a.address}: ${(e as Error).message.split("\n")[0]}`);
    }
  }));
  log(`  ${Math.min(i + 10, sweepable.length)}/${sweepable.length} processed`);
}
log(`Swept ${ok} wallets, ${failed} failed, ${formatEther(returned)} MON returned to the deployer`);
