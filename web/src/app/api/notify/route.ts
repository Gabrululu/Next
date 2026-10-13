// Opt-in "email me the result" for one campaign.
//   GET    /api/notify?campaignId=N  -> { configured, subscribed }
//   POST   /api/notify {campaignId}  -> subscribe
//   DELETE /api/notify {campaignId}  -> unsubscribe
// Auth: the caller's Dynamic access token (Authorization: Bearer). The email comes from the verified token,
// never from the request body, and one of the token's verified addresses must be registered on-chain for
// that campaign, so nobody can subscribe someone else or spam campaigns they didn't join.
import { getAddress, type Address } from "viem";
import { NEXT_ADDRESS } from "@/lib/config";
import { nextAbi } from "@/lib/shared/abi";
import { AuthError, verifyDynamicToken } from "@/lib/server/dynamicAuth";
import { notifyKey } from "@/lib/server/notify";
import { hasEmail, hasRedis, redis, serverClient } from "@/lib/server/services";

const configured = () => hasRedis && hasEmail;
const json = (body: unknown, status = 200) => Response.json(body, { status });

function parseId(v: unknown): bigint | null {
  const s = typeof v === "number" ? String(v) : typeof v === "string" ? v : "";
  return /^\d{1,20}$/.test(s) && s !== "0" ? BigInt(s) : null;
}

/** The caller's verified address that is registered for this campaign, if any. */
async function registeredAddress(addresses: string[], id: bigint): Promise<Address | null> {
  for (const a of addresses) {
    const ok = await serverClient.readContract({ address: NEXT_ADDRESS, abi: nextAbi, functionName: "isRegistered", args: [id, getAddress(a)] });
    if (ok) return getAddress(a);
  }
  return null;
}

async function authed(req: Request, id: bigint) {
  const user = await verifyDynamicToken(req.headers.get("authorization"));
  const address = await registeredAddress(user.addresses, id);
  return { user, address };
}

export async function GET(req: Request) {
  const id = parseId(new URL(req.url).searchParams.get("campaignId"));
  if (!id) return json({ error: "Bad campaignId" }, 400);
  if (!configured()) return json({ configured: false, subscribed: false });
  try {
    const { address } = await authed(req, id);
    const subscribed = address ? (await redis<number>("HEXISTS", notifyKey(id), address.toLowerCase())) === 1 : false;
    return json({ configured: true, subscribed });
  } catch (e) {
    if (e instanceof AuthError) return json({ error: e.message }, 401);
    return json({ error: "Temporarily unavailable" }, 503);
  }
}

export async function POST(req: Request) {
  const id = parseId(((await req.json().catch(() => ({}))) as { campaignId?: unknown }).campaignId);
  if (!id) return json({ error: "Bad campaignId" }, 400);
  if (!configured()) return json({ error: "Email notifications are not configured" }, 501);
  try {
    const { user, address } = await authed(req, id);
    if (!user.email) return json({ error: "This account has no email. Sign in with email to get notified." }, 400);
    if (!address) return json({ error: "Join the campaign first." }, 403);
    const c = await serverClient.readContract({ address: NEXT_ADDRESS, abi: nextAbi, functionName: "getCampaign", args: [id] });
    if (c.drawn) return json({ error: "This campaign is already drawn." }, 409);
    await redis("HSET", notifyKey(id), address.toLowerCase(), user.email);
    return json({ subscribed: true });
  } catch (e) {
    if (e instanceof AuthError) return json({ error: e.message }, 401);
    return json({ error: "Temporarily unavailable" }, 503);
  }
}

export async function DELETE(req: Request) {
  const id = parseId(((await req.json().catch(() => ({}))) as { campaignId?: unknown }).campaignId);
  if (!id) return json({ error: "Bad campaignId" }, 400);
  if (!configured()) return json({ error: "Email notifications are not configured" }, 501);
  try {
    const { address } = await authed(req, id);
    if (address) await redis("HDEL", notifyKey(id), address.toLowerCase());
    return json({ subscribed: false });
  } catch (e) {
    if (e instanceof AuthError) return json({ error: e.message }, 401);
    return json({ error: "Temporarily unavailable" }, 503);
  }
}
