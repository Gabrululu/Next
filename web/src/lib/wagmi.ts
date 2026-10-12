import { createConfig, http } from "wagmi";
import { appChain, RPC_URL } from "./config";

// wagmi is used only for public chain reads (useReadContract, useBlockNumber, usePublicClient).
// Accounts and transactions go through Dynamic (see lib/wallet.ts).
export const wagmiConfig = createConfig({
  chains: [appChain],
  connectors: [],
  transports: { [appChain.id]: http(RPC_URL, { batch: true }) },
  ssr: true,
});

declare module "wagmi" {
  interface Register {
    config: typeof wagmiConfig;
  }
}
