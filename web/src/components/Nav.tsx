"use client";

import { AnimatePresence, motion } from "framer-motion";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { ConnectButton } from "./ConnectButton";
import { Logo } from "./Logo";
import { CHAIN_NAME } from "@/lib/config";

const links = [
  { href: "/create", label: "Create", hint: "Open a window" },
  { href: "/stress", label: "Stress test", hint: "Recorded testnet run" },
  { href: "/#how", label: "How it works", hint: "Four steps" },
];

export function Nav() {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  useEffect(() => setOpen(false), [path]);

  return (
    <header className="sticky top-0 z-40 px-3 sm:px-6 pt-3 pointer-events-none">
      <div className="mx-auto max-w-6xl flex items-start justify-between gap-3">
        {/* left pill: brand + nav */}
        <div className="relative pointer-events-auto max-md:flex-1">
          <nav aria-label="Main" className="flex items-center gap-6 rounded-2xl tactile backdrop-blur pl-5 pr-2 md:pr-5 py-3">
            <Link href="/" aria-label="Next home" className="mr-auto md:mr-0 text-[1.65rem] hover:text-volt-2 transition-colors">
              <Logo />
            </Link>
            <ul className="hidden md:flex items-center gap-5 text-sm">
              {links.map((l) => (
                <li key={l.href}>
                  <Link href={l.href} aria-current={path === l.href ? "page" : undefined}
                    className="text-mute hover:text-paper aria-[current=page]:text-paper transition-colors">
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
            <button
              className="md:hidden grid place-items-center size-9 rounded-lg hover:bg-ink-3"
              aria-label={open ? "Close menu" : "Open menu"}
              aria-expanded={open}
              aria-controls="mobile-menu"
              onClick={() => setOpen((o) => !o)}
            >
              <span className="flex flex-col gap-1" aria-hidden>
                <motion.span className="block h-0.5 w-4 rounded bg-paper" animate={{ rotate: open ? 45 : 0, y: open ? 3 : 0 }} />
                <motion.span className="block h-0.5 w-4 rounded bg-paper" animate={{ rotate: open ? -45 : 0, y: open ? -3 : 0 }} />
              </span>
            </button>
          </nav>

          <AnimatePresence>
            {open && (
              <motion.div
                id="mobile-menu"
                className="md:hidden absolute left-0 right-0 top-full mt-2 rounded-2xl tactile p-3"
                initial={{ opacity: 0, y: -8, clipPath: "inset(0 0 100% 0 round 16px)" }}
                animate={{ opacity: 1, y: 0, clipPath: "inset(0 0 0% 0 round 16px)" }}
                exit={{ opacity: 0, y: -8, clipPath: "inset(0 0 100% 0 round 16px)" }}
                transition={{ duration: 0.35, ease: [0.2, 0.715, 0.205, 0.99] }}
              >
                <ul>
                  {links.map((l, i) => (
                    <li key={l.href} className="border-b border-line last:border-0">
                      <Link href={l.href} className="flex items-center justify-between py-3 px-2">
                        <motion.span initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.05 * i }}>
                          {l.label}
                        </motion.span>
                        <span className="label">{l.hint}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
                <div className="pt-3"><ConnectButton big /></div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* right pill: network + wallet */}
        <div className="pointer-events-auto hidden md:flex items-center gap-3 rounded-2xl tactile backdrop-blur pl-4 pr-2 py-2">
          <span className="label flex items-center gap-2"><span className="size-1.5 rounded-full bg-ok" aria-hidden />{CHAIN_NAME}</span>
          <ConnectButton />
        </div>
      </div>
    </header>
  );
}
