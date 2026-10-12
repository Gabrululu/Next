import { defineChain, type Address } from "viem";

// All chain settings come from env vars (see /.env.example); nothing network-specific is hardcoded.
// Values for Monad come from https://docs.monad.xyz/ai/current-facts.md. Next.js inlines NEXT_PUBLIC_*
// only for literal `process.env.NAME` reads, so each one is read explicitly below.
const env = {
  chainId: process.env.NEXT_PUBLIC_CHAIN_ID,
  chainName: process.env.NEXT_PUBLIC_CHAIN_NAME,
  rpcUrl: process.env.NEXT_PUBLIC_RPC_URL,
  explorerUrl: process.env.NEXT_PUBLIC_EXPLORER_URL,
  faucetUrl: process.env.NEXT_PUBLIC_FAUCET_URL,
  multicall3: process.env.NEXT_PUBLIC_MULTICALL3,
  isTestnet: process.env.NEXT_PUBLIC_IS_TESTNET,
};

/** Required chain env vars that are missing (shown in the UI instead of silently defaulting). */
export const chainConfigMissing = (["chainId", "chainName", "rpcUrl", "explorerUrl"] as const)
  .filter((k) => !env[k])
  .map((k) => ({ chainId: "NEXT_PUBLIC_CHAIN_ID", chainName: "NEXT_PUBLIC_CHAIN_NAME", rpcUrl: "NEXT_PUBLIC_RPC_URL", explorerUrl: "NEXT_PUBLIC_EXPLORER_URL" })[k]);

export const CHAIN_ID = Number(env.chainId ?? 0);
export const CHAIN_NAME = env.chainName ?? "Unconfigured network";
export const RPC_URL = env.rpcUrl ?? "";
export const EXPLORER_URL = env.explorerUrl ?? "";
export const FAUCET_URL = env.faucetUrl ?? "";
export const IS_TESTNET = env.isTestnet === "true";

export const appChain = defineChain({
  id: CHAIN_ID,
  name: CHAIN_NAME,
  nativeCurrency: { name: "MON", symbol: "MON", decimals: 18 },
  rpcUrls: { default: { http: RPC_URL ? [RPC_URL] : [] } },
  blockExplorers: EXPLORER_URL ? { default: { name: "Explorer", url: EXPLORER_URL } } : undefined,
  // Optional; only set it after confirming the contract exists on this chain (checked on testnet 2026-10-12).
  contracts: env.multicall3 ? { multicall3: { address: env.multicall3 as Address } } : undefined,
  testnet: IS_TESTNET,
});

export const NEXT_ADDRESS = (process.env.NEXT_PUBLIC_NEXT_ADDRESS ?? "") as Address;
export const isConfigured = /^0x[0-9a-fA-F]{40}$/.test(NEXT_ADDRESS) && chainConfigMissing.length === 0;

export const explorerTx = (h: string) => `${EXPLORER_URL}/tx/${h}`;
export const explorerAddress = (a: string) => `${EXPLORER_URL}/address/${a}`;
export const explorerBlock = (b: bigint | number) => `${EXPLORER_URL}/block/${b}`;

export const short = (a?: string, n = 4) => (a ? `${a.slice(0, 2 + n)}…${a.slice(-n)}` : "");

// Previous deployment (before the organizer-cannot-register rule). Kept so its campaigns,
// including the recorded stress-test run, stay readable and verifiable.
export const LEGACY_NEXT_ADDRESS = (process.env.NEXT_PUBLIC_LEGACY_NEXT_ADDRESS ?? "") as Address;
export const hasLegacy = /^0x[0-9a-fA-F]{40}$/.test(LEGACY_NEXT_ADDRESS);

/** Only the two known deployments are accepted from a URL (?contract=…). */
export function resolveContract(param: string | null | undefined): { address: Address; legacy: boolean } {
  if (param && hasLegacy && param.toLowerCase() === LEGACY_NEXT_ADDRESS.toLowerCase()) return { address: LEGACY_NEXT_ADDRESS, legacy: true };
  return { address: NEXT_ADDRESS, legacy: false };
}

/** Query string to append to campaign/verify links for a given deployment. */
export const contractQuery = (address: string) =>
  hasLegacy && address.toLowerCase() === LEGACY_NEXT_ADDRESS.toLowerCase() ? `?contract=${LEGACY_NEXT_ADDRESS}` : "";
