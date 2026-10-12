"use client";

// Email sign-in (Dynamic email OTP + embedded wallet). The participant's only account:
// no wallet app, no network picker, no gas. Name kept as ConnectButton so pages didn't need changes.
import { logout, sendEmailOTP, verifyOTP } from "@dynamic-labs-sdk/client";
import { createWaasWalletAccounts, getChainsMissingWaasWalletAccounts } from "@dynamic-labs-sdk/client/waas";
import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { useAccountState } from "@/lib/wallet";

type OtpVerification = Awaited<ReturnType<typeof sendEmailOTP>>;

/** Creates the embedded wallet if the user doesn't have one yet; resolves once it exists. */
async function ensureEmbeddedWallet() {
  const missing = getChainsMissingWaasWalletAccounts();
  if (missing.length) await createWaasWalletAccounts({ chains: missing });
}

export function ConnectButton({ big = false }: { big?: boolean }) {
  const s = useAccountState();
  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => setMounted(true), []);

  // Signed in but no embedded wallet yet (e.g. first login with "create on sign up" off): create it.
  useEffect(() => {
    if (!s.ready || !s.signedIn || s.account || creating) return;
    setCreating(true);
    ensureEmbeddedWallet().catch(() => undefined).finally(() => setCreating(false));
  }, [s.ready, s.signedIn, s.account, creating]);

  // close the compact popover on outside click / Escape
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); };
  }, [open]);

  const cls = `${big ? "px-6 py-3 text-base w-full sm:w-auto" : "px-4 py-2 text-sm"} rounded-2xl font-semibold transition-transform active:scale-[0.97]`;
  if (!mounted || !s.ready) return <span className={`${cls} tactile opacity-0`} aria-hidden>Sign in</span>;
  if (!s.configured) return <span className="text-xs text-mute">Sign-in not configured (NEXT_PUBLIC_DYNAMIC_ENVIRONMENT_ID)</span>;

  if (s.signedIn) {
    if (!s.account || creating) return <span className={`${cls} tactile text-mute`}>Setting up your account…</span>;
    return (
      <div className="inline-flex items-center gap-2">
        <span className={`${cls} tactile max-w-[14rem] truncate`} title={s.email}>{s.email ?? "Signed in"}</span>
        <button onClick={() => logout()} className="label hover:text-paper">Sign out</button>
      </div>
    );
  }

  if (big) return <EmailSignIn />;
  return (
    <div ref={ref} className="relative inline-block">
      <button className={`${cls} glow btn-volt`} aria-expanded={open} onClick={() => setOpen((o) => !o)}>Sign in</button>
      <AnimatePresence>
        {open && (
          <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.18 }}
            className="absolute right-0 top-full mt-2 z-50 w-80 rounded-2xl tactile p-4">
            <EmailSignIn />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/** Two steps: email -> 6-digit code. Plain language, no wallet jargon. */
export function EmailSignIn() {
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [otp, setOtp] = useState<OtpVerification>();
  const [busy, setBusy] = useState<string>();
  const [error, setError] = useState<string>();

  const sendCode = async () => {
    setError(undefined); setBusy("Sending code…");
    try { setOtp(await sendEmailOTP({ email: email.trim() })); }
    catch (e) { setError(friendly(e)); }
    finally { setBusy(undefined); }
  };

  const verify = async () => {
    if (!otp) return;
    setError(undefined); setBusy("Checking code…");
    try {
      await verifyOTP({ otpVerification: otp, verificationToken: code.trim() });
      setBusy("Setting up your account…");
      await ensureEmbeddedWallet(); // wait for it before anything reads the address (Monad recipe)
    } catch (e) { setError(friendly(e)); }
    finally { setBusy(undefined); }
  };

  const input = "w-full rounded-xl tactile-pressed px-4 py-3 outline-none focus:ring-2 focus:ring-volt";
  return (
    <div className="space-y-3 text-left">
      {!otp ? (
        <form onSubmit={(e) => { e.preventDefault(); void sendCode(); }} className="space-y-3">
          <label htmlFor="signin-email" className="label block">Sign in with your email</label>
          <input id="signin-email" type="email" required autoComplete="email" inputMode="email" placeholder="you@example.com"
            value={email} onChange={(e) => setEmail(e.target.value)} className={input} />
          <button type="submit" disabled={!!busy || !email.includes("@")} className="w-full glow btn-volt rounded-xl px-4 py-3 font-semibold">
            {busy ?? "Email me a code"}
          </button>
          <p className="text-xs text-mute">We&apos;ll send a 6-digit code. No password, no app to install.</p>
        </form>
      ) : (
        <form onSubmit={(e) => { e.preventDefault(); void verify(); }} className="space-y-3">
          <label htmlFor="signin-code" className="label block">Enter the code sent to {email}</label>
          <input id="signin-code" required autoComplete="one-time-code" inputMode="numeric" pattern="[0-9]*" maxLength={6} placeholder="123456"
            value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} className={`${input} font-mono tracking-[0.4em] text-lg`} />
          <button type="submit" disabled={!!busy || code.length < 6} className="w-full glow btn-volt rounded-xl px-4 py-3 font-semibold">
            {busy ?? "Continue"}
          </button>
          <button type="button" onClick={() => { setOtp(undefined); setCode(""); }} className="label hover:text-paper">Use a different email</button>
        </form>
      )}
      {error && <p role="alert" className="text-sm text-bad">{error}</p>}
    </div>
  );
}

function friendly(e: unknown) {
  const msg = (e as Error)?.message ?? String(e);
  if (/invalid|incorrect|expired/i.test(msg)) return "That code didn't work. Check it or ask for a new one.";
  return msg.split("\n")[0];
}
