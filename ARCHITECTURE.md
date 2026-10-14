# Next — Architecture

This document explains how Next works end to end: the contracts, the randomness, the verifier, the sponsor integrations, the check-in QR, the tooling, and the Monad behaviour we measured along the way. For a short overview see [README.md](README.md).

---

## 1. System overview

```
                         ┌────────────────────────── Monad testnet (10143) ───────────────────────────┐
                         │  Next.sol (v3)  ── mints ──►  NextPass.sol (soulbound ERC-721)              │
                         │  events: CampaignCreated · Registered · Winner · Drawn · Recommitted · Claimed │
                         └───────▲───────────────▲──────────────────────▲─────────────────▲────────────┘
                                 │ txs           │ reads                │ logs            │ logs (Drawn)
            Dynamic embedded /   │               │ Alchemy RPC          │ HyperSync       │
            user's own wallet    │               │ (fallback: public)   │                 │
┌──────────────────────────────┐ │   ┌───────────┴───────────┐  ┌───────┴────────┐  ┌─────┴───────────────┐
│ Browser (Next.js on Vercel)  │─┘   │ wagmi/viem read client │  │ Envio indexer  │  │ Alchemy webhook     │
│ /create /c/[id] /verify/[id] │────►│ multicall, polling     │  │ GraphQL        │  │ → /api/webhooks/... │
│ /pass/[id] /scan/[id] /stress│◄────┴────────────────────────┘  └───────▲────────┘  └─────┬───────────────┘
│                              │──────────── GraphQL (optional) ─────────┘                 │
│                              │── /api/notify (Dynamic JWT) ──► Upstash Redis ◄────────────┤
└──────────────────────────────┘                                    Resend ◄── result emails┘
```

Design rules that shape everything below:

- **The chain is the source of truth.** The indexer, the webhook and the emails are conveniences. Every decision (who won, who holds a pass) is re-read from the contract.
- **Every integration has a fallback.** If a sponsor service is missing or down, the app degrades to direct RPC reads and plain messages. It never shows invented data.
- **Configuration comes from env vars.** Chain id, RPC, explorer and addresses are not hardcoded (`web/src/lib/config.ts`, `scripts/lib/env.ts`).

---

## 2. Contracts

### 2.1 `Next.sol` (v3)

| Function | Caller | Behaviour |
|---|---|---|
| `createCampaign(name, slots, openAt, closeAt)` | anyone | Validates the name (1–64 bytes), slots (1–`MAX_SLOTS`) and window (≤ 30 days). It converts `closeAt` into an estimated block (rounded up at `blockTimeMs` = 300), adds `DRAW_DELAY_BLOCKS` = 10, and stores that as `drawBlock`, **announced in the event**. |
| `register(id)` | anyone except the organizer, once | Accepted only while `openAt ≤ now < closeAt` **and** `block.number < drawBlock`. Reverts `OrganizerCannotRegister` for the organizer. Emits `Registered(campaignId, account, index)` with a 0-based index. |
| `draw(id)` | anyone, after `drawBlock` | Reads the seed block hash, derives the seed, and picks winners (§3). Emits one `Winner(campaignId, account, rank)` per winner (1-based rank), then `Drawn(campaignId, seed, winnerCount)`. |
| `recommit(id)` | anyone, only if the seed hash is unreadable | Sets `drawBlock = now + 10` and clamps `closeAt` so registration can't reopen. Emits `Recommitted`. Reverts `SeedStillAvailable` if the hash can still be read, so nobody can re-roll a result that is already knowable. |
| `claim(id)` | winners, once | Increments `claimedCount`, then calls `pass.mint` (checks-effects-interactions). Emits `Claimed(campaignId, account, tokenId)`. |
| Views | | `getCampaign`, `registrantCount`, `getRegistrants`, `getRegistrantsSlice`, `getWinners`, `isWinner`, `isRegistered`, `hasClaimed` (delegates to `NextPass.hasPass`), `seedBlockHash` |

**Why registration stops at `drawBlock` as well as `closeAt`:** `drawBlock` is an estimate from wall-clock time. If blocks arrive faster than 300 ms, the seed block could exist before `closeAt`. Stopping at `drawBlock` guarantees **no entry is ever accepted once the seed is knowable**.

### 2.2 `NextPass.sol`

