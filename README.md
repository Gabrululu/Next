# Next

**Everyone in line. Nobody cuts in.**

Next is a fair way to hand out things that run out: event seats, workshop spots, scholarships, limited drops. An organizer opens a window. People join once, at any time while it's open, so being first gives no advantage. When the window closes, a smart contract on Monad draws the winners from a random number nobody could know in advance. Anyone can check the result. Winners get a pass that can't be transferred and show it at the door as a signed QR.

- **Live app:** https://next-monad.vercel.app (Monad **testnet**)
- **Track:** Social, Attention & Culture (Monad Metropolis)
- **Docs:** [ARCHITECTURE.md](ARCHITECTURE.md) · [SPONSORS.md](SPONSORS.md) · [DEMO.md](DEMO.md) · [PITCH.md](PITCH.md) · [BRAND.md](BRAND.md)

> ⚠️ **Prototype on Monad testnet.** Test MON has no value and the contracts are **not audited**.
> - **One entry per account is not proof of unique personhood.** It reduces multi-account abuse but doesn't stop it. One person can create several accounts.
> - **A pass QR can be replayed while it is valid (~5 minutes).** "Already scanned" is remembered per scanner device, so the same QR could be accepted by a second scanner during that window. A valid QR proves which account signed it, not who is holding the phone.

---

## How it works

1. **Open.** An organizer sets a name, the number of spots and how long people can join. The moment of the draw (a future block) is fixed and announced at creation.
2. **Join.** Anyone except the organizer joins once while the window is open. They sign in with email or with their own wallet. With email, the app pays the network fee.
3. **Draw.** After the announced block, anyone can press "Run the draw". The result depends only on that block's hash, the campaign id and the number of people in line, so it's the same whoever presses it.
4. **Claim and check in.** Winners claim a soulbound pass (ERC-721, non-transferable). At the door they show a QR signed by their account, and the organizer scans it.
5. **Verify.** `/verify/<id>` recomputes the draw in the browser from public data. `pnpm verify <id>` does the same from the command line.

## What's in the repo

```
contracts/  Foundry: Next.sol (protocol), NextPass.sol (soulbound pass), tests, deploy + verify scripts
scripts/    TypeScript + viem: shared selection algorithm, verifier, stress test, sweep, test vector
indexer/    Envio HyperIndex: config, schema, handlers, tests
web/        Next.js (App Router) + Tailwind + viem/wagmi + framer-motion, deployed on Vercel
```

## Deployed contracts (Monad testnet, chain 10143)

Both contracts are verified on Sourcify ("exact match").

