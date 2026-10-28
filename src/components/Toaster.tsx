"use client";
// Notifications « toast » : messages courts en bas à droite, disparition automatique, lus par les lecteurs d'écran.
import { useEffect, useState } from "react";

type Toast = { id: number; tone: "success" | "error" | "info"; text: string };
type Listener = (t: Toast) => void;

const listeners = new Set<Listener>();
let seq = 0;

/** Affiche un toast depuis n'importe quel composant client. */
export function toast(text: string, tone: Toast["tone"] = "success") {
  const t = { id: ++seq, tone, text };
  listeners.forEach((l) => l(t));
}

const ICON: Record<Toast["tone"], string> = {
  success: "M20 6 9 17l-5-5",
  error: "M12 8v5M12 16h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0",
  info: "M12 16v-4M12 8h.01M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20",
};
const TONE: Record<Toast["tone"], string> = {
  success: "bg-ink text-white",
  error: "bg-red-600 text-white",
  info: "bg-white text-ink ring-1 ring-line",
};

export function Toaster() {
  const [items, setItems] = useState<Toast[]>([]);
  useEffect(() => {
    const l: Listener = (t) => {
      setItems((p) => [...p.slice(-3), t]);
      setTimeout(() => setItems((p) => p.filter((x) => x.id !== t.id)), t.tone === "error" ? 6000 : 3500);
    };
    listeners.add(l);
    return () => void listeners.delete(l);
  }, []);
  return (
    <div aria-live="polite" className="pointer-events-none fixed right-4 bottom-4 z-[60] flex w-[min(380px,calc(100vw-2rem))] flex-col gap-2">
      {items.map((t) => (
        <div key={t.id} role={t.tone === "error" ? "alert" : "status"}
          className={`anim-toast pointer-events-auto flex items-start gap-3 rounded-2xl px-4 py-3 text-sm shadow-[var(--shadow-lift)] ${TONE[t.tone]}`}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"
            className={`mt-0.5 h-4 w-4 shrink-0 ${t.tone === "success" ? "text-go" : ""}`} aria-hidden><path d={ICON[t.tone]} /></svg>
          <span className="flex-1">{t.text}</span>
          <button className="opacity-60 hover:opacity-100" aria-label="Fermer" onClick={() => setItems((p) => p.filter((x) => x.id !== t.id))}>✕</button>
        </div>
      ))}
    </div>
  );
}
