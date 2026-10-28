"use client";
// Petites briques d'animation : compteur qui défile, révélation à l'apparition à l'écran.
import { useEffect, useRef, useState } from "react";
import { formatCents } from "@/lib/format";

function reducedMotion() {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** Montant qui défile de 0 à sa valeur (une seule fois, ~0,9 s). */
export function CountUp({ cents, currency = "MAD", decimals = false, className = "" }: { cents: number; currency?: string; decimals?: boolean; className?: string }) {
  const [v, setV] = useState(cents);
  const started = useRef(false);
  useEffect(() => {
    if (started.current || reducedMotion() || cents === 0) return setV(cents);
    started.current = true;
    const t0 = performance.now();
    const dur = 900;
    let raf = 0;
    const tick = (t: number) => {
      const p = Math.min(1, (t - t0) / dur);
      const e = 1 - Math.pow(1 - p, 3);
      setV(Math.round(cents * e));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    setV(0);
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [cents]);
  return <span className={`tabular ${className}`}>{formatCents(v, currency, decimals)}</span>;
}

/** Nombre entier qui défile. */
export function CountUpInt({ value, className = "" }: { value: number; className?: string }) {
  const [v, setV] = useState(value);
  useEffect(() => {
    if (reducedMotion() || value === 0) return setV(value);
    const t0 = performance.now();
    let raf = 0;
    const tick = (t: number) => {
      const p = Math.min(1, (t - t0) / 700);
      setV(Math.round(value * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  return <span className={`tabular ${className}`}>{v}</span>;
}

/** Vrai dès que l'élément entre dans l'écran (déclenche les animations de graphiques). */
export function useInView<T extends Element>() {
  const ref = useRef<T>(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || reducedMotion()) return setInView(true);
    const io = new IntersectionObserver(([e]) => e.isIntersecting && (setInView(true), io.disconnect()), { threshold: 0.2 });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return { ref, inView };
}
