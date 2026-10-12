"use client";

import { motion, useReducedMotion } from "framer-motion";
import { useCallback, useRef } from "react";

type Props = {
  stops: { value: number; label: string }[];
  index: number;
  onChange: (i: number) => void;
  label: string;
};

const SWEEP = 270; // degrees covered from first to last stop
const START = -135;

/** Rotary dial snapping to discrete stops. Drag around it or use arrow keys. */
export function Dial({ stops, index, onChange, label }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();
  const step = SWEEP / (stops.length - 1);
  const angle = START + index * step;

  const fromPointer = useCallback((x: number, y: number) => {
    const r = ref.current!.getBoundingClientRect();
    const dx = x - (r.left + r.width / 2), dy = y - (r.top + r.height / 2);
    if (Math.hypot(dx, dy) < r.width * 0.2) return; // dead zone at the hub: no accidental jumps
    let deg = (Math.atan2(dx, -dy) * 180) / Math.PI; // 0 = up, clockwise positive
    deg = Math.max(START, Math.min(START + SWEEP, deg));
    const i = Math.round((deg - START) / step);
    if (i !== index) {
      onChange(i);
      navigator.vibrate?.(4);
    }
  }, [index, onChange, step]);

  const set = (i: number) => onChange(Math.max(0, Math.min(stops.length - 1, i)));

  return (
    <div className="flex flex-col items-center gap-4 select-none">
      <div className="relative size-56 sm:size-64">
        {/* tick ring */}
        <svg viewBox="0 0 200 200" className="absolute inset-0" aria-hidden>
          {stops.map((s, i) => {
            const a = ((START + i * step - 90) * Math.PI) / 180;
            const active = i <= index;
            return (
              <g key={s.value}>
                <line
                  x1={100 + Math.cos(a) * 86} y1={100 + Math.sin(a) * 86}
                  x2={100 + Math.cos(a) * 96} y2={100 + Math.sin(a) * 96}
                  stroke={active ? "var(--color-volt)" : "var(--color-line)"} strokeWidth={i === index ? 4 : 2.5} strokeLinecap="round"
                />
              </g>
            );
          })}
        </svg>
        {/* knob */}
        <div
          ref={ref}
          role="slider"
          tabIndex={0}
          aria-label={label}
          aria-valuemin={0}
          aria-valuemax={stops.length - 1}
          aria-valuenow={index}
          aria-valuetext={stops[index].label}
          className="absolute inset-[14%] rounded-full tactile cursor-grab active:cursor-grabbing touch-none"
          onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); fromPointer(e.clientX, e.clientY); }}
          onPointerMove={(e) => { if (e.buttons) fromPointer(e.clientX, e.clientY); }}
          onKeyDown={(e) => {
            if (["ArrowRight", "ArrowUp"].includes(e.key)) { e.preventDefault(); set(index + 1); }
            if (["ArrowLeft", "ArrowDown"].includes(e.key)) { e.preventDefault(); set(index - 1); }
            if (e.key === "Home") { e.preventDefault(); set(0); }
            if (e.key === "End") { e.preventDefault(); set(stops.length - 1); }
          }}
        >
          <motion.div
            className="absolute inset-0"
            animate={{ rotate: angle }}
            transition={reduce ? { duration: 0 } : { type: "spring", stiffness: 380, damping: 26 }}
          >
            {/* grip ridges + indicator notch */}
            <div className="absolute inset-[10%] rounded-full" style={{ background: "repeating-conic-gradient(from 0deg, rgba(255,255,255,0.05) 0deg 3deg, transparent 3deg 9deg)" }} />
            <div className="absolute left-1/2 top-[7%] h-[18%] w-1.5 -translate-x-1/2 rounded-full bg-volt shadow-[0_0_12px_var(--color-volt)]" />
          </motion.div>
          <div className="absolute inset-[30%] rounded-full tactile-pressed grid place-items-center text-center">
            <span className="font-display text-2xl sm:text-3xl font-bold leading-none">{stops[index].label}</span>
          </div>
        </div>
      </div>
      <span className="label">{label}</span>
    </div>
  );
}
