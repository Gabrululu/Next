"use client";

import jsQR from "jsqr";
import { use, useCallback, useEffect, useRef, useState } from "react";
import { usePublicClient, useReadContract } from "wagmi";
import { NEXT_ADDRESS, short } from "@/lib/config";
import { verifyPassQr, type ScanResult } from "@/lib/passQr";
import { nextAbi } from "@/lib/shared/abi";

export default function ScanPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: raw } = use(params);
  const id = /^\d+$/.test(raw) ? BigInt(raw) : 0n;
  const client = usePublicClient();
  const campaign = useReadContract({ address: NEXT_ADDRESS, abi: nextAbi, functionName: "getCampaign", args: [id], query: { enabled: id > 0n } });

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [scanning, setScanning] = useState(false);
  const [checking, setChecking] = useState(false);
  const [result, setResult] = useState<ScanResult>();
  const [camError, setCamError] = useState<string>();
  const [checkedIn, setCheckedIn] = useState<string[]>([]);
  const [paste, setPaste] = useState("");

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setScanning(false);
  }, []);
  useEffect(() => stop, [stop]);

  const check = useCallback(async (text: string) => {
    if (!client) return;
    setChecking(true);
    try {
      const r = await verifyPassQr(text, id, client);
      setResult(r);
      if (r.ok) setCheckedIn((l) => [r.claim.address, ...l]);
    } catch {
      setResult({ ok: false, reason: "Couldn't reach the network to check the pass. Try again." });
    } finally {
      setChecking(false);
    }
  }, [client, id]);

  const start = async () => {
    setCamError(undefined); setResult(undefined);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false });
      streamRef.current = stream;
      const v = videoRef.current!;
      v.srcObject = stream;
      await v.play();
      setScanning(true);
    } catch {
      setCamError("Camera not available. Allow camera access, or paste the QR text below.");
    }
  };

  // Decode ~4 times a second while scanning; stop on the first QR found and check it.
  useEffect(() => {
    if (!scanning) return;
    const t = setInterval(() => {
      const v = videoRef.current, c = canvasRef.current;
      if (!v || !c || v.readyState < 2 || checking) return;
      c.width = v.videoWidth; c.height = v.videoHeight;
      const ctx = c.getContext("2d", { willReadFrequently: true });
      if (!ctx) return;
      ctx.drawImage(v, 0, 0);
      const code = jsQR(ctx.getImageData(0, 0, c.width, c.height).data, c.width, c.height);
      if (code?.data) { stop(); void check(code.data); }
    }, 250);
    return () => clearInterval(t);
  }, [scanning, checking, check, stop]);

  return (
    <div className="mx-auto max-w-xl px-4 pt-14 pb-16">
      <p className="label">Check-in · Campaign #{raw}</p>
      <h1 className="t-h2 font-display font-extrabold mt-3 break-words">{campaign.data?.name ?? "…"}</h1>
      <p className="mt-3 text-mute">Scan a winner&apos;s pass QR. Each scan checks the signature, the time, and that the account holds the pass on-chain.</p>

      <div className="mt-8 rounded-[2rem] overflow-hidden bg-[#0f0d13] border border-line relative aspect-square">
        <video ref={videoRef} playsInline muted className={`size-full object-cover ${scanning ? "" : "hidden"}`} />
        <canvas ref={canvasRef} className="hidden" />
        {!scanning && (
          <div className="absolute inset-0 grid place-items-center p-6 text-center">
            {checking ? <p className="label">Checking…</p>
            : result ? (
              <div role="status" className="space-y-3">
                <p className={`t-h2 font-display font-extrabold ${result.ok ? "text-ok" : "text-bad"}`}>{result.ok ? "Valid pass" : "Not valid"}</p>
                {result.claim && <p className="font-mono text-sm">{short(result.claim.address)}</p>}
                <p className="text-mute">{result.ok ? `Signed ${result.ageS}s ago. Checked in.` : result.reason}</p>
              </div>
            ) : <p className="text-mute">Camera is off.</p>}
          </div>
        )}
      </div>

      <div className="mt-5 flex gap-3">
        {scanning
          ? <button onClick={stop} className="flex-1 tactile rounded-2xl px-5 py-3 font-semibold">Stop</button>
          : <button onClick={() => void start()} disabled={checking || !client} className="flex-1 glow btn-volt rounded-2xl px-5 py-3 font-semibold">{result ? "Scan next" : "Start camera"}</button>}
      </div>
      {camError && <p role="alert" className="mt-3 text-sm text-bad">{camError}</p>}

      <details className="mt-6">
        <summary className="label cursor-pointer">No camera? Paste the QR text</summary>
        <form onSubmit={(e) => { e.preventDefault(); if (paste.trim()) void check(paste.trim()); }} className="mt-3 space-y-3">
          <textarea value={paste} onChange={(e) => setPaste(e.target.value)} rows={3} className="w-full rounded-xl tactile-pressed px-4 py-3 font-mono text-xs outline-none focus:ring-2 focus:ring-volt" />
          <button type="submit" disabled={checking || !paste.trim()} className="tactile rounded-xl px-4 py-2 font-semibold">Check</button>
        </form>
      </details>

      {checkedIn.length > 0 && (
        <section className="mt-10">
          <p className="label">Checked in on this device · {checkedIn.length}</p>
          <ul className="mt-3 space-y-1 font-mono text-sm">{checkedIn.map((a, i) => <li key={`${a}-${i}`}>{short(a)}</li>)}</ul>
        </section>
      )}

      <p className="mt-12 text-xs text-mute leading-relaxed">
        Limits: a QR stays valid for 5 minutes, and &quot;already scanned&quot; is remembered only on this device, so the same QR could pass at a second scanner within that window. A valid QR proves the account signed it, not who is holding the phone.
      </p>
    </div>
  );
}
