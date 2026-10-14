"use client";

import { signMessage } from "@dynamic-labs-sdk/client";
import { sendSponsoredTransaction, SponsorTransactionError } from "@dynamic-labs-sdk/evm";
import { createWalletClientForWalletAccount } from "@dynamic-labs-sdk/evm/viem";
import { useState } from "react";
import { BaseError, encodeFunctionData, type Abi, type Address, type Hex, type TransactionReceipt } from "viem";
import { usePublicClient } from "wagmi";
import { dynamicClient } from "./dynamic";
import { topupMessage } from "./topup";
import { ensureAppNetwork, useAccountState } from "./wallet";

type Call = { address: Address; abi: Abi; functionName: string; args?: readonly unknown[] };

/**
 * One contract write for a signed-in participant.
 * Primary path: Dynamic gas sponsorship (sendSponsoredTransaction) — the user never needs MON.
 * Fallback (sponsorship rejected): the embedded wallet pays its own gas, with an explicit gas limit
 * (Monad charges the full limit), only if it holds enough MON; otherwise a plain-language error.
 */
export function useTx(onConfirmed?: (receipt: TransactionReceipt) => void) {
  const { account, embedded } = useAccountState();
  const publicClient = usePublicClient();
  const [stage, setStage] = useState<string>();
  const [hash, setHash] = useState<Hex>();
  const [receipt, setReceipt] = useState<TransactionReceipt>();
  const [error, setError] = useState<string>();
  const [sponsored, setSponsored] = useState<boolean>();

  const reset = () => { setStage(undefined); setHash(undefined); setReceipt(undefined); setError(undefined); setSponsored(undefined); };

  const send = async (call: Call) => {
    if (!account || !publicClient) { setError("Sign in first."); return; }
    reset();
    try {
      const data = encodeFunctionData({ abi: call.abi, functionName: call.functionName, args: call.args ?? [] } as never);
      setStage("Getting ready…");
      await ensureAppNetwork(account);

      let txHash: Hex | undefined;
      // Sponsorship only works for Dynamic embedded wallets (docs: "V3 MPC embedded wallets only");
      // a user's own wallet goes straight to the self-paid path.
      if (embedded) {
        try {
          setStage("Sending (fees covered)…");
          ({ transactionHash: txHash } = await sendSponsoredTransaction({ walletAccount: account, calls: [{ target: call.address, data, value: 0n }] }));
          setSponsored(true);
        } catch (e) {
          if (!(e instanceof SponsorTransactionError)) throw e;
          // Keep the relay's reason visible for debugging; the user still gets the plain fallback message.
          console.warn("[Next] Dynamic gas sponsorship failed:", e.message, e.cause ?? "");
        }
      }
      if (!txHash) {
        // Fallback: self-paid, explicit gas limit, only if the wallet can afford it.
        setStage(embedded ? "Sending…" : "Confirm in your wallet…");
        const gas = ((await publicClient.estimateGas({ account: account.address as Address, to: call.address, data })) * 12n) / 10n;
        const fees = await publicClient.estimateFeesPerGas();
        let balance = await publicClient.getBalance({ address: account.address as Address });
        if (balance < gas * fees.maxFeePerGas! && embedded) {
          // Email accounts: the app sends exactly this transaction's fee (see /api/gas/topup for why and the limits).
          setStage("Covering the network fee…");
          // Prove the account is ours (embedded wallets sign silently); see lib/topup.ts.
          const time = Math.floor(Date.now() / 1000);
          const { signature } = await signMessage({ walletAccount: account, message: topupMessage(account.address as Address, data, time) });
          const r = await fetch("/api/gas/topup", {
            method: "POST",
            headers: { "content-type": "application/json", ...(dynamicClient?.token ? { authorization: `Bearer ${dynamicClient.token}` } : {}) },
            body: JSON.stringify({ address: account.address, data, time, signature }),
          });
          if (!r.ok) {
            const j = (await r.json().catch(() => ({}))) as { error?: string };
            throw new Error(j.error ?? "We couldn't cover the network fee right now. Please try again in a minute.");
          }
          balance = await publicClient.getBalance({ address: account.address as Address });
          setStage("Sending…");
        }
        if (balance < gas * fees.maxFeePerGas!) throw new Error(embedded
          ? "We couldn't cover the network fee right now. Please try again in a minute."
          : "Your wallet needs a little MON for the network fee (get some from the faucet).");
        const walletClient = await createWalletClientForWalletAccount({ walletAccount: account });
        txHash = await walletClient.sendTransaction({ to: call.address, data, gas, account: walletClient.account!, chain: walletClient.chain });
        setSponsored(false);
      }

      setHash(txHash);
      setStage("Confirming…");
      // Monad's public RPC can lag a moment behind the chain: retry rather than invite a resubmission.
      const r = await publicClient.waitForTransactionReceipt({ hash: txHash, pollingInterval: 500, retryCount: 20 });
      setReceipt(r);
      setStage(undefined);
      if (r.status !== "success") setError("That didn't go through. Please try again.");
      else onConfirmed?.(r);
    } catch (e) {
      setStage(undefined);
      const msg = e instanceof BaseError ? e.shortMessage : ((e as Error).message.split("\n")[0] ?? "");
      // Dynamic throws this when the app's chain isn't enabled in the Dynamic dashboard (Chains & Networks).
      setError(/No network data found/i.test(msg) ? "This network isn't enabled for sign-in yet. The organizer of this app needs to enable it." : msg);
    }
  };

  return {
    send,
    hash,
    busy: !!stage,
    stage,
    done: receipt?.status === "success",
    receipt,
    error,
    /** true = gas paid via Dynamic sponsorship; false = fallback self-paid; undefined = not sent yet. */
    sponsored,
    reset,
  };
}
