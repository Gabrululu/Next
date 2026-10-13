// Draw-result emails. Subscribers live in one Redis hash per campaign: address -> email.
import { toEventSelector, type Hex } from "viem";
import { NEXT_ADDRESS } from "../config";
import { nextAbi } from "../shared/abi";
import { redis, sendEmail, serverClient } from "./services";

const PREFIX = `next:${NEXT_ADDRESS.toLowerCase()}`;
export const notifyKey = (id: bigint) => `${PREFIX}:notify:${id}`;
const doneKey = (id: bigint) => `${PREFIX}:notified:${id}`;

export const DRAWN_TOPIC = toEventSelector(nextAbi.find((x) => x.type === "event" && x.name === "Drawn")!);

/**
 * Emails every subscriber of a drawn campaign their own result. Safe to call repeatedly (webhook retries):
 * the result is read from the contract (not from the webhook payload), each email carries an idempotency key,
 * and a "notified" marker skips campaigns that were fully processed.
 */
export async function notifyDrawn(id: bigint, origin: string) {
  if ((await redis<number>("EXISTS", doneKey(id))) === 1) return { id: id.toString(), skipped: "already notified" };

  const c = await serverClient.readContract({ address: NEXT_ADDRESS, abi: nextAbi, functionName: "getCampaign", args: [id] });
  if (!c.drawn) return { id: id.toString(), skipped: "not drawn on-chain" };
  const winners = new Set((await serverClient.readContract({ address: NEXT_ADDRESS, abi: nextAbi, functionName: "getWinners", args: [id] })).map((w) => w.toLowerCase()));

  const flat = (await redis<string[]>("HGETALL", notifyKey(id))) ?? [];
  let sent = 0, failed = 0;
  for (let i = 0; i < flat.length; i += 2) {
    const address = flat[i]!, email = flat[i + 1]!;
    const won = winners.has(address);
    const page = `${origin}/c/${id}`;
    const verify = `${origin}/verify/${id}`;
    const name = c.name.replace(/[<>&"]/g, "");
    try {
      await sendEmail({
        to: email,
        idempotencyKey: `next-drawn-${NEXT_ADDRESS}-${id}-${address}`,
        subject: won ? `You won: ${name}` : `Draw result: ${name}`,
        text: won
          ? `You won a spot in "${name}". Claim your pass: ${page}\nAnyone can check the draw: ${verify}`
          : `The draw for "${name}" is done. You weren't picked this time.\nAnyone can check the draw: ${verify}`,
        html: won
          ? `<p>You won a spot in <b>${name}</b>.</p><p><a href="${page}">Claim your pass</a></p><p>Anyone can check the draw: <a href="${verify}">${verify}</a></p>`
          : `<p>The draw for <b>${name}</b> is done. You weren't picked this time.</p><p>Anyone can check the draw: <a href="${verify}">${verify}</a></p>`,
      });
      sent++;
    } catch {
      failed++;
    }
  }
  // Mark done only when every email went out, so a webhook retry can finish the rest (idempotency keys
  // stop duplicates). Subscriber emails are deleted once used: nothing is kept longer than needed.
  if (failed === 0) {
    await redis("SET", doneKey(id), "1", "EX", 60 * 60 * 24 * 30);
    await redis("DEL", notifyKey(id));
  }
  return { id: id.toString(), subscribers: flat.length / 2, sent, failed };
}

/** Finds Drawn(campaignId) logs emitted by the Next contract anywhere in a webhook payload. */
export function drawnCampaignIds(payload: unknown): bigint[] {
  const ids = new Set<bigint>();
  const next = NEXT_ADDRESS.toLowerCase();
  const walk = (v: unknown, depth: number) => {
    if (depth > 12 || v === null || typeof v !== "object") return;
    if (Array.isArray(v)) { for (const x of v) walk(x, depth + 1); return; }
    const o = v as Record<string, unknown>;
    const topics = o.topics;
    if (Array.isArray(topics) && typeof topics[0] === "string" && topics[0].toLowerCase() === DRAWN_TOPIC && typeof topics[1] === "string") {
      const acct = (o.account as { address?: string } | undefined)?.address ?? (o.address as string | undefined);
      if (!acct || acct.toLowerCase() === next) ids.add(BigInt(topics[1] as Hex));
    }
    for (const x of Object.values(o)) walk(x, depth + 1);
  };
  walk(payload, 0);
  return [...ids];
}