A minimal OpenZeppelin v5 ERC-721, created in `Next`'s constructor, so `minter` is immutable and equals `Next`.

- `mint(to, campaignId)` can only be called by `Next`. It records `passOf[campaignId][account] = tokenId` and `campaignOf[tokenId]`, and emits `PassMinted` and ERC-5192 `Locked`.
- **Soulbound:** `_update` reverts with `Soulbound` for any transfer of an existing token. Only mints pass through.
- `locked(tokenId)` always returns true, and `supportsInterface` reports ERC-5192 (`0xb45a3c0e`).
- `hasPass(campaignId, account)` is the view the scanner relies on.

### 2.3 Why `MAX_SLOTS = 200`

Monad charges the **gas limit**, has a 30M per-transaction limit, and prices fresh storage pages higher than Ethereum. Draw cost grows with the number of winners, not with the number of registrants:

- v1 on testnet: 2,178,030 gas for 25 winners (~87k per winner).
- v3 on testnet: **4,224,214 gas for 50 winners out of 200** (~84k per winner, including the `Winner` events).
- Foundry, 200 winners: ~13.7M gas locally.

At ~90k per winner, 200 winners cost about 18M gas, which leaves ~40% headroom under 30M. Without a cap, a large campaign could become impossible to draw.

### 2.4 Tests

`contracts/test/Next.t.sol`, 24 tests:
- window enforcement, double registration, organizer rule
- determinism, fewer registrants than slots, claim only by winners
- `recommit` path, `Winner` events, seed formula
- soulbound transfers, only `Next` can mint
- a fuzz test, the max-slots gas test
- the **shared vector** read from `scripts/vector.json`

---

## 3. Randomness and selection

### 3.1 Seed

```
seed = keccak256(abi.encode(blockhash(drawBlock), campaignId, registrantCount))
```

`drawBlock` is fixed at creation, before anyone can know its hash. The campaign id and registrant count are bound into the seed, so two campaigns sharing a seed block get different seeds. (v1 used `keccak256(abi.encode(bh, id))`. The verifier detects the version: v3 exposes `pass()`.)

### 3.2 Reading old block hashes on Monad (measured, not assumed)

The Monad docs don't describe `BLOCKHASH`, so we probed testnet with `eth_call` state overrides:

- `blockhash(n-1 … n-256)` returns real hashes, byte-identical to `eth_getBlockByNumber`. `n-257` and older return `0x0`.
- The **EIP-2935** history contract `0x0000F90827F1C53a10cb7A02335B175320002935` is deployed. It served hashes 300 and 8,000 blocks back and reverted at 9,000, so its window is ~8,191 blocks.
- Measured block time: 10,000 blocks in 3,020 s, i.e. **~302 ms**. BLOCKHASH therefore covers ~77 s, and EIP-2935 covers ~41 min.

`_blockHash` tries `blockhash` first, then the history contract (only within 8,191 blocks). If both fail, `draw` reverts with `SeedUnavailable` and anyone can `recommit`.

### 3.3 Partial Fisher-Yates over a virtual array

```
if n <= slots: everyone wins, in registration order
for i in 0 .. slots-1:
    j = i + uint256(keccak256(abi.encode(seed, i))) % (n - i)
    winner[i] = pool[j];  pool[j] = pool[i]
```

`pool` is never copied. A `swap` mapping stores only the positions that moved (value + 1, so 0 means "untouched"). The draw writes O(slots) storage regardless of the number of registrants.

### 3.4 Shared algorithm and test vector

- [`scripts/lib/select.ts`](scripts/lib/select.ts) is a line-for-line TypeScript port (`deriveSeed`, `deriveSeedV1`, `selectIndices`, `selectWinners`, `firstMismatch`). `scripts/gen-abi.mjs` copies it into `web/src/lib/shared/`, so the browser runs the same file.
- `scripts/vector.json` holds the fixed registrants, block hash, seed and winners. Foundry and `scripts/test-vector.ts` both check it, including a mismatch-index test.

### 3.5 Verifier

`pnpm verify <id> [--contract 0x…]` (CLI) and `/verify/[id]` (browser) do the same thing:

