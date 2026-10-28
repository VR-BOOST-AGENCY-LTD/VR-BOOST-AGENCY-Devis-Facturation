import Link from "next/link";
import { formatCents } from "@/lib/format";
import { CountUp } from "./Motion";
import { INVOICE_STATUS, QUOTE_STATUS } from "./status";

export function PageHeader({ title, subtitle, actions, eyebrow }: { title: string; subtitle?: React.ReactNode; actions?: React.ReactNode; eyebrow?: string }) {
  return (
    <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        {eyebrow ? <p className="mb-1 text-xs font-semibold uppercase tracking-[0.14em] text-brand">{eyebrow}</p> : null}
        <h1 className="text-[28px] leading-tight font-bold tracking-tight sm:text-[32px]">{title}</h1>
        {subtitle ? <div className="mt-1.5 text-sm text-muted">{subtitle}</div> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function Badge({ kind, status }: { kind: "quote" | "invoice"; status: string }) {
  const s = (kind === "quote" ? QUOTE_STATUS : INVOICE_STATUS)[status] ?? { label: status, cls: "bg-mist", dot: "bg-muted" };
  return (
    <span className={`chip transition-colors duration-300 ${s.cls}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${s.dot} ${s.pulse ? "pulse-dot text-amber-500/40" : ""}`} aria-hidden />
      {s.label}
    </span>
  );
}

export function Money({ cents, className = "" }: { cents: number; className?: string }) {
  return <span className={`tabular whitespace-nowrap ${className}`}>{formatCents(cents, "MAD", true)}</span>;
}

const TINT = {
  ink: { card: "", value: "text-ink", bar: "bg-ink" },
  brand: { card: "bg-gradient-to-br from-[#fff4ec] to-white", value: "text-ink", bar: "bg-brand" },
  green: { card: "bg-gradient-to-br from-[#ecfbf1] to-white", value: "text-ink", bar: "bg-go" },
  sky: { card: "bg-gradient-to-br from-[#eaf6fd] to-white", value: "text-ink", bar: "bg-sky" },
  violet: { card: "bg-gradient-to-br from-[#f3efff] to-white", value: "text-ink", bar: "bg-violet-500" },
  red: { card: "bg-gradient-to-br from-[#fff0f1] to-white", value: "text-rose-600", bar: "bg-rose-500" },
} as const;

/** Carte KPI teintée : grand chiffre animé, pastille, barre de progression facultative. */
export function Stat({
  label, cents, value, hint, href, tone = "ink", progress, icon,
}: {
  label: string; cents?: number; value?: React.ReactNode; hint?: string; href?: string;
  tone?: keyof typeof TINT; progress?: number; icon?: React.ReactNode;
}) {
  const t = TINT[tone];
  const inner = (
    <div className={`card card-hover group h-full p-5 ${t.card}`}>
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-medium text-muted">{label}</p>
        {icon ? <span className="grid h-8 w-8 place-items-center rounded-xl bg-white/80 text-ink shadow-sm ring-1 ring-line">{icon}</span> : null}
      </div>
      <p className={`mt-3 text-[26px] leading-none font-bold tracking-tight ${t.value}`}>
        {cents !== undefined ? <CountUp cents={cents} /> : value}
      </p>
      <div className="mt-3 flex items-center gap-3">
        {hint ? <p className="flex-1 text-xs text-muted">{hint}</p> : <span className="flex-1" />}
        {progress !== undefined ? (
          <div className="flex w-24 items-center gap-2">
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-black/5">
              <div className={`grow-x h-full rounded-full ${t.bar}`} style={{ width: `${Math.max(0, Math.min(100, progress))}%` }} />
            </div>
            <span className="tabular text-[11px] font-semibold text-muted">{Math.round(progress)}%</span>
          </div>
        ) : null}
      </div>
    </div>
  );
  return href ? <Link href={href} className="block rounded-[22px] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand/25">{inner}</Link> : inner;
}

export function Empty({ children, action }: { children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 px-4 py-12 text-center">
      <div className="grid h-12 w-12 place-items-center rounded-2xl bg-mist text-muted">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} className="h-6 w-6" aria-hidden>
          <path d="M4 7a2 2 0 0 1 2-2h4l2 2h6a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z" />
        </svg>
      </div>
      <p className="text-sm text-muted">{children}</p>
      {action}
    </div>
  );
}

export function Notice({ tone = "amber", children }: { tone?: "amber" | "red" | "sky" | "green"; children: React.ReactNode }) {
  const cls = {
    amber: "border-amber-200/80 bg-amber-50/90 text-amber-900",
    red: "border-rose-200/80 bg-rose-50/90 text-rose-800",
    sky: "border-sky-200/80 bg-sky-50/90 text-ink",
    green: "border-emerald-200/80 bg-emerald-50/90 text-emerald-900",
  }[tone];
  return <div className={`anim-fade rounded-2xl border px-4 py-3 text-sm ${cls}`}>{children}</div>;
}

/** Sélecteur segmenté (filtres de statut), à la manière des contrôles 1H / 1D / 1W. */
export function Segmented({ items, active }: { items: { href: string; label: string; key: string; count?: number }[]; active: string }) {
  return (
    <nav className="flex max-w-full flex-wrap gap-1 rounded-full bg-white/80 p-1 shadow-sm ring-1 ring-line" aria-label="Filtres">
      {items.map((it) => {
        const on = it.key === active;
        return (
          <Link key={it.key} href={it.href} aria-current={on ? "page" : undefined}
            className={`rounded-full px-3 py-1.5 text-xs font-medium transition duration-200 ${on ? "bg-ink text-white shadow-sm" : "text-muted hover:bg-mist hover:text-ink"}`}>
            {it.label}{it.count !== undefined ? <span className={`ml-1.5 tabular ${on ? "text-white/70" : "text-muted/70"}`}>{it.count}</span> : null}
          </Link>
        );
      })}
    </nav>
  );
}
