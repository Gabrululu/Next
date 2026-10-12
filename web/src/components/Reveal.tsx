"use client";

import { useEffect, useRef, type ElementType, type ReactNode } from "react";

/** Slides children up once they enter the viewport. Stagger with `delay` (ms). */
export function Reveal({
  children, delay = 0, as: Tag = "div", className = "",
}: { children: ReactNode; delay?: number; as?: ElementType; className?: string }) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) { el.classList.add("is-in"); io.disconnect(); }
    }, { rootMargin: "0px 0px -10% 0px" });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    <Tag ref={ref} className={`reveal ${className}`} style={{ transitionDelay: `${delay}ms` }}>
      {children}
    </Tag>
  );
}

/** One shared squircle clip path (objectBoundingBox), referenced by `.squircle`. */
export function SquircleDefs() {
  return (
    <svg width="0" height="0" style={{ position: "absolute" }} aria-hidden focusable="false">
      <clipPath id="squircle" clipPathUnits="objectBoundingBox">
        {/* superellipse-like path generated for n≈5 */}
        <path d="M0.5,0 C0.9,0 1,0.1 1,0.5 C1,0.9 0.9,1 0.5,1 C0.1,1 0,0.9 0,0.5 C0,0.1 0.1,0 0.5,0 Z" />
      </clipPath>
    </svg>
  );
}