1. Check the shared vector.
2. Load the registrants: from Envio when available **and** its count equals `registrantCount` on-chain, otherwise from `getRegistrantsSlice` in pages of 500. The source is shown to the user.
3. Fetch the seed block hash **from the RPC** (`eth_getBlockByNumber`), not from the contract.
4. Recompute the seed and the winners, and compare them with `getCampaign().seed` and `getWinners()`.
5. Report **MATCH**, or the first mismatching index.

---

## 4. Web app

Next.js 16 (App Router, Turbopack), Tailwind v4, viem + wagmi (reads only, no connectors), framer-motion. Deployed on Vercel.

| Route | Purpose |
|---|---|
| `/` | Landing: promise, how it works, recent real campaigns (test runs hidden). |
| `/create` | Organizer flow: name, spots, window. Redirects to the new campaign using `CampaignCreated.campaignId`. |
| `/c/[id]` | Campaign: phase (Opens soon / Open / Closed / Ready to draw / Drawn), personal status (Registered / Waiting for the draw / You won / Not this time), actions, winners and claim badges, "Latest in line" (Envio), email opt-in, pass / scanner links. |
| `/verify/[id]` | In-browser verifier. |
| `/pass/[id]` | Winner's check-in QR. |
| `/scan/[id]` | Organizer's camera scanner. |
| `/stress` | Replay of the recorded stress run, plus the live Envio panel. |
| `/api/notify` | Email opt-in (GET / POST / DELETE). |
| `/api/webhooks/alchemy` | Alchemy webhook receiver. |

Legacy data: `?contract=` accepts only the current or the v1 address (allowlist in `resolveContract`), so old campaigns stay readable and verifiable.

**Languages (EN/ES).** `web/src/lib/i18n/` uses the English text as the key: `t("Join")` returns the Spanish entry from `es.ts`, falling back to English when one is missing, with `{placeholders}` for values. The choice is stored in a `next-locale` cookie:
- The root layout reads the cookie, so the server renders the same language the browser shows (no flash, no hydration mismatch).
- The toggle refreshes Server Components after switching.

The participant and organizer flow is fully translated: nav, landing, sign-in, create, campaign, pass, scanner and footer. `/verify` and `/stress` stay in English on purpose (technical pages).

### 4.1 Read path

`web/src/lib/wagmi.ts` uses `fallback([http(NEXT_PUBLIC_ALCHEMY_RPC_URL), http(NEXT_PUBLIC_RPC_URL, { batch: true })])`. Lists use Multicall3 (`0xcA11…CA11`). The landing caches the last good read per campaign, so a single failed call doesn't make a card disappear.

---

## 5. Dynamic: accounts, fees and server auth

New JS SDK, v1.39.1: `@dynamic-labs-sdk/client`, `/react-hooks`, `/evm`, `/evm/waas`, `/evm/viem`, `client/waas`.

**Client setup** (`web/src/lib/dynamic.ts`):
- `createDynamicClient({ autoInitialize: false })` as a module singleton.
- Extensions (`addEvmExtension`, `addWaasEvmExtension`) and `initializeClient` run **only in the browser**. Running them during SSR threw `window is not defined`.

**Email sign-in** (`ConnectButton.tsx`):
1. `sendEmailOTP` → `verifyOTP`.
2. `getChainsMissingWaasWalletAccounts` / `createWaasWalletAccounts` (awaited before reading the address).

**Own wallet:** `getAvailableWalletProvidersData` lists the EVM browser-extension wallets, and `connectAndVerifyWithWalletProvider` signs a free message. If the account has both, the user's own wallet takes precedence over the embedded one.

**Transactions** (`useTx.ts`):
1. `ensureAppNetwork`: `switchActiveNetwork({ networkId: "10143" })`, and on `NetworkNotAddedError` → `addNetwork` → switch.
2. **Embedded wallet:** `sendSponsoredTransaction({ walletAccount, calls: [{ target, data, value: 0n }] })`. Per Dynamic's docs, this works for V3 MPC embedded wallets only and uses EIP-7702 delegation.
3. **Fallback**, on `SponsorTransactionError` or for the user's own wallet: estimate × 1.2 as an **explicit gas limit** (Monad charges the limit), check the balance, then send through `createWalletClientForWalletAccount`. Without enough MON the user gets a plain-language error.
4. Wait for the receipt (`retryCount` 20) and report success or a plain error.

