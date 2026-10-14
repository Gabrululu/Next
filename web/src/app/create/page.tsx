"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { parseEventLogs } from "viem";
import { useAccountState } from "@/lib/wallet";
import { ConnectButton } from "@/components/ConnectButton";
import { Dial } from "@/components/Dial";
import { Reveal } from "@/components/Reveal";
import { Stage } from "@/components/Stage";
import { VSlider } from "@/components/VSlider";
import { NEXT_ADDRESS, explorerTx, isConfigured, appChain, short } from "@/lib/config";
import { BLOCK_MS, fmtInt } from "@/lib/campaign";
import { nextAbi } from "@/lib/shared/abi";
import { useTx } from "@/lib/useTx";
import { useT } from "@/lib/i18n";

const STOPS = [
  { value: 60, label: "1m", words: "1 minute" }, { value: 120, label: "2m", words: "2 minutes" },
  { value: 300, label: "5m", words: "5 minutes" }, { value: 600, label: "10m", words: "10 minutes" },
  { value: 1800, label: "30m", words: "30 minutes" }, { value: 3600, label: "1h", words: "1 hour" },
  { value: 6 * 3600, label: "6h", words: "6 hours" }, { value: 86400, label: "1d", words: "1 day" },
  { value: 3 * 86400, label: "3d", words: "3 days" }, { value: 7 * 86400, label: "7d", words: "7 days" },
];
const MAX_SLOTS = 200; // mirrors Next.MAX_SLOTS
const DRAW_DELAY_BLOCKS = 10; // mirrors Next.DRAW_DELAY_BLOCKS
const IDEAS = ["Workshop seats", "Scholarship", "Concert tickets", "Hackathon spots"];

const AFTER = [
  { t: "Share the link", d: "You get a campaign page. Send its link to the people you want to invite." },
  { t: "People get in line", d: "Everyone signs in with their email or wallet and joins once. Joining early gives no advantage, so nobody needs to rush." },
  { t: "Anyone runs the draw", d: "A few seconds after it closes, anyone (you included) can press “Run the draw”. Winners claim a pass." },
];

