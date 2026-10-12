// Example campaign cards. These are illustrative ideas, NOT real events, partners, or numbers.
const EXAMPLES = [
  { kind: "Workshop seats", name: "Intro to Solidity, Saturday", slots: 30, window: "48h" },
  { kind: "Scholarship", name: "Community bootcamp scholarship", slots: 10, window: "7d" },
  { kind: "Concert tickets", name: "Small venue, standing room", slots: 150, window: "24h" },
  { kind: "Hackathon spots", name: "Weekend build sprint", slots: 80, window: "3d" },
  { kind: "Mentorship", name: "1:1 office hours", slots: 12, window: "12h" },
  { kind: "Merch drop", name: "Limited print run", slots: 200, window: "1h" },
];

export function Marquee() {
  const items = [...EXAMPLES, ...EXAMPLES];
  return (
    <section aria-labelledby="examples-h" className="py-16">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 flex items-baseline justify-between gap-4 mb-6">
        <h2 id="examples-h" className="t-h3 font-display font-bold">What could go in line</h2>
        <span className="label">Examples · not real events</span>
      </div>
      <div className="relative overflow-hidden [mask-image:linear-gradient(90deg,transparent,black_8%,black_92%,transparent)]">
        <ul className="flex w-max gap-4 animate-marquee hover:[animation-play-state:paused]">
          {items.map((e, i) => (
            <li key={i} aria-hidden={i >= EXAMPLES.length} className="w-72 shrink-0 rounded-[1.75rem] tactile p-6 transition-transform duration-500 hover:-translate-y-1.5">
              <div className="flex items-center justify-between">
                <span className="label">{e.kind}</span>
                <span className="label rounded-full border border-line px-2 py-0.5">Example</span>
              </div>
              <p className="mt-6 font-display text-2xl font-bold leading-tight">{e.name}</p>
              <div className="mt-6 flex gap-6 text-sm">
                <span><span className="label block">Slots</span>{e.slots}</span>
                <span><span className="label block">Window</span>{e.window}</span>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