**Server auth** (`web/src/lib/server/dynamicAuth.ts`), following Dynamic's token docs:
- `jose.jwtVerify` against `https://app.dynamicauth.com/api/v0/sdk/<envId>/.well-known/jwks`, RS256 only.
- Rejects a different `environment_id`, requires the scope `user:basic`, and takes addresses from `verified_credentials`.
- Tokens are never logged or stored.

Monad reserve-balance note: delegated (7702) EOAs can't use the "emptying transaction" exception, and a transaction that would leave them below 10 MON reverts. `register`, `draw` and `claim` move no value, so this doesn't affect them.

---

## 6. Envio indexer (`/indexer`)

Envio 3.14.0, generated from the official `envio init` template and indexed through HyperSync (`https://10143.hypersync.xyz`), with the Monad RPC as `fallback`. The start block is 70322943 (the v3 deploy). Addresses and the start block come from `ENVIO_*` env vars with defaults.

| Entity | Id | Purpose |
|---|---|---|
| `Campaign` | campaignId | Fields from `CampaignCreated`, plus `registrantCount`, `drawn`, `seed`, `winnerCount`, `claimedCount`, `recommitCount` |
| `Registration` | `<id>_<account>` | Account (lowercase), 0-based index, block, timestamp, tx |
| `Draw` | campaignId | Seed, winner count, block, tx |
| `Winner` | `<id>_<account>` | Rank, `claimed` |
| `Pass` | tokenId | From `NextPass.PassMinted` |
| `CampaignBlockStat` | `<id>_<block>` | Registrations per block (live chart) |
| `CampaignStats` | campaignId | Total, blocks with registrations, peak per block, first/last block |
| `GlobalStats` | `global` | Campaigns, registrations, draws, winners, passes |

Aggregates are computed in handlers because Envio Cloud does not expose GraphQL aggregate queries.

`src/indexer.test.ts` simulates a full lifecycle (create → 3 registrations → 2 winners → draw → claim → pass) and asserts every entity.

In the web app (`web/src/lib/envio.ts`), everything is gated on `NEXT_PUBLIC_ENVIO_GRAPHQL_URL` and on `envioCovers(contract)`, i.e. only the current deployment:
- The verifier uses Envio's registrant list only when its count matches the chain exactly and there are no index gaps.
- `/stress` polls a live panel every 2 s.
- Campaign pages show the last five arrivals.

Envio runs only on Linux/macOS. On Windows we build it in WSL 2.

---

## 7. Alchemy: RPC, webhook and result emails

- **RPC:** Monad testnet endpoint `https://monad-testnet.g.alchemy.com/v2/<key>`. The browser key goes in `NEXT_PUBLIC_ALCHEMY_RPC_URL` (restrict it by domain) and the server key in `ALCHEMY_RPC_URL`. Both sides fall back to the public RPC.
- **Webhook:** an Alchemy **Custom Webhook** with a GraphQL filter on the `Next` address and topic0 = `Drawn` (`0x69086fb1…8121`), posting to `/api/webhooks/alchemy`.
  1. Read the **raw** body and compute HMAC-SHA256 with `ALCHEMY_WEBHOOK_SIGNING_KEY`. Compare it with `X-Alchemy-Signature` using `timingSafeEqual`, and return 401 otherwise.
  2. Walk the payload for logs with topic0 = `Drawn` emitted by `Next`, and take the campaign id from topic1. Logs from other contracts are ignored.
  3. For each campaign, `notifyDrawn` re-reads `getCampaign` and `getWinners` **from the contract**, then emails each subscriber their own result.
  4. Answer 500 only if something failed, so Alchemy retries.
- **Opt-in** (`/api/notify`, `NotifyToggle`):
  - The browser sends `dynamicClient.token`.
  - The server verifies it, takes the **email from the token** (never from the body), and checks on-chain that one of the token's verified addresses `isRegistered` in that campaign.
  - It stores `address → email` in an Upstash hash per campaign.
- **Idempotency and data minimisation:**
  - Each email has a Resend `Idempotency-Key` (`next-drawn-<contract>-<id>-<address>`).
  - When every email for a campaign has gone out, a `notified` marker (30 days) is set and the subscriber hash is **deleted**.

---

## 8. Check-in QR (`web/src/lib/passQr.ts`)

**Signed message** (EIP-191, human-readable):