export default function CreatePage() {
  const router = useRouter();
  const t = useT();
  const reduce = useReducedMotion();
  const { address, isConnected, chainId } = useAccountState();
  const [name, setName] = useState("");
  const [stop, setStop] = useState(2);
  const [slots, setSlots] = useState(25);
  const tx = useTx((r) => {
    const [ev] = parseEventLogs({ abi: nextAbi, logs: r.logs, eventName: "CampaignCreated" });
    if (ev) router.push(`/c/${ev.args.campaignId}`);
  });

  const windowSec = STOPS[stop].value;
  const windowText = t(STOPS[stop].words);
  const trimmed = name.trim();
  const bytes = new TextEncoder().encode(trimmed).length;
  const valid = trimmed.length > 0 && bytes <= 64;
  const onChain = isConnected && chainId === appChain.id;
  // Once a tx hash exists the campaign may already be on-chain: never allow a silent resubmit.
  const sent = !!tx.hash;
  const ready = isConfigured && onChain && valid && !tx.busy && !sent;
  // Same estimate the contract makes: blocks until close (rounded up) + fixed delay.
  const seedOffsetBlocks = Math.ceil((windowSec * 1000) / BLOCK_MS) + DRAW_DELAY_BLOCKS;

  const submit = () => {
    const now = BigInt(Math.floor(Date.now() / 1000));
    tx.send({ address: NEXT_ADDRESS, abi: nextAbi, functionName: "createCampaign", args: [trimmed, slots, now, now + BigInt(windowSec)] });
  };

  return (
    <div className="mx-auto max-w-6xl px-4 sm:px-6 pt-16 sm:pt-24 pb-10">
      <Reveal><p className="label">{t("New campaign · for organizers")}</p></Reveal>
      <h1 className="t-hero font-display font-extrabold mt-5">
        <span className="word-in inline-block">{t("Run a fair draw.")}</span>{" "}
        <span className="word-in inline-block text-mute" style={{ animationDelay: "120ms" }}>{t("In three steps.")}</span>
      </h1>

      {/* who does what */}
      <Reveal delay={120} className="mt-10">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2" aria-label={t("Roles")}>
          <RoleCard tag={t("You")} role={t("Organizer")} accent
            text={t("You name the campaign, choose how long it stays open and how many people win, then share the link. You don't get in line yourself.")} />
          <RoleCard tag={t("Everyone else")} role={t("Participants")}
            text={t("Anyone who opens your link and signs in with their email or wallet. One entry per account, and when they join doesn't matter.")} />
        </div>
      </Reveal>

      <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-[1.35fr_1fr] items-start">
        {/* the three steps */}
        <Reveal>
          <section aria-label={t("Campaign settings")} className="rounded-[2rem] tactile p-5 sm:p-8 space-y-4">
            <Step n={1} title={t("What are people lining up for?")} hint={t("This is the title people see when they open your link.")} stepLabel={t("Step")}>
              <div className="flex items-baseline justify-end mb-2">
                <span className={`label tabular-nums ${bytes > 64 ? "text-bad" : ""}`} aria-live="polite">{bytes}/64</span>
              </div>
              <input
                id="name"
                aria-label={t("Campaign name")}
                value={name}
                maxLength={64}
                onChange={(e) => setName(e.target.value)}
                placeholder={t("e.g. Saturday workshop")}
                autoComplete="off"
                className="w-full rounded-2xl tactile-pressed px-5 py-4 t-h3 font-display font-bold placeholder:text-mute/40 outline-none focus:ring-2 focus:ring-volt"
              />
              <div className="mt-3 flex flex-wrap gap-2" aria-label={t("Ideas")}>
                {IDEAS.map((idea) => (
                  <button key={idea} type="button" onClick={() => setName(t(idea))}
                    className="rounded-full border border-line px-3 py-1 text-xs text-mute hover:text-paper hover:border-volt transition-colors">
                    {t(idea)}
                  </button>
                ))}
              </div>
            </Step>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Step n={2} title={t("How long can people join?")} hint={<>{t("People can join for the next")} <b className="text-paper">{windowText}</b>.</>} stepLabel={t("Step")}>
                <div className="grid place-items-center pt-2"><Dial stops={STOPS} index={stop} onChange={setStop} label={t("Window length")} /></div>
              </Step>
              <Step n={3} title={t("How many people win?")} hint={<>{t("Up to")} <b className="text-paper">{slots}</b> {slots === 1 ? t("person wins") : t("people win")}. {t("If fewer join, everyone wins.")}</>} stepLabel={t("Step")}>
                <div className="grid place-items-center pt-2"><VSlider min={1} max={MAX_SLOTS} value={slots} onChange={setSlots} label={t("Winners")} ticks={[1, 50, 100, 150, 200]} /></div>
              </Step>
            </div>

            {/* plain-language schedule */}
            <div className="rounded-[1.5rem] tactile-pressed p-5" aria-label={t("Schedule")}>
              <p className="label mb-3">{t("What happens, and when")}</p>
              <ol className="grid grid-cols-1 gap-2 sm:grid-cols-3 text-sm">
                <li className="rounded-xl bg-volt/15 border border-volt/30 px-3 py-2"><span className="label block">{t("Now")}</span>{t("The line opens")}</li>
                <li className="rounded-xl bg-ink-3 px-3 py-2"><span className="label block">{t("In {time}", { time: windowText })}</span>{t("The line closes")}</li>
                <li className="rounded-xl bg-volt text-ink px-3 py-2"><span className="label block text-ink/70">{t("A few seconds later")}</span>{t("The draw can run")}</li>
              </ol>
              <details className="mt-4 group">
                <summary className="cursor-pointer list-none label hover:text-paper">
                  <span className="group-open:hidden">+ {t("Why can't anyone cheat?")}</span>
                  <span className="hidden group-open:inline">− {t("Why can't anyone cheat?")}</span>
                </summary>
                <p className="mt-3 text-sm text-mute leading-relaxed max-w-prose">
                  {t("When you create the campaign, the moment of the draw is fixed: a block about {n} blocks from now (~{ms} ms each). Its fingerprint, which nobody knows in advance, you included, decides the winners. People can only join before that block exists, and anyone can check the result afterwards.", { n: fmtInt(seedOffsetBlocks), ms: BLOCK_MS })}
                </p>
              </details>
            </div>
          </section>
        </Reveal>

        {/* preview + create */}
        <Reveal delay={120} className="lg:sticky lg:top-24">
          <Stage title={t("Your campaign")} right={<span className="text-mute">{t("preview")}</span>}>
            <div className="p-6 sm:p-8">
              <AnimatePresence mode="popLayout" initial={false}>
                <motion.p
                  key={trimmed || "_"}
                  initial={reduce ? false : { opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.25 }}
                  className="t-h3 font-display font-extrabold break-words min-h-[1.1em]"
                >
                  {trimmed || <span className="text-mute/40">{t("Untitled campaign")}</span>}
                </motion.p>
              </AnimatePresence>

              {/* one square per winner */}
              <div className="mt-6 flex flex-wrap gap-1" aria-hidden>
                {Array.from({ length: slots }, (_, i) => (
                  <motion.span key={i} layout={!reduce} initial={reduce ? false : { scale: 0 }} animate={{ scale: 1 }}
                    className="size-2.5 rounded-[3px] bg-volt shadow-[0_0_6px_rgba(157,107,255,0.6)]" />
                ))}
              </div>

              <dl className="mt-6 grid grid-cols-2 gap-x-4 gap-y-3 text-sm border-t border-line pt-5">
                <div><dt className="label">{t("Open for")}</dt><dd className="mt-1">{windowText}</dd></div>
                <div><dt className="label">{t("Winners")}</dt><dd className="mt-1 tabular-nums">{slots}</dd></div>
                <div><dt className="label">{t("Entries")}</dt><dd className="mt-1">{t("1 per account")}</dd></div>
                <div><dt className="label">{t("Organizer")}</dt><dd className="mt-1 font-mono">{address ? `${short(address)} (${t("you")})` : t("you")}</dd></div>
              </dl>

              <div className="mt-7 space-y-3">
                {!onChain ? (
                  <>
                    <ConnectButton big />
                    <p className="text-xs text-mute">{t("Sign in with the email or wallet you'll organize from. With email, network fees are covered by the app.")}</p>
                  </>
                ) : (
                  <button onClick={submit} disabled={!ready} className="w-full glow btn-volt rounded-2xl px-6 py-4 font-semibold text-lg active:scale-[0.98] transition-transform">
                    {tx.stage ? t(tx.stage) : tx.done ? t("Opening your campaign…") : sent ? t("Already sent") : valid ? t("Create campaign") : t("Name it first (step 1)")}
                  </button>
                )}
                {onChain && !sent && <p className="text-xs text-mute">{t("Next you get the campaign page with a link to share.")}</p>}
                {!isConfigured && <p className="text-sm text-bad">{t("Contract address not configured")} (NEXT_PUBLIC_NEXT_ADDRESS).</p>}
                {tx.error && !sent && <p role="alert" className="text-sm text-bad">{t(tx.error)}</p>}
                {tx.error && sent && (
                  <p role="alert" className="text-sm text-mute">
                    {t("The transaction was sent, but its confirmation hasn't shown up yet. Check it on the explorer before creating another one.")}{" "}
                    <button className="underline text-paper" onClick={() => tx.reset()}>{t("Start over")}</button>
                  </p>
                )}
                {tx.hash && <a className="label underline block" href={explorerTx(tx.hash)} target="_blank" rel="noreferrer">{t("View transaction")}</a>}
              </div>
            </div>
          </Stage>
        </Reveal>
      </div>

      {/* after creation */}
      <section aria-labelledby="after-h" className="mt-24">
        <Reveal><h2 id="after-h" className="t-h3 font-display font-bold">{t("After you create it")}</h2></Reveal>
        <ol className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-3">
          {AFTER.map((s, i) => (
            <Reveal key={s.t} as="li" delay={i * 90} className="rounded-[1.75rem] border border-line p-6">
              <span className="squircle grid place-items-center size-9 bg-volt/20 text-volt-2 font-mono text-xs">0{i + 1}</span>
              <p className="mt-6 font-display text-2xl font-bold leading-tight">{t(s.t)}</p>
              <p className="mt-3 text-sm text-mute leading-relaxed">{t(s.d)}</p>
            </Reveal>
          ))}
        </ol>
      </section>
    </div>
  );
}

