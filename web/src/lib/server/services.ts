// Server-only clients for step 8. Every function degrades gracefully: callers check the `has*` flags and
// return a clear "not configured" response instead of failing obscurely. Secrets never leave the server.
import { createPublicClient, fallback, http } from "viem";
import { appChain, RPC_URL } from "../config";

// ---------------------------------------------------------------- chain (Alchemy first, public RPC fallback)
const ALCHEMY = process.env.ALCHEMY_RPC_URL ?? "";
export const serverClient = createPublicClient({
  chain: appChain,
  transport: ALCHEMY ? fallback([http(ALCHEMY), http(RPC_URL)]) : http(RPC_URL),
});

// ---------------------------------------------------------------- Upstash Redis (REST: https://upstash.com/docs/redis/features/restapi)
const REDIS_URL = process.env.UPSTASH_REDIS_REST_URL ?? "";
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN ?? "";
export const hasRedis = !!REDIS_URL && !!REDIS_TOKEN;

export async function redis<T = unknown>(...command: (string | number)[]): Promise<T> {
  if (!hasRedis) throw new Error("Upstash not configured");
  const res = await fetch(REDIS_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${REDIS_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify(command),
    cache: "no-store",
  });
  const json = (await res.json()) as { result?: T; error?: string };
  if (!res.ok || json.error) throw new Error(`Upstash: ${json.error ?? res.status}`);
  return json.result as T;
}

// ---------------------------------------------------------------- Resend (https://resend.com/docs/api-reference/emails/send-email)
const RESEND_KEY = process.env.RESEND_API_KEY ?? "";
const EMAIL_FROM = process.env.EMAIL_FROM ?? "";
export const hasEmail = !!RESEND_KEY && !!EMAIL_FROM;

export async function sendEmail(msg: { to: string; subject: string; text: string; html: string; idempotencyKey: string }) {
  if (!hasEmail) throw new Error("Resend not configured");
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RESEND_KEY}`,
      "Content-Type": "application/json",
      // Same key for retried webhook deliveries -> Resend sends the email once (24 h window).
      "Idempotency-Key": msg.idempotencyKey.slice(0, 256),
    },
    body: JSON.stringify({ from: EMAIL_FROM, to: [msg.to], subject: msg.subject, text: msg.text, html: msg.html }),
  });
  if (!res.ok) throw new Error(`Resend ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return (await res.json()) as { id: string };
}
