# Sponsor integrations

How Next uses each sponsor, where the code lives, how to check it, and what's still pending. Each integration was built from the provider's official docs. Where the docs and the plan disagreed, the difference is listed under **Notes**.

---

## Dynamic: accounts and network fees

**What it does**
- **Email sign-in without a wallet app.** `sendEmailOTP` → `verifyOTP` → `createWaasWalletAccounts`, which creates an embedded wallet for each new user.
- **The app pays network fees.** Every write (`createCampaign`, `register`, `draw`, `recommit`, `claim`) from an embedded wallet goes through `sendSponsoredTransaction`.
- **Bring your own wallet.** `getAvailableWalletProvidersData` lists the browser-extension EVM wallets, and `connectAndVerifyWithWalletProvider` signs a free message to sign in. These users pay their own fee.
- **Network handling.** `switchActiveNetwork` to Monad testnet; on `NetworkNotAddedError`, `addNetwork` and then switch.
- **Pass QR signing.** `signMessage` signs the check-in QR.
- **Backend auth.** `/api/notify` verifies Dynamic access tokens with the environment JWKS (RS256), requires the `user:basic` scope, and reads the email and verified addresses from the token.

**Where**
- `web/src/lib/dynamic.ts`
- `web/src/lib/wallet.ts`
- `web/src/lib/useTx.ts`
- `web/src/components/ConnectButton.tsx`
- `web/src/app/pass/[id]/page.tsx`
- `web/src/lib/server/dynamicAuth.ts`

**Fallback**
- If sponsorship is rejected (`SponsorTransactionError`, reason logged to the console), the app tops up the embedded wallet for that one transaction (see Notes) and sends it with an explicit gas limit. If the top-up isn't configured or a limit is reached, the user gets a plain-language message.
- Without `NEXT_PUBLIC_DYNAMIC_ENVIRONMENT_ID`, the app stays read-only and says sign-in isn't configured.

**How to check**
1. Sign in with email on https://next-monad.vercel.app.
2. Create a campaign and join it from another account.
3. Open the transactions on the explorer.

**Status:** deployed in production. The end-to-end test on a phone is pending.

**Notes**
- The spec's `isEvmGasSponsorshipEnabled` does not exist in Dynamic's docs, so it isn't used.
- **Sponsorship doesn't run on Monad testnet (checked on-chain, 2026-10-13).** It delegates the account (EIP-7702) to Dynamic's contract `0x0000Fb7702036ff9f76044a501ac1aA74cbab16b`. That address has code on Sepolia and Base Sepolia, the networks Dynamic's docs list, but `eth_getCode` returns `0x` on Monad testnet. This holds even with sponsorship enabled for testnet in the dashboard. The app still tries `sendSponsoredTransaction` first, so it starts working the day Dynamic deploys there.
- **Fallback in production: app fee top-up.** `POST /api/gas/topup` (`web/src/app/api/gas/topup/route.ts`) sends an email account the MON for exactly one transaction, and the account then pays its own fee.
  - It verifies the Dynamic session (JWT).
  - The funded address must be one of the session's verified addresses.
  - It only accepts calls to `Next` that succeed in simulation.
  - The amount is the explicit gas limit × max fee, minus the account's current balance, capped at 0.05 MON per transaction.
  - Daily limits live in Upstash: 20 top-ups per user and 3 MON overall. Without Upstash it refuses (fails closed).
  - It then waits 10 blocks, so the RPC accepts the spend.
  - The key is a testnet-only wallet in `GAS_TOPUP_PRIVATE_KEY`, server-side only.
- Sponsorship is documented for "V3 MPC embedded wallets only", so external wallets are never sent through it.

---

## Envio: indexing

**What it does**
- A HyperIndex project (envio 3.14.0) on Monad testnet through HyperSync, with the Monad RPC as fallback. It indexes `CampaignCreated`, `Registered`, `Winner`, `Drawn`, `Recommitted`, `Claimed` and `NextPass.PassMinted`.
- Entities: `Campaign`, `Registration`, `Draw`, `Winner`, `Pass`, `CampaignBlockStat` (joins per block), `CampaignStats`, `GlobalStats`.
- Used in the app by:
  - the verifier's registrant list (only when its count equals the on-chain count)
  - the live panel on `/stress` (every 2 s)
  - "Latest in line" on campaign pages

**Where**
- `indexer/`: `config.yaml`, `schema.graphql`, `src/handlers/`, `src/indexer.test.ts`
- `web/src/lib/envio.ts`
- `web/src/lib/registrants.ts`
- `web/src/components/LivePanel.tsx`

**Fallback:** every reader uses direct contract reads when `NEXT_PUBLIC_ENVIO_GRAPHQL_URL` is unset, the indexer is unreachable, or its data disagrees with the chain.

**How to check:** `cd indexer && pnpm codegen && pnpm typecheck && pnpm test`, in WSL on Windows. The test simulates a full campaign lifecycle.

**Status:** code complete and tested. **The Envio Cloud deployment is blocked:** the GitHub App is installed with access to the repo, but `envio-cloud repos` lists no linked repositories and pushes create no deployments ("No commits found"). Reported to Envio support.

**Notes**
- Envio Cloud does not expose GraphQL aggregate queries, so totals are computed in handlers.
- Envio does not run natively on Windows.

---

## Alchemy: RPC and webhook

**What it does**
- **RPC:** Monad testnet endpoint for browser reads (`NEXT_PUBLIC_ALCHEMY_RPC_URL`, domain-restricted) and server reads (`ALCHEMY_RPC_URL`). Both use viem `fallback` to the public RPC.
- **Custom Webhook** on the `Next` contract's `Drawn` event → `POST /api/webhooks/alchemy`:
  - The HMAC-SHA256 signature (`X-Alchemy-Signature`) is checked against the raw body.
  - Campaign ids come from the logs.
  - Results are re-read from the contract, and each subscriber gets their own result by email.
- **Email** uses Upstash Redis for opt-ins (keyed by campaign; deleted after sending) and Resend for delivery, with an `Idempotency-Key` per recipient so webhook retries never send twice.

**Where**
- `web/src/lib/wagmi.ts`
- `web/src/lib/server/services.ts`
- `web/src/lib/server/notify.ts`
- `web/src/app/api/webhooks/alchemy/route.ts`
- `web/src/app/api/notify/route.ts`
- `web/src/components/NotifyToggle.tsx`

**Fallback:** the public RPC when Alchemy errors. The webhook returns 401 on a bad signature, and 500 (so Alchemy retries) only if an email failed.

**How to check**
- In production, the browser's network requests go to `monad-testnet.g.alchemy.com`.
- `curl -X POST https://next-monad.vercel.app/api/webhooks/alchemy` returns 401.

**Webhook query** (Custom Webhook, Monad Testnet):

```graphql
{
  block {
    number
    logs(filter: {
      addresses: ["0x21b0b22Bc33b8476cD9491Efd23F8A08EE560D1A"],
      topics: [["0x69086fb1ed17839c0f260d7cefca39cada7da559e9dcce95ef9da2e97c838121"]]
    }) {
      topics
      account { address }
      transaction { hash }
    }
  }
}
```

**Status:** RPC is live in production. The webhook code is deployed and signature-tested; the webhook still has to be created in the Alchemy dashboard and its signing key set in Vercel.

**Notes:** Alchemy's webhook docs don't list supported networks, so Monad testnet support for Custom Webhooks has to be confirmed in the dashboard.