| Contract | Address |
|---|---|
| `Next` v3 (current) | [`0x21b0b22Bc33b8476cD9491Efd23F8A08EE560D1A`](https://testnet.monadvision.com/address/0x21b0b22Bc33b8476cD9491Efd23F8A08EE560D1A) |
| `NextPass` (deployed by `Next`) | [`0xf1A233D44a0Cc2354c4401996edd3379F7025aAd`](https://testnet.monadvision.com/address/0xf1A233D44a0Cc2354c4401996edd3379F7025aAd) |
| `Next` v1 (legacy, read-only in the app via `?contract=`) | [`0xA68cd11d30F10b7C83d1C78754E4Ae64e6C64Bae`](https://testnet.monadvision.com/address/0xA68cd11d30F10b7C83d1C78754E4Ae64e6C64Bae) |
| `Disperse` (stress-test funding helper) | [`0xd23d41FE2A529AFe34F219B4D7840cFC9ED6495e`](https://testnet.monadvision.com/address/0xd23d41FE2A529AFe34F219B4D7840cFC9ED6495e) |

v2 (`0xa828E0b89A6267c9f95e716ac17D9dB9FE6825dD`) is superseded.

## Stress test (real testnet run, simulated entrants)

200 throwaway wallets, generated and funded by [`scripts/stress.ts`](scripts/stress.ts), all sent `register()` at the same moment to campaign #2 on v3. They are **simulated entrants**, not real users. Full data: [`scripts/results/results.json`](scripts/results/results.json).

| | |
|---|---|
| Sent / confirmed / reverted / failed to send | **200 / 200 / 0 / 0** |
| All 200 requests fired in | 3.76 s |
| First send → last confirmation seen | **4.98 s** |
| Confirmation time avg / p50 / p95 | 3.61 / 3.94 / 4.98 s |
| Blocks used | 12 (#70560376 → #70560387) |
| `register()` gas | 117,956 estimated, 135,649 limit (Monad charges the limit) |
| Draw | 50 winners out of 200, 4,224,214 gas, block #70560866 |
| Independent verifier | seed and all 50 winners **MATCH** |

Confirmation time runs until our block poller saw the transaction through the public RPC, so it is an upper bound, not Monad's block time.

## Sponsor integrations

| Sponsor | What it does in Next | Fallback |
|---|---|---|
| **Dynamic** | Email sign-in (OTP) that creates an embedded wallet (new JS SDK `@dynamic-labs-sdk/*`). Network fees are paid with `sendSponsoredTransaction`. People who already have a wallet can sign in with it instead (`connectAndVerifyWithWalletProvider`) and pay their own fee. The server verifies Dynamic JWTs (JWKS, RS256, `user:basic` scope) for email opt-in. | If sponsorship is rejected, the embedded wallet pays its own fee (explicit gas limit) when it has MON; otherwise the user sees a plain message. With no Dynamic env id, the app still reads everything. |
| **Envio** | HyperIndex indexer (`/indexer`) for campaigns, registrations, draws, winners, passes and per-block stats. It feeds the verifier's registrant list, the live panel on `/stress` and "Latest in line" on campaign pages. | Every reader falls back to direct contract reads. Envio data is used only when it matches the on-chain registrant count. |
| **Alchemy** | Monad testnet RPC (browser and server) with the public RPC as fallback. A Custom Webhook on the `Drawn` event triggers result emails. | viem `fallback` transport. Webhook requests are HMAC-verified, and results are always re-read from the contract. |

Email notifications use **Upstash Redis** (opt-ins) and **Resend** (delivery). Subscriber emails are deleted once the result is sent.

### Integration status

| Item | Status |
|---|---|
| Contracts v3 + NextPass, deployed and verified | ✅ |
| Stress test 200/200 + draw verified | ✅ |
| Envio indexer: codegen, typecheck, handler test | ✅ |
| Envio Cloud deployment | ⏳ blocked: the GitHub repo isn't linked to the Envio org (support ticket) |
| Alchemy RPC with fallback, in production | ✅ |
| Alchemy webhook → email | ⏳ code deployed and signature-tested; webhook to be created in the dashboard |
| Dynamic email sign-in + sponsored transaction | ⏳ code deployed; end-to-end test on a phone pending |
| Pass QR + scanner | ✅ verification tested (7 cases); camera test on a phone pending |

## Run it locally

Requirements: Node 22+, pnpm, [Foundry](https://getfoundry.sh). The indexer needs WSL 2 on Windows (Envio doesn't run natively there).

```bash
cp .env.example .env                 # throwaway testnet key only; fund it at https://faucet.monad.xyz

# contracts
cd contracts && forge test -vv        # 24 tests

# scripts
cd ../scripts && pnpm install
pnpm test                             # TypeScript side of the shared test vector
pnpm verify 2                         # recompute campaign #2 from chain data
pnpm stress --n 200 --slots 50 --window 150 --draw
pnpm sweep --dry-run                  # what leftover test MON could be returned

# web
cd ../web && pnpm install
cp ../.env.example .env.local         # fill the NEXT_PUBLIC_* values and the integration keys
pnpm dev

# indexer (WSL)
cd ../indexer && pnpm install && pnpm codegen && pnpm test
```

All chain settings come from environment variables. [`.env.example`](.env.example) lists every variable. Server keys (Alchemy server URL, webhook signing key, Upstash, Resend) never reach the browser. The public Alchemy key should be restricted to your domains in the Alchemy dashboard.

## Honest limitations

- **Per account, not per person.** See the warning at the top.
- **QR replay within ~5 minutes** across different scanner devices. See the warning at the top.
- **The organizer can't join from their own account**, but could from a second one (the same multi-account limit).
- **Block-producer influence.** The producer of the seed block sees its hash first and could, in theory, withhold the block. A VRF or commit-reveal would remove this; for a testnet prototype we document it instead.
- **Draw liveness.** Someone must run the draw within ~8,191 blocks (~41 min) of the seed block. Otherwise anyone can set a new future seed block (`recommit`), which keeps the draw fair but slower.
- **Time → block estimate.** The contract assumes 300 ms blocks to place the seed block after the closing time. Registration also stops at the seed block, so the seed is never known while people can still join.
- **Fee sponsorship covers email accounts only.** Dynamic sponsors embedded wallets; people using their own wallet pay their own (small) fee.
- **Indexer freshness.** If Envio lags, the app reads the contract instead, so data stays correct, just slower.
