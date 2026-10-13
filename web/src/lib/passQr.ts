// Signed check-in QR for a claimed pass.
// The holder signs {campaign, address, timestamp, nonce} (plus chain + contract, so a QR can't be reused on
// another deployment) with their wallet; the QR carries the fields and the signature. A scanner checks:
// signature -> freshness (PASS_QR_TTL_S) -> not seen before ON THIS SCANNER -> the address holds the pass on-chain.
// Honest limit: the replay set is local to each scanner device, so within the validity window the same QR
// could be shown at a second scanner. Nothing here proves who is holding the phone.
import { getAddress, isAddress, isHex, recoverMessageAddress, type Address, type Hex, type PublicClient } from "viem";
import { CHAIN_ID, NEXT_ADDRESS } from "./config";
import { nextAbi } from "./shared/abi";

export const PASS_QR_TTL_S = 300; // ~5 minutes
const CLOCK_SKEW_S = 60;

export type PassClaim = { campaign: string; address: Address; timestamp: number; nonce: Hex };

/** Exactly what the wallet signs (EIP-191 personal message). Human-readable on purpose. */
export function passMessage(p: PassClaim): string {
  return [
    "Next pass check-in",
    `Campaign: ${p.campaign}`,
    `Address: ${p.address}`,
    `Contract: ${NEXT_ADDRESS}`,
    `Chain: ${CHAIN_ID}`,
    `Timestamp: ${p.timestamp}`,
    `Nonce: ${p.nonce}`,
  ].join("\n");
}

export function newPassClaim(campaign: bigint, address: Address): PassClaim {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  const nonce = `0x${[...bytes].map((b) => b.toString(16).padStart(2, "0")).join("")}` as Hex;
  return { campaign: campaign.toString(), address: getAddress(address), timestamp: Math.floor(Date.now() / 1000), nonce };
}

/** Compact QR text. Chain and contract are not in the QR: the scanner uses its own, so a foreign QR fails the signature. */
export function encodePassQr(p: PassClaim, signature: Hex): string {
  return JSON.stringify({ v: 1, c: p.campaign, a: p.address, t: p.timestamp, n: p.nonce, s: signature });
}

export type ScanResult =
  | { ok: true; claim: PassClaim; ageS: number }
  | { ok: false; reason: string; claim?: PassClaim };

const USED_KEY = "next:scan:used";
function usedSet(): Record<string, number> {
  try { return JSON.parse(localStorage.getItem(USED_KEY) ?? "{}") as Record<string, number>; } catch { return {}; }
}
function markUsed(id: string) {
  try {
    const now = Math.floor(Date.now() / 1000);
    // keep only entries still inside a validity window (they can't be replayed after that anyway)
    const kept = Object.fromEntries(Object.entries(usedSet()).filter(([, t]) => now - t < PASS_QR_TTL_S + CLOCK_SKEW_S));
    localStorage.setItem(USED_KEY, JSON.stringify({ ...kept, [id]: now }));
  } catch { /* storage unavailable: replay protection degrades to this page session */ }
}

const sessionUsed = new Set<string>();

export async function verifyPassQr(text: string, campaignId: bigint, client: PublicClient): Promise<ScanResult> {
  let raw: { v?: number; c?: string; a?: string; t?: number; n?: string; s?: string };
  try { raw = JSON.parse(text); } catch { return { ok: false, reason: "Not a Next pass QR." }; }
  if (raw.v !== 1 || typeof raw.c !== "string" || !isAddress(raw.a ?? "") || typeof raw.t !== "number" || !isHex(raw.n) || !isHex(raw.s)) {
    return { ok: false, reason: "Not a Next pass QR." };
  }
  const claim: PassClaim = { campaign: raw.c, address: getAddress(raw.a!), timestamp: raw.t, nonce: raw.n };
  if (claim.campaign !== campaignId.toString()) return { ok: false, reason: `This pass is for campaign #${claim.campaign}, not #${campaignId}.`, claim };

  const now = Math.floor(Date.now() / 1000);
  const age = now - claim.timestamp;
  if (age < -CLOCK_SKEW_S) return { ok: false, reason: "QR timestamp is in the future. Check the phone's clock.", claim };
  if (age > PASS_QR_TTL_S) return { ok: false, reason: "QR expired. Ask them to refresh it.", claim };

  const replayId = `${claim.address}:${claim.nonce}`;
  if (sessionUsed.has(replayId) || usedSet()[replayId]) return { ok: false, reason: "This QR was already scanned here.", claim };

  // Signature: plain ecrecover first (EOAs, including Dynamic embedded wallets), then ERC-1271/6492 through the
  // RPC for smart accounts.
  const message = passMessage(claim);
  let valid = false;
  try { valid = (await recoverMessageAddress({ message, signature: raw.s })).toLowerCase() === claim.address.toLowerCase(); } catch { /* fall through */ }
  if (!valid) {
    try { valid = await client.verifyMessage({ address: claim.address, message, signature: raw.s }); } catch { valid = false; }
  }
  if (!valid) return { ok: false, reason: "Signature doesn't match. This QR wasn't made by that account.", claim };

  const holds = await client.readContract({ address: NEXT_ADDRESS, abi: nextAbi, functionName: "hasClaimed", args: [campaignId, claim.address] });
  if (!holds) return { ok: false, reason: "This account has no pass for this campaign.", claim };

  sessionUsed.add(replayId);
  markUsed(replayId);
  return { ok: true, claim, ageS: Math.max(0, age) };
}
