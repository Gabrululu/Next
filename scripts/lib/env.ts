import { config } from "dotenv";
import { createPublicClient, defineChain, http, type Address, type Hex } from "viem";

config({ path: new URL("../../.env", import.meta.url) });

function need(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing ${name} in .env (see .env.example)`);
  return v;
}

export const RPC_URL = need("RPC_URL");
export const CHAIN_ID = Number(need("CHAIN_ID"));
export const EXPLORER_URL = need("EXPLORER_URL");
export const CHAIN_NAME = need("CHAIN_NAME");

export const chain = defineChain({
  id: CHAIN_ID,
  name: CHAIN_NAME,
  nativeCurrency: { name: "MON", symbol: "MON", decimals: 18 },
  rpcUrls: { default: { http: [RPC_URL] } },
});

export const publicClient = createPublicClient({ chain, transport: http(RPC_URL, { batch: true }) });

export const nextAddress = () => need("NEXT_ADDRESS") as Address;
export const disperseAddress = () => need("DISPERSE_ADDRESS") as Address;
export const deployerKey = () => need("PRIVATE_KEY") as Hex;
