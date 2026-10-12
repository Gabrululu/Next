# Next

**Everyone in line. Nobody cuts in.**

Next is a fair-access protocol for scarce resources such as event seats or scholarships. An organizer opens a time window. Anyone can register inside it, and arrival order doesn't matter. When the window closes, a smart contract draws winners from a public seed that anyone can recompute. Winners claim a pass that is recorded on-chain.

Track: **Social, Attention & Culture** (Monad Metropolis).

> ⚠️ **Testnet prototype.** Runs on Monad **testnet** only. Test MON has no value. The contracts are **not audited**.
> The one-entry-per-address rule *reduces* multi-account abuse but **does not stop it**: one person can create many addresses. It is **not** proof of unique personhood.

---

## What a judge can do

1. Open the landing page `/`.
2. Create a campaign at `/create`. Set the window with the rotary dial and the number of winners with the fader.
3. Register from a wallet at `/c/<id>`.
4. Once the seed block exists, anyone presses **Run the draw**. Then see who won and claim a pass.
5. Recompute the result independently at `/verify/<id>` (in the browser) or with `pnpm verify <id>` (CLI).
6. Open `/stress` to watch the replay of a real testnet run with simulated entrants.

## Network (Monad testnet)

Source: [docs.monad.xyz/developer-essentials/testnets](https://docs.monad.xyz/developer-essentials/testnets), fetched 2026-10-11. All values are also in [`.env.example`](.env.example).

| | |
|---|---|
| Chain ID | `10143` |
| RPC | `https://testnet-rpc.monad.xyz` |
| Explorer | `https://testnet.monadvision.com` |
| Faucet | `https://faucet.monad.xyz` |

## Deployed contracts

Deployed 2026-10-12 to Monad testnet (constructor `blockTimeMs = 300`):

| Contract | Address |
|---|---|
| `Next` **v2 (current)**: the organizer can't register in their own campaign | [`0xa828E0b89A6267c9f95e716ac17D9dB9FE6825dD`](https://testnet.monadvision.com/address/0xa828E0b89A6267c9f95e716ac17D9dB9FE6825dD) |
| `Next` v1 (previous, still live): holds the stress-test campaigns (#4, #6) and the first manual demo (#8) | [`0xA68cd11d30F10b7C83d1C78754E4Ae64e6C64Bae`](https://testnet.monadvision.com/address/0xA68cd11d30F10b7C83d1C78754E4Ae64e6C64Bae) |
| `Disperse` (stress-test funding helper) | [`0xd23d41FE2A529AFe34F219B4D7840cFC9ED6495e`](https://testnet.monadvision.com/address/0xd23d41FE2A529AFe34F219B4D7840cFC9ED6495e) |
| `Hello` (step-1 pipeline smoke test) | [`0xe0fA6dDA2d71626CaB01249db31BdD1be163C59B`](https://testnet.monadvision.com/address/0xe0fA6dDA2d71626CaB01249db31BdD1be163C59B) |

v1 → v2 is a one-line change in `register()`: `if (msg.sender == c.organizer) revert OrganizerCannotRegister();`. It's covered by a new Foundry test and was checked on testnet: simulating `register()` from the organizer reverts with selector `0x7e6d4316`, and from any other address it succeeds. The web app writes to v2. v1 campaigns stay readable and verifiable through `?contract=<v1 address>`. The app accepts only these two addresses, and the stress-test links already include it, e.g. `/c/6?contract=0xA68c…4Bae`.

---

## Architecture

```
contracts/   Foundry. Next.sol (protocol), Disperse.sol (test helper), tests, deploy script
scripts/     TypeScript + viem. lib/select.ts (shared algorithm), verify.ts, stress.ts, test vector
web/         Next.js App Router + Tailwind + wagmi/viem + framer-motion
```

### `Next.sol`

| Function | Who | What |
|---|---|---|
| `createCampaign(name, slots, openAt, closeAt)` | anyone | Stores the campaign and **announces `drawBlock`**: the estimated block at `closeAt` (rounded up, at an assumed 300 ms/block) + 10 blocks. |
| `register(id)` | anyone except the organizer, once per address | Only while `openAt ≤ now < closeAt` **and** `block.number < drawBlock`. The organizer's own address reverts with `OrganizerCannotRegister()`. Appends to the registrant list and emits `Registered`. |
| `draw(id)` | anyone, once `block.number > drawBlock` | `seed = keccak256(abi.encode(blockhash(drawBlock), id))`, then a partial Fisher-Yates. Emits `Drawn(seed)`. |
| `rescheduleDraw(id)` | anyone, only if the seed hash is unreadable | Announces a new future seed block. Registration stays closed. |
| `claim(id)` | winners, once | Records the pass on-chain (`hasClaimed`, `Claimed(passNumber)`). |
| Views | | `getCampaign`, `getRegistrants`, `getRegistrantsSlice`, `registrantCount`, `getWinners`, `isWinner`, `isRegistered`, `seedBlockHash` |

**Selection (identical in Solidity and TypeScript):**

```
seed = keccak256(abi.encode(blockhash(drawBlock), campaignId))
if n <= slots: everyone wins
for i in 0 .. slots-1:
    j = i + uint256(keccak256(abi.encode(seed, i))) % (n - i)
    winner[i] = pool[j];  pool[j] = pool[i]        // virtual swap stored in a mapping
```

The shuffle never copies the registrant array. It writes `O(slots)` storage slots: one swap entry, one winner flag, and one winners-array push per pick.

**Why `MAX_SLOTS = 200`.** `draw()` cost grows linearly with `slots`. The Foundry gas test measures **~13.2M gas** for 200 slots out of 400 registrants. On Monad testnet we measured 2,178,030 gas for 25 slots, about 87k per slot, which projects to roughly 17–18M for 200. Monad's per-transaction gas limit is 30M (docs), so the cap guarantees a draw can always execute with headroom. Without a cap, a campaign could become impossible to draw. Registrant count does not affect draw gas.

### The seed: how BLOCKHASH behaves on Monad (checked, not assumed)

The Monad docs don't describe `BLOCKHASH`, so we probed testnet directly on 2026-10-11 with an `eth_call` state-override contract:

- `blockhash(n-1)`, `blockhash(n-2)` and `blockhash(n-256)` returned real hashes. They were byte-identical to the hashes `eth_getBlockByNumber` returns for those blocks.
- `blockhash(n-257)` and older returned **`0x0`**. This matches the standard EVM 256-block window.
- The **EIP-2935** history contract (`0x0000F90827F1C53a10cb7A02335B175320002935`) **is deployed on testnet**. The Monad changelog lists EIP-2935 in the MONAD_FOUR revision. It returned the correct hash for a block 300 back and for one 8,000 back, and **reverted** for one 9,000 back. So its window is ~8,191 blocks.
- Measured block time: 10,000 blocks in 3,020 s, i.e. **~302 ms/block** (the docs say 300 ms). So BLOCKHASH covers **~77 s** and EIP-2935 covers **~41 min**.

How the contract handles this:

1. Read `blockhash(drawBlock)`. If it is zero, ask the EIP-2935 contract (only when ≤ 8,191 blocks old).
2. If both fail, `draw()` reverts with `SeedUnavailable()`. Anyone may then call `rescheduleDraw()`, which announces `block.number + 10` as the new seed block. It is only callable while the old hash is truly unreadable, so nobody can re-roll a result that is already knowable. It also clamps `closeAt` so registration can't reopen.

**Why the seed can't be known during registration:** `drawBlock` is fixed at creation, and `register()` stops at `drawBlock` even if `closeAt` hasn't passed yet. That guards against blocks arriving faster than the 300 ms estimate.

### Verifier

[`scripts/lib/select.ts`](scripts/lib/select.ts) is a line-for-line TypeScript port of the selection. The same file (auto-copied) powers the browser verifier at `/verify/[id]`.

- [`scripts/vectors/draw-vector.json`](scripts/vectors/draw-vector.json) is the **shared test vector**: 25 registrants and a fixed block hash in, the seed and 7 winners out.
- `forge test --match-test test_sharedVectorMatchesTypeScript` checks that the contract picks those exact winners.
- `pnpm test` (in `scripts/`) checks that the TS port produces the same vector.
- `pnpm verify <id>` and `/verify/<id>` fetch the seed block hash **directly from the RPC** rather than trusting the contract. They recompute the seed and winners and compare both with what is stored on-chain.

### Stress test

[`scripts/stress.ts`](scripts/stress.ts) does the following:

1. Generates N ephemeral wallets (default 200). Keys are saved to the gitignored `scripts/.wallets/`.
2. Creates a campaign.
3. Funds every wallet through `Disperse` in batches of 100. One transaction per batch keeps the deployer within Monad's reserve-balance limits on in-flight transactions.
4. Waits until the RPC shows every funded balance and 10 blocks have passed (see the RPC notes below).
5. Pre-signs one `register()` per wallet and fires them all concurrently with `eth_sendRawTransaction`.
6. Logs sent, confirmed, failed, wall-clock time, block range and average/p50/p95 confirmation time. With `--draw`, it also waits for the seed block, draws, and runs the verifier.
7. Writes `scripts/results/stress-<chain>-<time>.json` and, for testnet runs only, `web/public/stress/latest.json` for the dashboard.

All entrants in this test are **simulated** (throwaway wallets controlled by the script) and are labelled that way everywhere. "Confirmation time" runs from sending to the first time the tx's block was visible through the public RPC. It therefore includes our ~150 ms polling interval.

**Cost and faucet limits.** Monad charges the full **gas limit**, not the gas used. Each wallet is funded with `1.03 × gasLimit × (1.10 × baseFee + tip)` (tip defaults to 0). If the deployer can't afford N wallets, the script stops before spending anything and prints the largest N it can afford.

### Frontend

Next.js (App Router) + Tailwind + wagmi/viem + framer-motion. Pages: `/` (landing), `/create`, `/c/[id]` (campaign), `/verify/[id]`, `/stress`.

- The design takes its layout language and mood from butter.video (oversized grotesk headlines, pill header, editor-window frames, tactile dial/fader controls, an accordion with a wipe transition, a page sheet over the footer). It copies none of their assets, copy, logos or colours. Accent: electric violet.
- Fonts: Bricolage Grotesque (headlines), Geist / Geist Mono (UI), Sedgwick Ave Display (the hand-lettered "Next." wordmark). All are Google Fonts under the OFL.
- Every animation respects `prefers-reduced-motion`. Scroll reveals only hide content when scripting is enabled (`@media (scripting: enabled)`). All controls are keyboard-operable (`role="slider"`, `aria-expanded`, …).
- Illustrations are labelled as such ("Illustration", "Example"). The only numbers shown are from the chain or from the recorded testnet run.

## Results from a real testnet run

Copied from [`scripts/results/stress-10143-2026-10-12T00-30-45-316Z.json`](scripts/results/stress-10143-2026-10-12T00-30-45-316Z.json) (also served as `web/public/stress/latest.json`). **All entrants were simulated** throwaway wallets.

| | |
|---|---|
| Campaign | #6 on `Next`, 25 slots |
| Wallets generated and funded | 180 |
| `register()` accepted by the RPC | 159 |
| Confirmed on-chain | **159** (0 reverted, 0 missing) |
| Refused by the public RPC before reaching the chain | 21 (`RPC Request failed.`; these weren't retried in this run) |
| Registrants stored on-chain | 159 |
| Send phase (all 180 requests fired) | 2,510 ms |
| Wall clock (first send → last confirmation seen) | 4,310 ms |
| Confirmation time, avg / p50 / p95 | 3,674 / 4,040 / 4,309 ms |
| Block range | #70254927 → #70254934 (8 blocks; 15 / 46 / 1 / 48 / 49 registrations in the 5 blocks that had them) |
| `register()` gas | 117,835 estimated; limit 135,510 (receipts report gasUsed = limit, since Monad charges the limit) |
| Draw | block #70255324, `draw()` gasUsed 2,178,030 for 25 winners out of 159 |
| Verifier | seed and all 25 winners **MATCH** (`NEXT_ADDRESS=<v1> pnpm verify 6`) |

Why N is 180 and not 200: the faucet gave 5 MON. Funding transactions also pay their full gas limit (≈0.4 MON per 100-wallet `Disperse`), so 200 wallets plus overhead didn't fit.

Confirmation time is measured until our ~150 ms block poller *saw* the block through the public RPC under load. It is an upper bound on inclusion time, not Monad's block time.

### Monad testnet RPC behaviour we hit (and how the script handles it)

1. **A send right after funding gets rejected.** A tx sent ~150 ms after the funding receipt was rejected with `-32000 Signer had insufficient balance`, even though `eth_getBalance` already showed the funds. Waiting **10 blocks** after the funding block fixed it. Our reading is that the RPC validates against lagged state, which fits Monad's deferred execution. We inferred this; it isn't documented.
2. **Identical bytes stay rejected.** After a rejection, resending the **identical signed bytes** kept failing for minutes. A tx changed by only 1 wei in `maxFeePerGas` (new hash) was accepted immediately. So retries re-sign with `maxFee + attempt` wei.
3. **Big batches get refused.** A single batched request with 180 `eth_getBalance` calls was refused, so polling is chunked by 20. In the burst, 21 of 180 `eth_sendRawTransaction` calls came back as generic `RPC Request failed.`, which looks like rate limiting. The script now records the error detail and retries these with a re-signed tx.

Earlier campaigns #1–#3 on the contract are failed smoke runs from finding (1) and have 0 registrants. Campaign #4 was a 5-wallet smoke run after the fix: 5/5 confirmed in one block, then drawn and verified.

---

## Setup

Requirements: Node 20+, pnpm, [Foundry](https://getfoundry.sh). Root `package.json` has pnpm shortcuts: `pnpm setup`, `pnpm test`, `pnpm deploy`, `pnpm abi`, `pnpm stress`, `pnpm verify <id>`, `pnpm dev`.

```bash
cp .env.example .env            # add a THROWAWAY testnet PRIVATE_KEY, fund it at faucet.monad.xyz

# contracts
cd contracts
forge test -vv
forge script script/Deploy.s.sol --rpc-url https://testnet-rpc.monad.xyz --broadcast
# copy NEXT_ADDRESS / DISPERSE_ADDRESS from the output into .env

# scripts
cd ../scripts && pnpm install
node gen-abi.mjs                # copies ABIs + select.ts into web/
pnpm test                       # TS side of the shared vector
pnpm stress --n 180 --slots 25 --window 120 --draw
# --wallets <runId> reuses already-funded wallets from scripts/.wallets/ (no refunding)
pnpm verify <campaignId>

# web
cd ../web && pnpm install
echo "NEXT_PUBLIC_NEXT_ADDRESS=0x..." > .env.local
pnpm dev              # or: pnpm build && pnpm start
```

## Demo script (final, ≈3½ min)

### Before you go on stage (10 min earlier)

- [ ] `pnpm dev` is running. Open `localhost:3000` in a browser **without extra extensions** (or in a clean profile) with **three wallets** on Monad testnet (chain 10143): **A = organizer**, **B and C = participants** (the organizer doesn't join their own campaign). Each needs ~0.05 MON from the faucet for `createCampaign` / `register` / `draw` / `claim`.
- [ ] Open tabs: `/`, `/create`, `/stress`, `/verify/6?contract=0xA68cd11d30F10b7C83d1C78754E4Ae64e6C64Bae` (the stress-test campaign lives on v1; the "verify" link in `/stress` opens it too).
- [ ] If several wallet extensions are installed, **Connect wallet** opens a picker (EIP-6963): choose the same one every time. Better still, disable the others for the demo. Connecting and switching to Monad are separate steps, so approve each prompt before pressing the next button.
- [ ] **Backup campaign:** create one with wallet A (**1m** window, **1** winner), and register wallets B and C. If the live one stalls, you switch to this one, which will already be drawable.
- [ ] Turn off "reduce motion" in the OS if it's on: the reshuffle and the replay are part of the show.

> Why **1 winner**: with 2 participants in line, 1 slot means the draw really decides (with 2 slots, everyone wins and the page says so). More wallets help, as long as there are fewer slots than entrants.
>
> Why 1 minute: the seed block is fixed at creation as `creation block + window/300 ms + 10`. With a 1m window that's ~210 blocks, about **63 s**, after you create it. With 2m it's ~2 min. Pick 1m so the demo doesn't stall.

### On stage

| Time | Screen | What you do | What you say |
|---|---|---|---|
| 0:00 | `/` hero | Let the dots fill up and reshuffle. | "When something is scarce (seats, scholarships, a drop), whoever clicks fastest or runs the most bots wins. Next removes the race." |
| 0:20 | `/` scroll | Scroll through the statement; open **Draw** in the accordion. | "Register any time while the window is open. When it closes, a public seed picks the winners, and anyone can recompute it." |
| 0:40 | `/create` | Type the name, set the dial to **1m**, pull the fader to **1**, press **Open the window**. | "The schedule bar shows that the seed block is announced *right now*. Nobody, not even me as organizer, knows its hash while people can still register." |
| 1:05 | `/c/[id]` | As A, show the "You're the organizer" badge and the share box (no Register button). Switch to B and register, then C. | "The organizer opens the line but doesn't stand in it. Participants get one entry per wallet, and registering first gives no advantage." Point at the timeline playhead and the countdown. |
| 1:30 | `/stress` | While the window closes: press **Replay** at 0.25×. | "Here is what happens when everyone arrives at once. This is a real Monad testnet run: 180 simulated wallets fired `register()` together; 159 were accepted and all 159 confirmed across 8 blocks in 4.3 s. The other 21 were refused by the public RPC (rate limiting), not by the chain." |
| 2:10 | `/c/[id]` | When the panel says **Seed block is in**, press **Run the draw** (from either wallet). | "I could be anyone. The result doesn't depend on who presses this or when, only on the seed block's hash." The line reshuffles and the winners light up. |
| 2:35 | `/c/[id]` | If your wallet won, press **Claim pass**. | "The pass is recorded on-chain, and only once." |
| 2:50 | `/verify/[id]` | Open **Verify this draw**. The six checks turn green. | "Don't trust us. This recomputes everything in your browser, fetching the block hash directly from the RPC. The Solidity and TypeScript versions share a test vector, and there's a CLI that does the same thing." |
| 3:15 | `/` footer | Close. | "Testnet prototype. One entry per address *reduces* abuse but isn't proof of personhood. The README covers the limitations." |

### Plan B

- **The live seed block is taking too long:** switch to the backup campaign (already drawable) and press **Run the draw** there.
- **No wallet or no MON:** from `/stress`, follow **Campaign #6** (159 entrants, 25 winners, already drawn) and **verify**, which verifies 6/6 against real data. Direct URLs: `/c/6?contract=0xA68cd11d30F10b7C83d1C78754E4Ae64e6C64Bae` and `/verify/6?contract=0xA68cd11d30F10b7C83d1C78754E4Ae64e6C64Bae`.
- **Slow RPC:** the read pages retry on their own; `/stress` and the v1 verify page keep working because they read recorded data or public chain data.

### Note on the dev overlay

In `next dev`, extensions such as wallets (e.g. Meteor) or password managers inject scripts and attributes before React loads, and Next shows a "hydration mismatch" warning. It comes from the extensions, not the app, and doesn't appear in a production build (`pnpm build && pnpm start`). That's why the checklist says to use a clean browser for the demo.

## Honest limitations

- **Organizer ≠ participant only blocks the organizer's own address.** v2 rejects `register()` from the organizer and the UI gives organizers a share box instead of a Register button. An organizer could still join from a second wallet, which is the same multi-account limit described below. v1 campaigns (e.g. #8) predate the rule.

- **Sybil resistance is weak by design.** One entry per *address* only. Pairing it with a personhood or credential check (and a deposit) is future work.
- **Block-producer influence.** The proposer of `drawBlock` knows its hash first. In principle they could choose to withhold the block if they had registered and disliked the outcome. A commit-reveal scheme or a VRF would remove this. For a testnet MVP we accept it and document it.
- **Draw liveness.** Someone has to call `draw()` within ~41 minutes of the seed block. Otherwise it must be rescheduled to a new seed block, which is still fair but slower.
- **closeAt → block estimate.** The contract assumes 300 ms blocks. If blocks come faster, registration ends early at `drawBlock`. If slower, the draw happens a little later.
- **The pass is a mapping**, not a token. It can't be transferred, by design for the MVP.
- **Gas:** Monad reprices storage, so on-chain draw costs (~87k gas/slot measured) are higher than the local EVM's (~66k). 200 slots still projects under the 30M per-tx limit, but we only measured up to 25 on-chain.
- Wallet login is a standard injected wallet (EIP-1193). No passkey or embedded wallet yet.
