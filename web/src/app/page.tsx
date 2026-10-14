import Link from "next/link";
import { Fragment } from "react";
import { HeroQueue } from "@/components/HeroQueue";
import { HowItWorks } from "@/components/HowItWorks";
import { RecentCampaigns } from "@/components/RecentCampaigns";
import { Reveal } from "@/components/Reveal";
import { Statement } from "@/components/Statement";
import { getT } from "@/lib/i18n/server";

export default async function Home() {
  const t = await getT();
  // Two phrases; the second one is highlighted. Split into words for the staggered entrance.
  const first = t("Everyone in line.").split(" ");
  const HEADLINE = [...first, ...t("Nobody cuts in.").split(" ")];
  return (
    <>
      {/* hero: centered statement, then a wide stage for the queue */}
      <section className="relative overflow-hidden">
        <div aria-hidden className="pointer-events-none absolute inset-x-0 -top-40 h-[70vh] bg-[radial-gradient(ellipse_at_center,rgba(157,107,255,0.22),transparent_65%)]" />
        <div className="relative mx-auto max-w-6xl px-4 sm:px-6 pt-20 sm:pt-28 text-center flex flex-col items-center">
          <p className="label word-in">{t("Fair draws for things in short supply")}</p>
          <h1 className="t-hero font-display font-extrabold mt-6 max-w-[11ch]">
            {HEADLINE.map((w, i) => (
              <Fragment key={i}>
                {/* real spaces between words, so screen readers and search engines read separate words */}
                {i > 0 && " "}
                <span className={`word-in inline-block ${i >= first.length ? "text-volt" : ""}`} style={{ animationDelay: `${120 + i * 80}ms` }}>
                  {w}
                </span>
              </Fragment>
            ))}
          </h1>
          <p className="t-lead text-mute mt-8 max-w-[34ch] word-in" style={{ animationDelay: "650ms" }}>
            {t("For seats, scholarships and anything else that runs out. Joining first doesn't matter. A fair draw picks the winners, and anyone can check it.")}
          </p>
          <div className="mt-10 flex flex-wrap justify-center gap-3 word-in" style={{ animationDelay: "750ms" }}>
            <Link href="/create" className="glow btn-volt rounded-2xl px-7 py-4 font-semibold text-lg active:scale-[0.97] transition-transform">{t("Open a window")}</Link>
            <Link href="/#how" className="glow tactile rounded-2xl px-7 py-4 font-semibold text-lg">{t("How it works")}</Link>
          </div>
        </div>
        <div className="relative mx-auto max-w-5xl px-4 sm:px-6 mt-16 sm:mt-20">
          <HeroQueue />
        </div>
      </section>

      <Statement />

      <HowItWorks />

      <RecentCampaigns />

      {/* closing call to action */}
      <section className="mx-auto max-w-6xl px-4 sm:px-6 py-24 md:py-32 text-center">
        <Reveal><h2 className="t-h2 font-display font-extrabold max-w-[16ch] mx-auto">{t("Your next drop, without the race.")}</h2></Reveal>
        <Reveal delay={100}>
          <Link href="/create" className="glow btn-volt mt-10 inline-block rounded-2xl px-8 py-4 font-semibold text-lg">{t("Open a window")}</Link>
        </Reveal>
      </section>
    </>
  );
}
