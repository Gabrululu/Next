import { fallback, http } from "viem";
import { createConfig } from "wagmi";
import { appChain, RPC_URL } from "./config";

// Alchemy first (browser key restricted by domain in the Alchemy dashboard), public RPC as fallback:
// viem's fallback transport moves to the next URL when one errors or times out.
export const ALCHEMY_RPC_URL = process.env.NEXT_PUBLIC_ALCHEMY_RPC_URL ?? "";
const transports = [
  ...(ALCHEMY_RPC_URL ? [http(ALCHEMY_RPC_URL)] : []),
  http(RPC_URL, { batch: true }),
];

// wagmi is used only for public chain reads (useReadContract, useBlockNumber, usePublicClient).
// Accounts and transactions go through Dynamic (see lib/wallet.ts).
export const wagmiConfig = createConfig({
  chains: [appChain],
  connectors: [],
  transports: { [appChain.id]: transports.length > 1 ? fallback(transports) : transports[0]! },
  ssr: true,
});

declare module "wagmi" {
  interface Register {
    config: typeof wagmiConfig;
  }
}
