"use client";

import { DynamicProvider } from "@dynamic-labs-sdk/react-hooks";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MotionConfig } from "framer-motion";
import { useState, type ReactNode } from "react";
import { WagmiProvider } from "wagmi";
import { dynamicClient } from "@/lib/dynamic";
import { wagmiConfig } from "@/lib/wagmi";

export function Providers({ children }: { children: ReactNode }) {
  const [qc] = useState(() => new QueryClient());
  // Dynamic must sit inside QueryClientProvider (per Dynamic's Next.js App Router guide).
  const inner = <MotionConfig reducedMotion="user">{children}</MotionConfig>;
  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={qc}>
        {dynamicClient ? <DynamicProvider client={dynamicClient}>{inner}</DynamicProvider> : inner}
      </QueryClientProvider>
    </WagmiProvider>
  );
}
