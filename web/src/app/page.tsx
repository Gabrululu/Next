import Link from "next/link";
import { Fragment } from "react";
import { HeroQueue } from "@/components/HeroQueue";
import { HowItWorks } from "@/components/HowItWorks";
import { Marquee } from "@/components/Marquee";
import { RecentCampaigns } from "@/components/RecentCampaigns";
import { Reveal } from "@/components/Reveal";
import { Statement } from "@/components/Statement";
import { StressPanel } from "@/components/StressPanel";
import { CHAIN_NAME } from "@/lib/config";

const HEADLINE = ["Everyone", "in", "line.", "Nobody", "cuts", "in."];

export default function Home() {
  return (
    <>
      {/* hero: centered statement, then a wide stage for the queue */}
      <section className="relative overflow-hidden">
        <div aria-hidden className="pointer-events-none absolute inset-x-0 -top-40 h-[70vh] bg-[radial-gradient(ellipse_at_center,rgba(157,107,255,0.22),transparent_65%)]" />
        <div className="relative mx-auto max-w-6xl px-4 sm:px-6 pt-20 sm:pt-28 text-center flex flex-col items-center">
          <p className="label word-in">Fair-access draws · {CHAIN_NAME}</p>
          <h1 className="t-hero font-display font-extrabold mt-6 max-w-[11ch]">
            {HEADLINE.map((w, i) => (
              <Fragment key={i}>
                {/* real spaces between words, so screen readers and search engines read separate words */}
                {i > 0 && " "}
                <span className={`word-in inline-block ${i >= 3 ? "text-volt" : ""}`} style={{ animationDelay: `${120 + i * 80}ms` }}>
                  {w}
                </span>
              </Fragment>
            ))}
          </h1>
          <p className="t-lead text-mute mt-8 max-w-[34ch] word-in" style={{ animationDelay: "650ms" }}>
            For seats, scholarships and anything else in short supply. Arrival order doesn&apos;t matter. A public seed picks the winners.
          </p>
          <div className="mt-10 flex flex-wrap justify-center gap-3 word-in" style={{ animationDelay: "750ms" }}>
            <Link href="/create" className="glow btn-volt rounded-2xl px-7 py-4 font-semibold text-lg active:scale-[0.97] transition-transform">Open a window</Link>
            <Link href="/stress" className="glow tactile rounded-2xl px-7 py-4 font-semibold text-lg">See the stress test</Link>
          </div>
        </div>
        <div className="relative mx-auto max-w-5xl px-4 sm:px-6 mt-16 sm:mt-20">
          <HeroQueue />
        </div>
      </section>

      <Statement />

      <Marquee />

      <HowItWorks />

      {/* stress showpiece */}
      <section aria-labelledby="stress-h" className="mx-auto max-w-6xl px-4 sm:px-6 py-24 md:py-32">
        <div className="flex flex-wrap items-end justify-between gap-6 mb-10">
          <div>
            <Reveal><p className="label">Real numbers · simulated entrants</p></Reveal>
            <Reveal delay={80}><h2 id="stress-h" className="t-h2 font-display font-extrabold mt-4 max-w-[14ch]">Built for the rush.</h2></Reveal>
          </div>
          <Reveal delay={160}>
            <Link href="/stress" className="glow tactile rounded-2xl px-5 py-3 font-semibold inline-flex items-center gap-3">
              Full run details <span aria-hidden>→</span>
            </Link>
          </Reveal>
        </div>
        <Reveal delay={120}><StressPanel compact /></Reveal>
      </section>

      <RecentCampaigns />

      {/* closing call to action */}
      <section className="mx-auto max-w-6xl px-4 sm:px-6 py-24 md:py-32 text-center">
        <Reveal><h2 className="t-h2 font-display font-extrabold max-w-[16ch] mx-auto">Your next drop, without the race.</h2></Reveal>
        <Reveal delay={100}>
          <Link href="/create" className="glow btn-volt mt-10 inline-block rounded-2xl px-8 py-4 font-semibold text-lg">Open a window</Link>
        </Reveal>
      </section>
    </>
  );
}
