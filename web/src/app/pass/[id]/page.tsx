"use client";

import { signMessage } from "@dynamic-labs-sdk/client";
import Link from "next/link";
import QRCode from "qrcode";
import { use, useCallback, useEffect, useState } from "react";
import { useReadContract } from "wagmi";
import { ConnectButton } from "@/components/ConnectButton";
import { NEXT_ADDRESS, short } from "@/lib/config";
import { PASS_QR_TTL_S, encodePassQr, newPassClaim, passMessage } from "@/lib/passQr";
import { nextAbi } from "@/lib/shared/abi";
import { useAccountState } from "@/lib/wallet";
import type { Hex } from "viem";
import { useT } from "@/lib/i18n";

export default function PassPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: raw } = use(params);
  const id = /^\d+$/.test(raw) ? BigInt(raw) : 0n;
  const { account, address, isConnected, embedded, ready } = useAccountState();
  const t = useT();

  const campaign = useReadContract({ address: NEXT_ADDRESS, abi: nextAbi, functionName: "getCampaign", args: [id], query: { enabled: id > 0n } });
  const claimed = useReadContract({ address: NEXT_ADDRESS, abi: nextAbi, functionName: "hasClaimed", args: [id, address!], query: { enabled: id > 0n && !!address } });

  const [qr, setQr] = useState<{ img: string; expiresAt: number }>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);

  const generate = useCallback(async () => {
    if (!account || !address) return;
    setBusy(true); setError(undefined);
    try {
      const claim = newPassClaim(id, address);
      const { signature } = await signMessage({ walletAccount: account, message: passMessage(claim) });
      const img = await QRCode.toDataURL(encodePassQr(claim, signature as Hex), { errorCorrectionLevel: "M", margin: 2, width: 360 });
      setQr({ img, expiresAt: (claim.timestamp + PASS_QR_TTL_S) * 1000 });
    } catch (e) {
      setError((e as Error).message.split("\n")[0] || t("Couldn't sign. Please try again."));
    } finally {
      setBusy(false);
    }
  }, [account, address, id]);

  const left = qr ? Math.max(0, Math.round((qr.expiresAt - now) / 1000)) : 0;
  // Email accounts sign silently, so their QR refreshes itself; a wallet app would prompt every time, so it waits for a tap.
  useEffect(() => {
    if (embedded && claimed.data && !busy && !error && (!qr || left === 0)) void generate();
  }, [embedded, claimed.data, qr, left, busy, error, generate]);

  const name = campaign.data?.name;
  return (
    <div className="mx-auto max-w-md px-4 pt-14 pb-16 text-center">
      <p className="label">{t("Pass · Campaign #{id}", { id: raw })}</p>
      <h1 className="t-h2 font-display font-extrabold mt-3 break-words">{name ?? "…"}</h1>

      {id === 0n ? <p className="mt-8 text-mute">{t("Invalid campaign id.")}</p>
      : !ready ? <p className="mt-8 label">{t("Loading…")}</p>
      : !isConnected ? (
        <div className="mt-8 space-y-4">
          <p className="text-mute">{t("Sign in with the account that won to show your pass.")}</p>
          <ConnectButton big />
        </div>
      ) : claimed.isLoading ? <p className="mt-8 label">{t("Checking your pass…")}</p>
      : !claimed.data ? (
        <div className="mt-8 space-y-4">
          <p className="text-mute">{t("{address} has no pass for this campaign. Winners claim it on the campaign page.", { address: short(address!) })}</p>
          <Link href={`/c/${raw}`} className="glow inline-block rounded-2xl border border-line px-5 py-3 font-semibold">{t("Go to the campaign →")}</Link>
        </div>
      ) : (
        <div className="mt-8 flex flex-col items-center gap-5">
          <div className="rounded-[2rem] bg-white p-4 shadow-[0_30px_80px_-30px_rgba(157,107,255,0.5)]">
            {qr && left > 0
              // eslint-disable-next-line @next/next/no-img-element
              ? <img src={qr.img} alt={t("Check-in QR for {address}", { address: short(address!) })} width={300} height={300} className="size-[min(78vw,300px)]" />
              : <div className="size-[min(78vw,300px)] grid place-items-center text-ink text-sm">{busy ? t("Signing…") : t("QR expired")}</div>}
          </div>
          <p className="font-mono text-sm">{short(address!)}</p>
          {qr && left > 0 ? (
            <p className="label">{t("Valid for {time}", { time: `${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}` })}{embedded ? ` · ${t("refreshes automatically")}` : ""}</p>
          ) : null}
          {(!embedded || error) && (
            <button onClick={() => void generate()} disabled={busy} className="glow btn-volt rounded-2xl px-6 py-3 font-semibold">
              {busy ? t("Check your wallet…") : qr ? t("Refresh QR") : t("Show my QR")}
            </button>
          )}
          {error && <p role="alert" className="text-sm text-bad">{error}</p>}
          <p className="text-xs text-mute max-w-[34ch]">
            {t("Show this at the entrance. It's signed by your account and expires after {n} minutes. Don't share screenshots: anyone holding a fresh QR could use it until it expires.", { n: PASS_QR_TTL_S / 60 })}
          </p>
        </div>
      )}
    </div>
  );
}
