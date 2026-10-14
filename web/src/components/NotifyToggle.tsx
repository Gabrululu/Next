"use client";

// Opt-in: "email me the result". Only for people signed in with email who are in line and not drawn yet.
// Sends the Dynamic access token (dynamicClient.token, per Dynamic docs); the server takes the email from the
// verified token and checks on-chain that this account is registered. Hidden when the server isn't configured.
import { useEffect, useState } from "react";
import { dynamicClient } from "@/lib/dynamic";
import { useT } from "@/lib/i18n";

type State = { configured: boolean; subscribed: boolean } | undefined;

export function NotifyToggle({ campaignId, email }: { campaignId: bigint; email: string }) {
  const t = useT();
  const [state, setState] = useState<State>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  const call = (method: "GET" | "POST" | "DELETE") => {
    const token = dynamicClient?.token;
    const headers: Record<string, string> = { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) };
    return method === "GET"
      ? fetch(`/api/notify?campaignId=${campaignId}`, { headers, cache: "no-store" })
      : fetch("/api/notify", { method, headers, body: JSON.stringify({ campaignId: campaignId.toString() }) });
  };

  useEffect(() => {
    let stop = false;
    call("GET")
      .then((r) => (r.ok ? r.json() : { configured: false, subscribed: false }))
      .then((j: { configured: boolean; subscribed: boolean }) => { if (!stop) setState(j); })
      .catch(() => { if (!stop) setState({ configured: false, subscribed: false }); });
    return () => { stop = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campaignId]);

  if (!state?.configured) return null;

  const toggle = async () => {
    setBusy(true); setError(undefined);
    try {
      const r = await call(state.subscribed ? "DELETE" : "POST");
      const j = (await r.json()) as { subscribed?: boolean; error?: string };
      if (!r.ok) setError(t(j.error ?? "Something went wrong. Please try again."));
      else setState({ configured: true, subscribed: !!j.subscribed });
    } catch {
      setError(t("Something went wrong. Please try again."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-2xl tactile-pressed p-4 text-sm">
      <label className="flex items-start gap-3 cursor-pointer">
        <input type="checkbox" className="mt-0.5 size-4 accent-[var(--color-volt)]" checked={state.subscribed} disabled={busy} onChange={() => void toggle()} />
        <span>
          <span className="font-semibold">{t("Email me the result")}</span>
          <span className="block text-mute">
            {state.subscribed ? t("We'll write to {email} when the draw happens.", { email }) : t("One email to {email} after the draw. Nothing else.", { email })}
          </span>
        </span>
      </label>
      {error && <p role="alert" className="mt-2 text-bad">{error}</p>}
    </div>
  );
}