```
Next pass check-in
Campaign: <id>
Address: <checksummed>
Contract: <Next address>
Chain: <chain id>
Timestamp: <unix seconds>
Nonce: <128-bit hex>
```

**QR payload:** `{"v":1,"c":id,"a":address,"t":timestamp,"n":nonce,"s":signature}`. Chain and contract are not in the QR. The scanner rebuilds the message with **its own** values, so a QR made for another deployment fails the signature check.

**Holder (`/pass/[id]`):**
- Signs with Dynamic's `signMessage` and renders the QR with `qrcode`.
- The QR is valid for 300 s.
- Email accounts sign silently, so the QR refreshes itself. Accounts using their own wallet tap to re-sign.

**Scanner (`/scan/[id]`):**
- Reads the camera via `getUserMedia` and decodes ~4 frames/s with `jsqr`. A paste box covers devices without a camera.
- Checks, in order:
  1. format
  2. campaign id
  3. freshness (≤ 300 s, ≤ 60 s clock skew)
  4. replay (nonce seen in this session or in `localStorage`)
  5. signature: `recoverMessageAddress`, then ERC-1271/6492 via `verifyMessage`
  6. `hasClaimed` on-chain

Tested cases: valid · replay · expired · wrong campaign · forged signature · account without a pass · garbage.

**Known limit:** the replay set lives on each scanner device, so within 5 minutes a QR could be accepted at a second scanner.

---

## 9. Tooling

- `scripts/stress.ts` runs the burst:
  1. Create a campaign.
  2. Generate N keys (saved, gitignored).
  3. Fund the wallets through `Disperse` in batches of 100.
  4. Wait until every balance is visible **and** 10 blocks have passed.
  5. Pre-sign `register()` with an explicit gas limit (estimate × 1.15) and fire every transaction concurrently.
  6. Retry transport errors by re-signing with `maxFee + attempt` wei.
  7. Measure, optionally draw and verify.
  8. Write `scripts/results/results.json`, a timestamped copy, and `web/public/stress/latest.json`.
- `scripts/sweep.ts` returns leftover MON to the deployer. The transfer has an explicit 21,000 gas limit and `maxFee` = base fee. Each wallet sends one "emptying transaction", allowed by Monad's reserve-balance rules because the sender isn't delegated and was idle for more than 3 blocks. Wallets holding less than 2× the transfer fee are skipped and reported, because sweeping them would cost more than it returns.
- `scripts/gen-abi.mjs` copies the ABIs into `scripts/`, `web/` and `indexer/abis/`, and `select.ts` into the web app.
- `web/scripts/gen-brand-assets.tsx` renders the favicon, app icons and share image with `next/og`.

---

## 10. Monad behaviour we hit

1. **Gas limit is charged, not gas used.** Every transaction we send has an explicit, tight limit.
2. **A send right after funding gets rejected:** `Signer had insufficient balance` within ~150 ms of the funding receipt, even though `eth_getBalance` already showed the funds. Waiting 10 blocks fixed it. Our interpretation is lagged-state validation (deferred execution). This is inferred, not documented.
3. **Rejections are sticky per transaction hash.** Re-sending identical bytes kept failing, while a 1-wei change was accepted at once.
4. **Large JSON-RPC batches are refused** by the public RPC, so polling is chunked by 20.
5. **Reserve balance.** Funding stays within limits by using one Disperse transaction per batch. Sweeping relies on the emptying-transaction exception.

---

## 11. Security model and secrets

- **Secrets never committed:** `.env`, `.env.local` and `scripts/.wallets/` are gitignored, and `.env.example` documents every variable.
- **Server-only:**
  - `ALCHEMY_RPC_URL`
  - `ALCHEMY_WEBHOOK_SIGNING_KEY`
  - `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`
  - `RESEND_API_KEY`, `EMAIL_FROM`
- **Public, and restricted where the provider allows it:**
  - `NEXT_PUBLIC_DYNAMIC_ENVIRONMENT_ID`: Allowed Origins in Dynamic.
  - `NEXT_PUBLIC_ALCHEMY_RPC_URL`: domain allowlist in Alchemy.
- **Inputs:** campaign ids are parsed strictly, the webhook payload is only used to find campaign ids, and email content escapes the campaign name.
- **Trust boundaries:** the indexer, webhook and email are untrusted conveniences. The contract decides.
