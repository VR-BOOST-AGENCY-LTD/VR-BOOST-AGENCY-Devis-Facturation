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
  shield: "M12 3 4 6v6c0 5 3.4 8.4 8 9 4.6-.6 8-4 8-9V6zM9 12l2 2 4-4",
  menu: "M4 6h16M4 12h16M4 18h16",
  search: "M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16M21 21l-4.3-4.3",
  close: "M6 6l12 12M18 6 6 18",
  logout: "M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 17l-5-5 5-5M5 12h11",
};

export function Icon({ name, className = "h-4 w-4" }: { name: string; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <path d={ICONS[name]} />
    </svg>
  );
}

type Item = { href: string; label: string; icon: string; badge?: number; section?: string };

export function Nav({ items, user, logout }: { items: Item[]; user: { name: string; role: string; avatar?: string | null }; logout: () => Promise<void> }) {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const active = (href: string) => (href === "/" ? path === "/" : path.startsWith(href));
  const initials = user.name.split(/\s+/).filter((w) => /[A-Za-zÀ-ÿ]/.test(w)).slice(0, 2).map((w) => w[0]).join("").toUpperCase() || "VR";
  let lastSection: string | undefined;
  return (
    <>
      {/* Barre mobile */}
      <div className="sticky top-0 z-40 flex items-center justify-between border-b border-line/70 bg-white/80 px-4 py-3 backdrop-blur lg:hidden">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo.svg" alt="VR BOOST" className="h-6" />
        <button className="btn-icon" onClick={() => setOpen(!open)} aria-expanded={open} aria-label="Menu">
          <Icon name={open ? "close" : "menu"} />
        </button>
      </div>
      {open ? <div className="anim-fade fixed inset-0 z-40 bg-ink/20 backdrop-blur-[2px] lg:hidden" onClick={() => setOpen(false)} /> : null}
      <aside
        className={`${open ? "translate-x-0" : "-translate-x-[110%]"} fixed inset-y-3 left-3 z-50 flex w-[248px] flex-col rounded-[26px] border border-white/70 bg-white/85 shadow-[var(--shadow-lift)] backdrop-blur-xl transition-transform duration-300 ease-[var(--ease-out)] lg:sticky lg:top-3 lg:z-auto lg:h-[calc(100vh-1.5rem)] lg:translate-x-0 lg:shadow-[var(--shadow-card)]`}
      >
        <div className="px-6 pt-6 pb-5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.svg" alt="VR BOOST Agency" className="h-7" />
        </div>
        <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 pb-3">
          {items.map((it) => {
            const on = active(it.href);
            const header = it.section && it.section !== lastSection ? it.section : null;
            lastSection = it.section ?? lastSection;
            return (
              <div key={it.href}>
                {header ? <p className="px-3 pt-4 pb-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted/80">{header}</p> : null}
                <Link
                  href={it.href}
                  onClick={() => setOpen(false)}
                  aria-current={on ? "page" : undefined}
                  className={`group relative flex items-center gap-3 rounded-full px-3 py-2 text-sm font-medium transition duration-200 ${
                    on ? "bg-ink text-white shadow-[0_8px_20px_-10px_rgb(16_23_32/0.6)]" : "text-ink/70 hover:bg-mist hover:text-ink"
                  }`}
                >
                  <span className={`grid h-7 w-7 place-items-center rounded-full transition ${on ? "bg-white/15" : "bg-mist group-hover:bg-white"}`}>
                    <Icon name={it.icon} className="h-[15px] w-[15px]" />
                  </span>
                  <span className="flex-1">{it.label}</span>
                  {it.badge ? <span className="anim-pop rounded-full bg-brand px-2 py-0.5 text-[11px] font-semibold text-white tabular">{it.badge}</span> : null}
                </Link>
              </div>
            );
          })}
        </nav>
        <div className="m-3 rounded-2xl bg-mist/80 p-3">
          <div className="flex items-center gap-3">
            {user.avatar ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={user.avatar} alt="" className="h-9 w-9 shrink-0 rounded-full bg-white object-cover ring-1 ring-line" />
            ) : (
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-ink text-xs font-bold text-white">{initials}</span>
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">{user.name}</p>
              <p className="truncate text-[11px] text-muted">{user.role}</p>
            </div>
          </div>
          <div className="mt-3 flex items-center gap-2">
            <Link href="/compte" onClick={() => setOpen(false)} className="flex-1 rounded-full bg-white px-3 py-1.5 text-center text-xs font-medium ring-1 ring-line transition hover:ring-ink/20">Mon compte</Link>
            <form action={logout}>
              <button className="btn-icon h-8 w-8" aria-label="Se déconnecter" title="Se déconnecter"><Icon name="logout" className="h-3.5 w-3.5" /></button>
            </form>
          </div>
        </div>
      </aside>
    </>
  );
}
