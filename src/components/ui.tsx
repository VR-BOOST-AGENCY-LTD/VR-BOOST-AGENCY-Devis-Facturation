import Link from "next/link";
import { formatCents } from "@/lib/format";
import { INVOICE_STATUS, QUOTE_STATUS } from "./status";

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {subtitle ? <p className="mt-1 text-sm text-muted">{subtitle}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
    </div>
  );
}

export function Badge({ kind, status }: { kind: "quote" | "invoice"; status: string }) {
  const s = (kind === "quote" ? QUOTE_STATUS : INVOICE_STATUS)[status] ?? { label: status, cls: "bg-mist" };
  return <span className={`inline-flex whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium ${s.cls}`}>{s.label}</span>;
}

export function Money({ cents, className = "" }: { cents: number; className?: string }) {
  return <span className={`tabular-nums whitespace-nowrap ${className}`}>{formatCents(cents, "MAD", true)}</span>;
}

export function Stat({ label, value, hint, href, tone = "ink" }: { label: string; value: React.ReactNode; hint?: string; href?: string; tone?: "ink" | "brand" | "red" | "sky" }) {
  const toneCls = { ink: "text-ink", brand: "text-brand", red: "text-red-600", sky: "text-sky" }[tone];
  const inner = (
    <div className="card h-full p-5 transition hover:shadow-sm">
      <p className="text-xs font-medium uppercase tracking-wide text-muted">{label}</p>
      <p className={`mt-2 text-2xl font-semibold ${toneCls}`}>{value}</p>
      {hint ? <p className="mt-1 text-xs text-muted">{hint}</p> : null}
    </div>
  );
  return href ? <Link href={href}>{inner}</Link> : inner;
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <div className="px-4 py-10 text-center text-sm text-muted">{children}</div>;
}

export function Notice({ tone = "amber", children }: { tone?: "amber" | "red" | "sky" | "green"; children: React.ReactNode }) {
  const cls = {
    amber: "border-amber-200 bg-amber-50 text-amber-900",
    red: "border-red-200 bg-red-50 text-red-800",
    sky: "border-sky/30 bg-sky-soft text-ink",
    green: "border-emerald-200 bg-emerald-50 text-emerald-900",
  }[tone];
  return <div className={`rounded-xl border px-4 py-3 text-sm ${cls}`}>{children}</div>;
}
