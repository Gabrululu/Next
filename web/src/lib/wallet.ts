"use client";

// Participant account = Dynamic embedded (WaaS) wallet behind an email OTP sign-in.
// Flow per https://www.dynamic.xyz/docs/recipes/chains/monad:
// sendEmailOTP -> verifyOTP -> createWaasWalletAccounts -> switch network (NetworkNotAddedError -> addNetwork)
// -> sendSponsoredTransaction (gas paid by the app via Dynamic) or a viem WalletClient.
import { addNetwork, NetworkNotAddedError, switchActiveNetwork } from "@dynamic-labs-sdk/client";
import { isEvmWalletAccount, type EvmWalletAccount } from "@dynamic-labs-sdk/evm";
import { useGetWalletAccounts, useInitStatus, useUser } from "@dynamic-labs-sdk/react-hooks";
import type { Address } from "viem";
import { appChain } from "./config";
import { dynamicClient } from "./dynamic";

export type AccountState = {
  /** Dynamic environment id is configured (NEXT_PUBLIC_DYNAMIC_ENVIRONMENT_ID). */
  configured: boolean;
  /** SDK finished initializing (safe to read user/wallets). */
  ready: boolean;
  /** Signed in AND the embedded wallet exists. */
  isConnected: boolean;
  signedIn: boolean;
  email?: string;
  address?: Address;
  /** Kept for compatibility with pages: the app chain once signed in (network is switched before each tx). */
  chainId?: number;
  account?: EvmWalletAccount;
};

const DISABLED: AccountState = { configured: false, ready: true, isConnected: false, signedIn: false };

/**
 * dynamicClient is a module constant (null when unconfigured), so the branch below is identical on
 * every render of a given page load and the hook order never changes.
 */
export function useAccountState(): AccountState {
  if (!dynamicClient) return DISABLED;
  // eslint-disable-next-line react-hooks/rules-of-hooks
  return useDynamicAccountState();
}

function useDynamicAccountState(): AccountState {
  const { data: init } = useInitStatus();
  const { data: user } = useUser();
  const { data: accounts } = useGetWalletAccounts();
  const account = accounts?.find(isEvmWalletAccount);
  const email = (user as { email?: string | null } | null | undefined)?.email ?? undefined;
  return {
    configured: true,
    ready: init === "finished",
    signedIn: !!user,
    isConnected: !!user && !!account,
    email,
    address: account?.address as Address | undefined,
    chainId: account ? appChain.id : undefined,
    account,
  };
}

/** Puts the embedded wallet on the app's chain; adds the network first if Dynamic doesn't know it yet. */
export async function ensureAppNetwork(walletAccount: EvmWalletAccount) {
  const networkId = String(appChain.id); // EVM network id = chain id (Dynamic docs: switch-active-network)
  try {
    await switchActiveNetwork({ walletAccount, networkId });
  } catch (error) {
    if (error instanceof NetworkNotAddedError) {
      await addNetwork({ walletAccount, networkData: error.networkData });
      await switchActiveNetwork({ walletAccount, networkId });
    } else {
      throw error;
    }
  }
}
