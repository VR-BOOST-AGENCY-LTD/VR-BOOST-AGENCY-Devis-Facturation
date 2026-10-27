"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

const ICONS: Record<string, string> = {
  grid: "M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z",
  users: "M16 19v-1a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v1M9 10a3 3 0 1 0 0-6 3 3 0 0 0 0 6M22 19v-1a4 4 0 0 0-3-3.9M16 4.1a3 3 0 0 1 0 5.8",
  file: "M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9zM14 3v6h6M8 13h8M8 17h5",
  receipt: "M5 3v18l3-2 2 2 2-2 2 2 2-2 3 2V3l-3 2-2-2-2 2-2-2-2 2zM9 9h6M9 13h6",
  check: "M20 6 9 17l-5-5",
  wallet: "M3 7a2 2 0 0 1 2-2h13v4M3 7v10a2 2 0 0 0 2 2h15V9H5a2 2 0 0 1-2-2M16 14h.01",
  list: "M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01",
  cog: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-2.9 1.2V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-2.9-1.2l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.7 1.7 0 0 0 3.1 14H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.2-2.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1A1.7 1.7 0 0 0 10 3.1V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 2.9 1.2l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0 1.2 2.9H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1",
  clock: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18M12 7v5l3 2",
};

export function Icon({ name, className = "h-4 w-4" }: { name: string; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <path d={ICONS[name]} />
    </svg>
  );
}

type Item = { href: string; label: string; icon: string; badge?: number };

export function Nav({ items, user, logout }: { items: Item[]; user: { name: string; role: string }; logout: () => Promise<void> }) {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const active = (href: string) => (href === "/" ? path === "/" : path.startsWith(href));
  return (
    <>
      <div className="flex items-center justify-between bg-ink px-4 py-3 lg:hidden">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo.svg" alt="VR BOOST" className="h-6 invert" />
        <button className="rounded-md px-2 py-1 text-sm text-white ring-1 ring-white/20" onClick={() => setOpen(!open)} aria-expanded={open}>
          Menu
        </button>
      </div>
      <aside className={`${open ? "block" : "hidden"} bg-ink text-white lg:sticky lg:top-0 lg:flex lg:h-screen lg:w-64 lg:shrink-0 lg:flex-col`}>
        <div className="hidden px-6 pt-7 pb-6 lg:block">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.svg" alt="VR BOOST Agency" className="h-7 invert" />
          <p className="mt-2 text-[11px] uppercase tracking-[0.18em] text-white/40">Devis & Factures</p>
        </div>
        <nav className="flex-1 space-y-0.5 px-3 py-2">
          {items.map((it) => (
            <Link
              key={it.href}
              href={it.href}
              onClick={() => setOpen(false)}
              className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition ${active(it.href) ? "bg-white/10 text-white" : "text-white/65 hover:bg-white/5 hover:text-white"}`}
            >
              <Icon name={it.icon} />
              <span className="flex-1">{it.label}</span>
              {it.badge ? <span className="rounded-full bg-brand px-2 text-xs font-semibold">{it.badge}</span> : null}
            </Link>
          ))}
        </nav>
        <div className="border-t border-white/10 px-6 py-4">
          <p className="text-sm font-medium">{user.name}</p>
          <p className="text-xs text-white/50">{user.role}</p>
          <form action={logout}>
            <button className="mt-3 text-xs text-white/60 underline-offset-2 hover:text-white hover:underline">Se déconnecter</button>
          </form>
        </div>
      </aside>
    </>
  );
}
