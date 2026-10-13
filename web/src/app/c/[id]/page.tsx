"use client";

import { AnimatePresence, motion } from "framer-motion";
import Link from "next/link";
import { use, useEffect, useState } from "react";
import { useReadContract, useReadContracts } from "wagmi";
import { useAccountState } from "@/lib/wallet";
import { ConnectButton } from "@/components/ConnectButton";
import { NotifyToggle } from "@/components/NotifyToggle";
import { PhaseTrack } from "@/components/PhaseTrack";
import { QueueDots } from "@/components/QueueDots";
import { Reveal } from "@/components/Reveal";
import { Stage } from "@/components/Stage";
import { BLOCK_MS, fmtDuration, useCampaign, type Phase } from "@/lib/campaign";
import { LEGACY_NEXT_ADDRESS, contractQuery, explorerAddress, explorerBlock, explorerTx, hasLegacy, appChain, resolveContract, short } from "@/lib/config";
import { useRecentJoins } from "@/lib/envio";
import { nextAbi } from "@/lib/shared/abi";
import type { Address } from "viem";
import { useTx } from "@/lib/useTx";

const PHASE_LABEL: Record<Phase, string> = {
  upcoming: "Opens soon",
  open: "Open — join now",
  sealing: "Closed — draw coming up",
  drawable: "Ready to draw",
  drawn: "Drawn",
};

