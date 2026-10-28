"use client";
// Recherche instantanée : met à jour l'URL (?q=) pendant la saisie, avec un léger délai.
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { Icon } from "./Nav";

export function SearchBox({ defaultValue = "", placeholder = "Rechercher…" }: { defaultValue?: string; placeholder?: string }) {
  const router = useRouter();
  const path = usePathname();
  const params = useSearchParams();
  const [v, setV] = useState(defaultValue);
  const [pending, start] = useTransition();
  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    const t = setTimeout(() => {
      const p = new URLSearchParams(params.toString());
      if (v.trim()) p.set("q", v.trim()); else p.delete("q");
      start(() => router.replace(p.toString() ? `${path}?${p}` : path, { scroll: false }));
    }, 250);
    return () => clearTimeout(t);
  }, [v]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <label className="relative block">
      <span className="sr-only">Rechercher</span>
      <span className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-muted">
        <Icon name="search" className={`h-4 w-4 ${pending ? "animate-pulse text-brand" : ""}`} />
      </span>
      <input value={v} onChange={(e) => setV(e.target.value)} placeholder={placeholder}
        className="input w-64 rounded-full !pl-10" type="search" />
    </label>
  );
}
