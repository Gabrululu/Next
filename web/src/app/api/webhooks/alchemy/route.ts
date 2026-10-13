// Alchemy webhook receiver (Custom webhook on the Next contract's Drawn event).
// Signature check per Alchemy docs: HMAC-SHA256 of the RAW body with the webhook's signing key,
// hex digest compared to the X-Alchemy-Signature header. Unsigned or mismatched requests get 401.
// The payload is only used to learn WHICH campaigns were drawn; results are re-read from the contract.
import { createHmac, timingSafeEqual } from "node:crypto";
import { drawnCampaignIds, notifyDrawn } from "@/lib/server/notify";
import { hasEmail, hasRedis } from "@/lib/server/services";

const SIGNING_KEY = process.env.ALCHEMY_WEBHOOK_SIGNING_KEY ?? "";

function validSignature(body: string, signature: string | null) {
  if (!SIGNING_KEY || !signature) return false;
  const digest = createHmac("sha256", SIGNING_KEY).update(body, "utf8").digest("hex");
  const a = Buffer.from(digest, "utf8"), b = Buffer.from(signature, "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(req: Request) {
  const raw = await req.text(); // raw string: the signature covers the exact bytes
  if (!validSignature(raw, req.headers.get("x-alchemy-signature"))) return Response.json({ error: "Invalid signature" }, { status: 401 });
  if (!hasRedis || !hasEmail) return Response.json({ ok: true, skipped: "email not configured" });

  let payload: unknown;
  try { payload = JSON.parse(raw); } catch { return Response.json({ error: "Bad JSON" }, { status: 400 }); }

  const origin = new URL(req.url).origin;
  const results = [];
  for (const id of drawnCampaignIds(payload)) {
    try { results.push(await notifyDrawn(id, origin)); }
    catch (e) { results.push({ id: id.toString(), error: (e as Error).message.split("\n")[0] }); }
  }
  // 5xx makes Alchemy retry; only ask for a retry when something actually failed.
  const failed = results.some((r) => "error" in r || ("failed" in r && (r.failed ?? 0) > 0));
  return Response.json({ ok: !failed, results }, { status: failed ? 500 : 200 });
}