function RoleCard({ tag, role, text, accent }: { tag: string; role: string; text: string; accent?: boolean }) {
  return (
    <div className={`rounded-[1.5rem] p-5 border ${accent ? "border-volt/50 bg-volt/10" : "border-line"}`}>
      <div className="flex items-center gap-2">
        <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${accent ? "bg-volt text-ink" : "bg-ink-3 text-paper"}`}>{tag}</span>
        <span className="label">{role}</span>
      </div>
      <p className="mt-3 text-sm text-mute leading-relaxed">{text}</p>
    </div>
  );
}

function Step({ n, title, hint, stepLabel, children }: { n: number; title: string; hint: ReactNode; stepLabel: string; children: ReactNode }) {
  return (
    <fieldset className="rounded-[1.5rem] tactile-pressed p-5">
      <legend className="sr-only">{`${stepLabel} ${n}: ${title}`}</legend>
      <div className="flex items-start gap-3" aria-hidden>
        <span className="squircle grid place-items-center size-8 shrink-0 bg-volt text-ink font-mono text-xs font-bold">{n}</span>
        <p className="font-display text-xl font-bold leading-tight pt-1">{title}</p>
      </div>
      <p className="mt-2 pl-11 text-sm text-mute">{hint}</p>
      <div className="mt-4">{children}</div>
    </fieldset>
  );
}
