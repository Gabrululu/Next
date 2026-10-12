import Link from "next/link";
import { Logo } from "./Logo";
import { CHAIN_ID, CHAIN_NAME, EXPLORER_URL, FAUCET_URL, IS_TESTNET, NEXT_ADDRESS, chainConfigMissing, explorerAddress, isConfigured, short } from "@/lib/config";

const COLS: { title: string; links: { href: string; label: string; ext?: boolean }[] }[] = [
  { title: "Explore", links: [
    { href: "/create", label: "Open a window" },
    { href: "/#how", label: "How it works" },
    { href: "/stress", label: "Stress test" },
  ] },
  { title: "Proof", links: [
    ...(isConfigured ? [{ href: explorerAddress(NEXT_ADDRESS), label: `Contract ${short(NEXT_ADDRESS)}`, ext: true }] : []),
    { href: EXPLORER_URL, label: "Block explorer", ext: true },
  ] },
  { title: "Network", links: [
    { href: "https://docs.monad.xyz/ai/current-facts.md", label: "Monad network facts", ext: true },
    ...(FAUCET_URL ? [{ href: FAUCET_URL, label: "Faucet", ext: true }] : []),
  ] },
];

export function Footer() {
  return (
    <footer className="relative bg-ink-2 pt-28 md:pt-40 pb-8 overflow-hidden">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr_1fr]">
          <div className="space-y-3 max-w-sm">
            <p className="label">Prototype</p>
            <p className="text-sm text-mute leading-relaxed">
              Runs on {CHAIN_NAME}.{IS_TESTNET ? " Test MON has no value." : ""} Nothing here is audited.
              One entry per address reduces multi-account abuse but does not stop it. It is not proof of unique personhood.
            </p>
          </div>
          {COLS.map((c) => (
            <nav key={c.title} aria-label={c.title} className="space-y-3">
              <p className="label">{c.title}</p>
              <ul className="space-y-1.5">
                {c.links.map((l) => (
                  <li key={l.label}>
                    {l.ext
                      ? <a href={l.href} target="_blank" rel="noreferrer" className="nudge block text-mute">{l.label}</a>
                      : <Link href={l.href} className="nudge block text-mute">{l.label}</Link>}
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>
      </div>

      {/* oversized wordmark, cropped by the viewport edge */}
      <Link href="/" aria-label="Next home" className="block mt-16 md:mt-24 select-none">
        <span aria-hidden className="block text-center text-[24vw] leading-[0.9] text-paper/90 [text-shadow:0_0.04em_0_var(--color-volt)]">
          <Logo />
        </span>
      </Link>

      <div className="mx-auto max-w-6xl px-4 sm:px-6 mt-6 flex flex-col sm:flex-row justify-between gap-2 label">
        <span>{chainConfigMissing.length ? `Missing env: ${chainConfigMissing.join(", ")}` : `${CHAIN_NAME} · chain ${CHAIN_ID}`}</span>
        <span>Everyone in line. Nobody cuts in.</span>
      </div>
    </footer>
  );
}
