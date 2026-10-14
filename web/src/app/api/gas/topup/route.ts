// Network-fee top-up for email (Dynamic embedded) accounts.
//
// Why this exists: Dynamic's gas sponsorship relies on an EIP-7702 delegation contract
// (0x0000Fb7702036ff9f76044a501ac1aA74cbab16b) that is deployed on Sepolia / Base Sepolia but has no code on
// Monad testnet, so sponsored transactions can't run there. Instead, the app sends the account exactly the MON
// one transaction needs, from a dedicated testnet wallet, and the account then pays its own fee.
//
// POST /api/gas/topup  { data: 0x… }   Authorization: Bearer <Dynamic access token>
// Guards:
// - valid Dynamic session (JWKS, RS256, user:basic); the funded address must be one of the session's
//   verified addresses
// - only calls to the Next contract, and the call must succeed in simulation (estimateGas), so nobody can
//   drain the wallet with arbitrary gas requests
// - amount = explicit gas limit × max fee, minus what the account already holds; per-tx cap
// - per-user and global daily limits in Upstash; without Upstash it refuses (fails closed)
import { createWalletClient, fallback, formatEther, getAddress, http, isHex, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { appChain, NEXT_ADDRESS, RPC_URL } from "@/lib/config";
import { AuthError, verifyDynamicToken } from "@/lib/server/dynamicAuth";
import { hasRedis, redis, serverClient } from "@/lib/server/services";

const KEY = (process.env.GAS_TOPUP_PRIVATE_KEY ?? "") as Hex;
const ALCHEMY = process.env.ALCHEMY_RPC_URL ?? "";

const MAX_PER_TX = 50_000_000_000_000_000n; // 0.05 MON: well above any Next call (createCampaign ≈ 0.03 at the 100 gwei floor)
const USER_DAILY_TOPUPS = 20;
const GLOBAL_DAILY_WEI = 3_000_000_000_000_000_000n; // 3 MON per day across all users
const TRANSFER_GAS = 21_000n; // explicit limit: Monad charges the full limit
const SETTLE_BLOCKS = 10n; // Monad RPC rejected spends right after funding until ~10 blocks passed (measured)

const json = (body: unknown, status = 200) => Response.json(body, { status });
const day = () => new Date().toISOString().slice(0, 10);

export async function POST(req: Request) {
  if (!/^0x[0-9a-fA-F]{64}$/.test(KEY) || !hasRedis) return json({ error: "Fee top-up is not configured" }, 501);

  let user;
  try { user = await verifyDynamicToken(req.headers.get("authorization")); }
  catch (e) { return json({ error: e instanceof AuthError ? e.message : "Invalid session" }, 401); }

  const body = (await req.json().catch(() => ({}))) as { data?: unknown; address?: unknown };
  if (!isHex(body.data) || typeof body.address !== "string" || !/^0x[0-9a-fA-F]{40}$/.test(body.address)) return json({ error: "Bad request" }, 400);
  const to = getAddress(body.address);
  if (!user.addresses.includes(to.toLowerCase())) return json({ error: "That account isn't yours" }, 403);

  // Exact need for THIS call; reverts in simulation (e.g. already registered) get no MON.
  let need: bigint;
  try {
    const gas = ((await serverClient.estimateGas({ account: to, to: NEXT_ADDRESS, data: body.data })) * 12n) / 10n; // same margin as the client
    const { maxFeePerGas } = await serverClient.estimateFeesPerGas();
    const balance = await serverClient.getBalance({ address: to });
    need = gas * maxFeePerGas! - balance;
  } catch {
    return json({ error: "That action would fail, so no fee was sent." }, 400);
  }
  if (need <= 0n) return json({ ok: true, sent: "0" });
  if (need > MAX_PER_TX) return json({ error: "Fee too high to cover" }, 400);

  // Daily limits (counted before sending; failed sends still count, which errs on the safe side).
  const userKey = `next:topup:${day()}:user:${user.userId}`;
  const totalKey = `next:topup:${day()}:wei`;
  const count = await redis<number>("INCR", userKey);
  if (count === 1) await redis("EXPIRE", userKey, 60 * 60 * 26);
  if (count > USER_DAILY_TOPUPS) return json({ error: "Daily fee limit reached for this account. Try again tomorrow." }, 429);
  const total = BigInt(await redis<number>("INCRBY", totalKey, need.toString()));
  if (total === need) await redis("EXPIRE", totalKey, 60 * 60 * 26);
  if (total > GLOBAL_DAILY_WEI) return json({ error: "The app's daily fee budget is used up. Try again tomorrow." }, 429);

  const account = privateKeyToAccount(KEY);
  const wallet = createWalletClient({ account, chain: appChain, transport: ALCHEMY ? fallback([http(ALCHEMY), http(RPC_URL)]) : http(RPC_URL) });
  try {
    const { maxFeePerGas, maxPriorityFeePerGas } = await serverClient.estimateFeesPerGas();
    const hash = await wallet.sendTransaction({ to, value: need, gas: TRANSFER_GAS, maxFeePerGas, maxPriorityFeePerGas });
    const r = await serverClient.waitForTransactionReceipt({ hash, pollingInterval: 300, retryCount: 30 });
    if (r.status !== "success") return json({ error: "Top-up failed" }, 502);
    // Wait until the funds are spendable through the RPC (see SETTLE_BLOCKS).
    const until = r.blockNumber + SETTLE_BLOCKS;
    const deadline = Date.now() + 15_000;
    while ((await serverClient.getBlockNumber({ cacheTime: 0 })) < until && Date.now() < deadline) await new Promise((res) => setTimeout(res, 250));
    return json({ ok: true, sent: formatEther(need), hash });
  } catch {
    return json({ error: "Couldn't send the fee right now. Try again in a minute." }, 503);
  }
}