export default function CampaignPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ contract?: string }> }) {
  const { id: raw } = use(params);
  const { address: contract, legacy } = resolveContract(use(searchParams).contract);
  const id = /^\d+$/.test(raw) ? BigInt(raw) : 0n;
  const { campaign: c, phase, registrants, block, now, blocksToSeed, error, isLoading, refetch } = useCampaign(id, contract);
  const { address, isConnected, chainId, email } = useAccountState();
  const onChain = isConnected && chainId === appChain.id;

  const me = { query: { enabled: !!address && id > 0n, refetchInterval: 2000 } } as const;
  const registered = useReadContract({ address: contract, abi: nextAbi, functionName: "isRegistered", args: [id, address!], ...me });
  const winner = useReadContract({ address: contract, abi: nextAbi, functionName: "isWinner", args: [id, address!], ...me });
  const claimed = useReadContract({ address: contract, abi: nextAbi, functionName: "hasClaimed", args: [id, address!], ...me });
  const winners = useReadContract({ address: contract, abi: nextAbi, functionName: "getWinners", args: [id], query: { enabled: phase === "drawn" } });
  // Per-winner claim status (for the "pass claimed" badges).
  const claims = useReadContracts({
    contracts: (winners.data ?? []).map((w) => ({ address: contract, abi: nextAbi, functionName: "hasClaimed", args: [id, w] }) as const),
    query: { enabled: phase === "drawn" && !!winners.data?.length, refetchInterval: 4000 },
  });
  const seedHash = useReadContract({ address: contract, abi: nextAbi, functionName: "seedBlockHash", args: [id], query: { enabled: phase === "drawable", refetchInterval: 3000 } });

  const after = () => { refetch(); registered.refetch(); winner.refetch(); claimed.refetch(); winners.refetch(); };
  const reg = useTx(after);
  const draw = useTx(after);
  const resched = useTx(after);
  const claim = useTx(after);
  const [copied, setCopied] = useState(false);

  if (id === 0n) return <Shell><h1 className="font-display text-5xl font-bold">Invalid campaign id.</h1></Shell>;
  if (isLoading) return <Shell><p className="label">Loading campaign #{raw}…</p></Shell>;
  if (error || !c) return (
    <Shell>
      <h1 className="font-display text-5xl font-bold">Campaign #{raw} not found.</h1>
      <p className="text-mute mt-4">It doesn&apos;t exist on {legacy ? "the previous contract version" : "the current contract"}.</p>
      {!legacy && hasLegacy && (
        <Link href={`/c/${raw}?contract=${LEGACY_NEXT_ADDRESS}`} className="glow mt-6 inline-block rounded-2xl border border-line px-5 py-3 font-semibold">
          Look for #{raw} on the previous contract version →
        </Link>
      )}
    </Shell>
  );

  const count = Number(registrants ?? 0n);
  const isOrganizer = !!address && address.toLowerCase() === c.organizer.toLowerCase();
  // Plain-language personal state (spec): Registered · Waiting for the draw · You won · Not this time
  const myState: MyState | undefined = !isConnected || isOrganizer || !registered.data ? undefined
    : phase === "drawn" ? (winner.data ? "You won" : "Not this time")
    : phase === "open" || phase === "upcoming" ? "Registered"
    : "Waiting for the draw";
  const openProgress = (now / 1000 - Number(c.openAt)) / Math.max(1, Number(c.closeAt) - Number(c.openAt));
  const target =
    phase === "upcoming" ? Number(c.openAt) * 1000 - now :
    phase === "open" ? Math.min(Number(c.closeAt) * 1000 - now, blocksToSeed !== undefined ? blocksToSeed * BLOCK_MS : Infinity) :
    phase === "sealing" ? Math.max(0, (blocksToSeed ?? 0) + 1) * BLOCK_MS : 0;
  const seedExpired = phase === "drawable" && seedHash.data === "0x0000000000000000000000000000000000000000000000000000000000000000";
  const winnerList = winners.data ?? [];

  const write = (fn: "register" | "draw" | "recommit" | "claim", t: ReturnType<typeof useTx>) =>
    t.send({ address: contract, abi: nextAbi, functionName: fn, args: [id] });

  return (
    <Shell>
      {legacy && <LegacyNote />}
      <div className="flex flex-wrap items-center gap-3 mb-6">
        <span className="label">Campaign #{id.toString()}</span>
        <StatusPill phase={phase!} />
        {isConnected && <RolePill organizer={isOrganizer} />}
        {myState && <MyStatePill state={myState} />}
      </div>
      <h1 className={`${c.name.length > 26 ? "t-h2" : "t-hero"} font-display font-extrabold break-words word-in`}>{c.name}</h1>
      <p className="mt-5 t-lead text-mute">
        {c.slots} {c.slots === 1 ? "winner" : "winners"} · one entry per account · organized by{" "}
        <a className="underline font-mono" href={explorerAddress(c.organizer)} target="_blank" rel="noreferrer">{short(c.organizer)}</a>
      </p>

      <Reveal className="mt-10"><PhaseTrack phase={phase!} openProgress={openProgress} /></Reveal>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[1.3fr_1fr] items-start">
        {/* Left: the line */}
        <Reveal>
          <Stage title="The line" right={`${count} in line`}>
            <section aria-label="The line" className="p-6 sm:p-8">
              <div className="flex items-end justify-between gap-4">
                <div>
                  <p className="label">In line</p>
                  <p className="font-display text-[clamp(3.5rem,8vw,6rem)] leading-none font-extrabold tabular-nums">{count}</p>
                </div>
                <div className="text-right">
                  <p className="label">{phase === "upcoming" ? "Opens in" : phase === "open" ? "Closes in" : phase === "sealing" ? "Seed block in" : "Seed block"}</p>
                  <p className="font-display text-3xl sm:text-5xl font-bold tabular-nums">
                    {phase === "drawable" || phase === "drawn" ? <a className="underline decoration-volt" href={explorerBlock(c.drawBlock)} target="_blank" rel="noreferrer">#{c.drawBlock.toString()}</a> : fmtDuration(target)}
                  </p>
                </div>
              </div>
              <div className="mt-8">
                <QueueDots
                  count={Math.min(count, 400)}
                  cols={count <= 12 ? 6 : count <= 60 ? 12 : 20}
                  winners={phase === "drawn" ? Math.min(c.slots, count) : 0}
                  shuffleKey={phase === "drawn" ? c.seed : undefined}
                />
                {count === 0 && <p className="label mt-2">Nobody in line yet. Share the link.</p>}
                {count > 400 && <p className="label mt-2">Showing 400 of {count}</p>}
              </div>
              <RecentJoins contract={contract} id={id} me={address} />
            </section>
          </Stage>
        </Reveal>

        {/* Right: your action */}
        <Reveal delay={120} className="lg:sticky lg:top-24">
        <section aria-label="Your status" className="rounded-[2rem] tactile p-6 sm:p-8 flex flex-col gap-5">
          <AnimatePresence mode="wait">
            <motion.div key={phase} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} className="flex flex-col gap-5">
              {phase === "upcoming" && <p className="text-lg">Registration opens {new Date(Number(c.openAt) * 1000).toLocaleString()}.</p>}
              {phase === "upcoming" && isOrganizer && <ShareBox />}

              {phase === "open" && (
                isOrganizer && !registered.data ? (
                  <>
                    <Big title="You're the organizer." body="Organizers don't get in line for their own campaign. Share this link so other people can join." />
                    <ShareBox />
                  </>
                ) :
                !onChain ? (
                  <>
                    <Big title="Get in line." body="Sign in with your email to join. One entry per account, and joining early gives no advantage." />
                    <ConnectButton big />
                  </>
                ) :
                registered.data ? (
                  <Big title="Registered." body="You're in line. When you joined doesn't matter: the draw happens after the window closes, and this page will show your result." />
                ) : (
                  <>
                    <Big title="Get in line." body="One entry per account. Joining early gives no advantage." />
                    <ActionButton t={reg} onClick={() => write("register", reg)} label="Register" />
                  </>
                )
              )}

              {phase === "sealing" && (
                <Big
                  title={registered.data ? "Waiting for the draw." : "Window closed."}
                  body={`Waiting for seed block #${c.drawBlock} (announced when the campaign was created). ${blocksToSeed !== undefined && blocksToSeed >= 0 ? `${blocksToSeed + 1} blocks to go.` : ""}`}
                />
              )}

              {phase === "drawable" && (
                seedExpired ? (
                  <>
                    <Big title="The draw window expired." body="Nobody ran the draw in time, so its random seed can't be read anymore. Anyone can set a new one (still unknown to everyone) and then run the draw." />
                    {legacy ? <p className="text-sm text-mute">This campaign is on the previous contract version, which this app no longer writes to.</p>
                      : onChain ? <ActionButton t={resched} onClick={() => write("recommit", resched)} label="Set a new seed" /> : <ConnectButton big />}
                  </>
                ) : (
                  <>
                    <Big title={registered.data ? "Waiting for the draw." : "The draw is ready."} body="Anyone can press the button below. The result is the same no matter who presses it or when." />
                    {onChain ? <ActionButton t={draw} onClick={() => write("draw", draw)} label="Run the draw" /> : <ConnectButton big />}
                  </>
                )
              )}

              {phase === "drawn" && (
                <>
                  {!isConnected ? (
                    <>
                      <Big title="The draw is done." body="Sign in with the email or wallet you joined with to see your result." />
                      <ConnectButton big />
                    </>
                  ) : winner.data ? (
                    <>
                      <Big title="You won." body={claimed.data ? "Your pass is claimed. It's tied to your account and can't be transferred." : "Claim your pass to secure your spot."} accent />
                      {!claimed.data && onChain && <ActionButton t={claim} onClick={() => write("claim", claim)} label="Claim pass" />}
                    </>
                  ) : registered.data ? (
                    <Big title="Not this time." body={`${Math.min(c.slots, count)} of ${count} people in line won. You can check the draw yourself below.`} />
                  ) : isOrganizer ? (
                    <Big title="Your campaign is drawn." body={`${Math.min(c.slots, count)} of ${count} people in line won. Share the verify link so anyone can check the result.`} />
                  ) : (
                    <Big title="The draw is done." body="This account wasn't in line." />
                  )}
                  <Link href={`/verify/${id}${contractQuery(contract)}`} className="glow rounded-2xl border border-line px-5 py-3 text-center font-semibold">Verify this draw →</Link>
                </>
              )}
            </motion.div>
          </AnimatePresence>

          {!legacy && email && registered.data && phase !== "drawn" && <NotifyToggle campaignId={id} email={email} />}

          <dl className="mt-auto grid grid-cols-2 gap-3 text-sm border-t border-line pt-5">
            <div><dt className="label">Opens</dt><dd>{new Date(Number(c.openAt) * 1000).toLocaleTimeString()}</dd></div>
            <div><dt className="label">Closes</dt><dd>{new Date(Number(c.closeAt) * 1000).toLocaleTimeString()}</dd></div>
            <div><dt className="label">Seed block</dt><dd className="font-mono">#{c.drawBlock.toString()}</dd></div>
            <div><dt className="label">Current block</dt><dd className="font-mono">{block !== undefined ? `#${block}` : "…"}</dd></div>
          </dl>
          <button
            className="label underline text-left"
            onClick={() => { navigator.clipboard?.writeText(window.location.href); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
          >
            {copied ? "Link copied" : "Copy share link"}
          </button>
        </section>
        </Reveal>
      </div>

      {phase === "drawn" && (
        <section aria-label="Winners" className="mt-20">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <Reveal><h2 className="t-h2 font-display font-extrabold">Winners</h2></Reveal>
            <div className="flex flex-wrap gap-x-6 gap-y-1 label">
              <span>Passes claimed {c.claimedCount}/{winnerList.length}</span>
              <span className="font-mono break-all">seed {short(c.seed, 8)}</span>
            </div>
          </div>
          {count <= c.slots && (
            <p className="mt-6 max-w-prose text-mute">
              {count} in line for {c.slots} {c.slots === 1 ? "slot" : "slots"}: everyone in line won, so no shuffle was needed.
              The draw only has something to decide when more people line up than there are slots.
            </p>
          )}
          <ol className="mt-8 grid gap-2 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 font-mono text-sm">
            {winnerList.map((w, i) => {
              const mine = w.toLowerCase() === address?.toLowerCase();
              return (
                <motion.li key={w} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i, 40) * 0.02 }}
                  className={`min-w-0 flex items-center gap-3 rounded-2xl px-3 py-2.5 ${mine ? "bg-volt text-ink" : "tactile"}`}>
                  <span className={`squircle grid place-items-center size-7 shrink-0 text-[10px] ${mine ? "bg-ink text-volt-2" : "bg-volt/20 text-volt-2"}`}>{i + 1}</span>
                  <span className="truncate">{short(w, 6)}</span>
                  <span className="ml-auto flex items-center gap-2 shrink-0">
                    {mine && <span className="label text-ink">you</span>}
                    {claims.data?.[i]?.result === true && (
                      <span className={`label rounded-full px-2 py-0.5 ${mine ? "bg-ink/20 text-ink" : "bg-ok/15 text-ok"}`}>pass claimed</span>
                    )}
                  </span>
                </motion.li>
              );
            })}
          </ol>
        </section>
      )}
    </Shell>
  );
}

