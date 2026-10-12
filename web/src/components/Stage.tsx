import type { ReactNode } from "react";

/** Editor-window frame: chrome bar with a label and optional right slot. */
export function Stage({ title, right, children, className = "" }: { title: ReactNode; right?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <div className={`relative rounded-[2rem] bg-[#0f0d13] border border-line shadow-[0_40px_120px_-40px_rgba(157,107,255,0.4)] overflow-hidden ${className}`}>
      <div className="flex items-center gap-3 px-5 py-3 border-b border-line">
        <span className="size-2.5 rounded-full bg-ink-3" /><span className="size-2.5 rounded-full bg-ink-3" /><span className="size-2.5 rounded-full bg-ink-3" />
        <span className="label ml-2 truncate">{title}</span>
        {right && <span className="ml-auto font-mono text-sm tabular-nums whitespace-nowrap">{right}</span>}
      </div>
      {children}
    </div>
  );
}
