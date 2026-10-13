import { LivePanel } from "@/components/LivePanel";
import { Reveal } from "@/components/Reveal";
import { StressPanel } from "@/components/StressPanel";
import { Terminal } from "@/components/Terminal";
import { CHAIN_NAME } from "@/lib/config";

export const metadata = { title: "Stress test — Next" };

const METHOD = [
  { n: "01", t: "Throwaway wallets", d: "The script generates fresh keys and funds each one in batched Disperse transactions. They are simulated entrants, not real users." },
  { n: "02", t: "One burst", d: "Every wallet's register() is signed in advance, then all of them are sent to the public RPC at the same moment." },
  { n: "03", t: "Measured as seen", d: "Confirmation time is when a tx's block first showed up through the public RPC, so it includes polling and RPC lag." },
  { n: "04", t: "Then verified", d: "After the seed block, the script runs the draw and the independent verifier recomputes the winners." },
];

export default function StressPage() {
  return (
    <div className="mx-auto max-w-6xl px-4 sm:px-6 pt-16 sm:pt-24 pb-10">
      <Reveal><p className="label">Stress test · simulated entrants</p></Reveal>
      <h1 className="t-hero font-display font-extrabold mt-5">
        <span className="word-in block text-balance">Everyone shows up</span>
        <span className="word-in block text-balance text-mute" style={{ animationDelay: "120ms" }}>at the same second.</span>
      </h1>
      <p className="t-lead text-mute mt-8 max-w-[44ch] word-in" style={{ animationDelay: "240ms" }}>
        Drops break when everyone arrives at once. This is a recorded run on {CHAIN_NAME}, and every number below comes from it.
      </p>

      <Reveal delay={150} className="mt-14"><StressPanel /></Reveal>

      {process.env.NEXT_PUBLIC_ENVIO_GRAPHQL_URL && (
      <section aria-labelledby="live-h" className="mt-16">
        <Reveal><h2 id="live-h" className="t-h2 font-display font-extrabold">Right now</h2></Reveal>
        <Reveal delay={80}><p className="mt-4 text-mute max-w-[52ch]">Live counters from the Envio indexer, which reads every Next event on {CHAIN_NAME} as it lands.</p></Reveal>
        <Reveal delay={120} className="mt-8"><LivePanel /></Reveal>
      </section>
      )}

      <section aria-labelledby="method-h" className="mt-24">
        <Reveal><h2 id="method-h" className="t-h2 font-display font-extrabold">How it was measured</h2></Reveal>
        <ol className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {METHOD.map((m, i) => (
            <Reveal key={m.n} as="li" delay={i * 90} className="rounded-[1.75rem] tactile p-6 flex flex-col">
              <span className="squircle grid grid-cols-1 place-items-center size-9 bg-volt/20 text-volt-2 font-mono text-xs">{m.n}</span>
              <p className="mt-8 font-display text-2xl font-bold leading-tight">{m.t}</p>
              <p className="mt-3 text-sm text-mute leading-relaxed">{m.d}</p>
            </Reveal>
          ))}
        </ol>
      </section>

      <section aria-labelledby="repro-h" className="mt-24 grid grid-cols-1 gap-6 lg:grid-cols-[1fr_1.3fr] items-center">
        <div>
          <Reveal><h2 id="repro-h" className="t-h2 font-display font-extrabold">Reproduce it</h2></Reveal>
          <Reveal delay={80}>
            <p className="mt-5 text-mute leading-relaxed max-w-[40ch]">
              Needs a funded testnet key in <code className="font-mono text-paper">.env</code>. If the balance can&apos;t cover N wallets, the
              script stops before spending anything and prints the largest N it can afford.
            </p>
          </Reveal>
        </div>
        <Reveal delay={120}>
          <Terminal title="terminal" code={`cd scripts && pnpm install\npnpm stress --n 180 --slots 25 --window 120 --draw`} />
        </Reveal>
      </section>
    </div>
  );
}
