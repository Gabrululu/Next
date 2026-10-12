"use client";

import { useState } from "react";
import { Stage } from "./Stage";

/** Code block in an editor window, with a copy button. */
export function Terminal({ title, code, className = "" }: { title: string; code: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard?.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <Stage
      title={title}
      className={className}
      right={
        <button onClick={copy} className="label rounded-lg px-2 py-1 hover:bg-ink-3 hover:text-paper transition-colors" aria-live="polite">
          {copied ? "Copied" : "Copy"}
        </button>
      }
    >
      <pre className="p-5 sm:p-6 overflow-x-auto font-mono text-sm leading-relaxed text-volt-2"><code>{code}</code></pre>
    </Stage>
  );
}
