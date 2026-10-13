"use client";

import Link from "next/link";
import { fmtInt } from "@/lib/campaign";
import { CHAIN_NAME } from "@/lib/config";
import { useLiveStats } from "@/lib/envio";

/**
 * Live numbers from the Envio indexer (polled every 2 s). Shows only indexed on-chain data:
 * when the indexer is not configured or unreachable it says so instead of showing anything else.
 */
export function LivePanel() {
  const { data, status } = useLiveStats();
  if (status === "off") return null;

  const g = data?.global;
  const c = data?.latest;
  const blocks = c?.blocks ?? [];
  const max = Math.max(1, ...blocks.map((b) => b.registrations));
  const span = c?.stats?.firstBlock && c.stats.lastBlock ? Number(c.stats.lastBlock) - Number(c.stats.firstBlock) + 1 : 0;

  return (
    <div className="rounded-[2rem] bg-[#0f0d13] border border-line overflow-hidden">
      <div className="flex items-center gap-3 px-5 py-3 border-b border-line">
        <span className={`size-2.5 rounded-full ${status === "live" ? "bg-ok animate-pulse" : status === "error" ? "bg-bad" : "bg-ink-3"}`} aria-hidden />
        <span className="label">Live · indexed by Envio · {CHAIN_NAME}</span>
        <span className="label ml-auto">{status === "live" ? "updates every 2 s" : status === "error" ? "indexer unreachable" : "connecting…"}</span>
      </div>

      {status === "error" && !data ? (
        <p className="p-8 text-mute">The indexer can&apos;t be reached right now. Campaign pages and the verifier keep working by reading the contract directly.</p>
      ) : (
        <div className="p-6 sm:p-8 space-y-8">
          <dl className="grid grid-cols-2 sm:grid-cols-5 gap-4">
            {([
              ["Campaigns", g?.campaigns],
              ["Registrations", g?.registrations],
              ["Draws", g?.draws],
              ["Winners", g?.winners],
              ["Passes claimed", g?.passes],
            ] as const).map(([k, v]) => (
              <div key={k} className="rounded-2xl tactile-pressed p-4">
                <dt className="label">{k}</dt>
                <dd className="mt-2 font-display text-3xl font-bold tabular-nums">{v === undefined ? "—" : fmtInt(v)}</dd>
              </div>
            ))}
          </dl>

          {c ? (
            <div>
              <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
                <p className="font-display text-xl font-bold">
                  Latest campaign: <Link href={`/c/${c.id}`} className="underline decoration-volt underline-offset-4 hover:text-volt-2">#{c.id} {c.name}</Link>
                </p>
                <p className="text-sm text-mute">
                  {fmtInt(c.registrantCount)} in line · {fmtInt(c.slots)} slots · {c.drawn ? "drawn" : "not drawn yet"}
                  {c.stats && c.stats.registrations > 0 && <> · {fmtInt(c.stats.blocksWithRegistrations)} blocks with joins out of {fmtInt(span)} · peak {fmtInt(c.stats.maxPerBlock)} in one block</>}
                </p>
              </div>
              {blocks.length > 0 ? (
                <figure className="mt-5">
                  <div className="flex items-end gap-[3px] h-32" role="img" aria-label={`Registrations per block for the last ${blocks.length} blocks with joins`}>
                    {blocks.map((b) => (
                      <div key={b.blockNumber} title={`block ${b.blockNumber}: ${b.registrations}`}
                        className="flex-1 min-w-[3px] rounded-t bg-volt/80" style={{ height: `${(b.registrations / max) * 100}%` }} />
                    ))}
                  </div>
                  <figcaption className="label mt-2">Registrations per block (latest {blocks.length} blocks with joins)</figcaption>
                </figure>
              ) : (
                <p className="mt-4 text-mute text-sm">No one has joined this campaign yet.</p>
              )}
            </div>
          ) : (
            <p className="text-mute">No campaigns indexed yet.</p>
          )}
        </div>
      )}
    </div>
  );
}