/** Latest arrivals, from the Envio indexer. Hidden when the indexer doesn't cover this contract or is down. */
function RecentJoins({ contract, id, me }: { contract: Address; id: bigint; me?: Address }) {
  const joins = useRecentJoins(contract, id);
  if (!joins?.length) return null;
  return (
    <div className="mt-8 border-t border-line pt-5">
      <p className="label">Latest in line · via Envio</p>
      <ul className="mt-3 space-y-1.5 font-mono text-sm">
        {joins.map((j) => (
          <li key={j.index} className="flex items-center justify-between gap-3">
            <span className={me && j.account === me.toLowerCase() ? "text-volt-2" : "text-paper"}>
              #{j.index + 1} {short(j.account)}{me && j.account === me.toLowerCase() ? " (you)" : ""}
            </span>
            <span className="text-mute">block {j.blockNumber}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function LegacyNote() {
  return (
    <p className="mb-6 rounded-2xl border border-line px-4 py-3 text-sm text-mute">
      <span className="label text-paper mr-2">Previous contract version</span>
      This campaign lives on the first deployment, before organizers were blocked from joining their own campaigns on-chain.
      It is still live and verifiable.
    </p>
  );
}

type MyState = "Registered" | "Waiting for the draw" | "You won" | "Not this time";

function MyStatePill({ state }: { state: MyState }) {
  const tone = state === "You won" ? "bg-ok text-ink" : state === "Not this time" ? "bg-ink-3 text-mute" : "border border-volt text-volt-2";
  return <span role="status" className={`inline-flex items-center rounded-full px-3 py-1 text-sm font-semibold ${tone}`}>{state}</span>;
}

function RolePill({ organizer }: { organizer: boolean }) {
  return organizer ? (
    <span className="inline-flex items-center gap-2 rounded-full bg-volt text-ink px-3 py-1 text-sm font-semibold">You&apos;re the organizer</span>
  ) : (
    <span className="inline-flex items-center gap-2 rounded-full bg-ink-3 px-3 py-1 text-sm">You&apos;re a participant</span>
  );
}

/** Prominent, copyable campaign link for organizers. */
function ShareBox() {
  const [url, setUrl] = useState("");
  const [copied, setCopied] = useState(false);
  useEffect(() => setUrl(window.location.href), []);
  return (
    <div className="rounded-2xl tactile-pressed p-3 flex items-center gap-2">
      <input readOnly value={url} aria-label="Campaign link" onFocus={(e) => e.currentTarget.select()}
        className="min-w-0 flex-1 bg-transparent px-2 font-mono text-xs text-mute outline-none" />
      <button
        onClick={() => { navigator.clipboard?.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
        className="glow btn-volt shrink-0 rounded-xl px-4 py-2 text-sm font-semibold"
      >
        {copied ? "Copied" : "Copy link"}
      </button>
    </div>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto max-w-6xl px-4 sm:px-6 pt-16 sm:pt-24 pb-10">{children}</div>;
}

function StatusPill({ phase }: { phase: Phase }) {
  const live = phase === "open" || phase === "drawable";
  return (
    <span className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-sm border ${live ? "border-volt text-volt-2" : "border-line text-mute"}`}>
      <span className={`size-2 rounded-full ${live ? "bg-volt animate-pulse" : "bg-mute"}`} aria-hidden />
      {PHASE_LABEL[phase]}
    </span>
  );
}

function Big({ title, body, accent }: { title: string; body: string; accent?: boolean }) {
  return (
    <div>
      <p className={`t-h3 font-display font-extrabold ${accent ? "text-volt-2" : ""}`}>{title}</p>
      <p className="mt-2 text-mute leading-relaxed">{body}</p>
    </div>
  );
}

function ActionButton({ t, onClick, label }: { t: ReturnType<typeof useTx>; onClick: () => void; label: string }) {
  return (
    <div className="space-y-2">
      <button onClick={onClick} disabled={t.busy} className="w-full glow btn-volt rounded-2xl px-6 py-4 font-semibold text-lg active:scale-[0.98] transition-transform">
        {t.stage ?? label}
      </button>
      {t.error && <p role="alert" className="text-sm text-bad">{t.error}</p>}
      {t.hash && <a className="label underline block" href={explorerTx(t.hash)} target="_blank" rel="noreferrer">Transaction {short(t.hash, 6)}</a>}
    </div>
  );
}
