"use client";

// Dynamic JS SDK client (new @dynamic-labs-sdk packages), created once per page load.
// Setup per https://www.dynamic.xyz/docs/javascript/reference/nextjs-app-router.md:
// module-level singleton, autoInitialize:false + initializeClient() only in the browser,
// extensions registered right after creation. Never import this file from a Server Component.
import { createDynamicClient, initializeClient, type DynamicClient } from "@dynamic-labs-sdk/client";
import { addEvmExtension } from "@dynamic-labs-sdk/evm";
import { addWaasEvmExtension } from "@dynamic-labs-sdk/evm/waas";

export const DYNAMIC_ENVIRONMENT_ID = process.env.NEXT_PUBLIC_DYNAMIC_ENVIRONMENT_ID ?? "";

function create(): DynamicClient | null {
  // Missing env id: the app still renders and reads chain data; sign-in shows a config notice instead.
  if (!DYNAMIC_ENVIRONMENT_ID) return null;
  const client = createDynamicClient({
    environmentId: DYNAMIC_ENVIRONMENT_ID,
    autoInitialize: false,
    metadata: {
      name: "Next",
      ...(typeof window !== "undefined" ? { universalLink: window.location.origin } : {}),
    },
  });
  // Extensions touch `window`, so they (and initialization) run only in the browser. On the server the
  // client stays uninitialized: hooks report `useInitStatus() !== "finished"`, the UI renders its
  // signed-out placeholder, and the browser initializes after hydration (no SSR/client mismatch).
  if (typeof window !== "undefined") {
    addEvmExtension();
    addWaasEvmExtension(); // Dynamic embedded (WaaS) EVM wallets: the participant's only account
    void initializeClient(client);
  }
  return client;
}

export const dynamicClient = create();
