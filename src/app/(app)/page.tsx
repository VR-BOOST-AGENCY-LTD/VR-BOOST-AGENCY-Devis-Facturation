import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { remainingDue } from "@/lib/calc";
import { db } from "@/lib/db";
import { formatCents, formatDateShort, formatReference, quoteReference } from "@/lib/format";
import { can } from "@/lib/permissions";
import { getSettings, isProduction } from "@/lib/settings";
import { cents } from "@/server/common";
import { dashboardData } from "@/server/dashboard";
import { isOverdue } from "@/server/invoices";
import { GaugeChart, PipelineFlow, TrendChart } from "@/components/charts";
import { CountUpInt } from "@/components/Motion";
import { Icon } from "@/components/Nav";
import { Badge, Empty, Money, Notice, Stat } from "@/components/ui";

export const metadata = { title: "Tableau de bord" };

function HeaderKpi({ label, value, pill, href, tone = "" }: { label: string; value: React.ReactNode; pill?: string; href: string; tone?: string }) {
  return (
    <Link href={href} className="group rounded-2xl px-3 py-2 transition hover:bg-white/70">
      <p className="text-xs font-medium text-muted">{label}</p>
      <p className={`mt-1 flex items-center gap-2 text-2xl font-bold tracking-tight ${tone}`}>
        {value}
        {pill ? <span className="pill-value">{pill}</span> : null}
      </p>
    </Link>
  );
}

export default async function Dashboard({ searchParams }: { searchParams: Promise<{ refus?: string }> }) {
  const user = await requireUser();
  const { refus } = await searchParams;
  const year = new Date().getFullYear();
  const [settings, sequences, d, pendingQ, pendingI, openQuotes, recentQuotes, nextDue] = await Promise.all([
    getSettings(),
    db.sequence.findMany({ where: { year } }),
    dashboardData(),
    db.quote.count({ where: { status: "PENDING_APPROVAL", deletedAt: null } }),
    db.invoice.count({ where: { status: "PENDING_APPROVAL", deletedAt: null } }),
    db.quote.findMany({ where: { status: { in: ["APPROVED", "SENT"] }, deletedAt: null }, select: { totalTtc: true } }),
    db.quote.findMany({ orderBy: { updatedAt: "desc" }, take: 6, include: { client: { select: { name: true } } }, where: { status: { not: "SUPERSEDED" }, deletedAt: null } }),
    db.invoice.findMany({
      where: { status: { in: ["ISSUED", "PARTIALLY_PAID"] }, type: { not: "CREDIT_NOTE" }, deletedAt: null },
      include: { client: { select: { name: true } } },
      orderBy: { dueDate: "asc" },
      take: 6,
    }),
  ]);
  const pipeline = openQuotes.reduce((s, q) => s + cents(q.totalTtc), 0);
  const unconfirmed = sequences.filter((s) => !s.confirmedAt);
  const firstName = user.name.split(/\s+/).find((w) => /[A-Za-zÀ-ÿ]/.test(w)) ?? user.name;
  const conversion = d.flow[0].amount ? Math.round((d.flow[2].amount / d.flow[0].amount) * 100) : 0;
  const maxClient = Math.max(1, ...d.topClients.map((c) => c.due));

  return (
    <>
      {/* En-tête : salutation + indicateurs clés en ligne */}
      <div className="mb-6 flex flex-wrap items-end justify-between gap-6">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-brand">Tableau de bord</p>
          <h1 className="mt-1 text-[32px] leading-tight font-bold tracking-tight sm:text-[38px]">Bonjour {firstName} !</h1>
          <p className="mt-1 text-sm text-muted">Devis, factures et encaissements de VR BOOST AGENCY</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Link href="/devis/nouveau" className="btn-brand">+ Nouveau devis</Link>
            <Link href="/factures/nouveau" className="btn-ghost">+ Facture</Link>
          </div>
        </div>
        <div className="flex flex-wrap gap-1 sm:gap-4">
          {can(user, "quote.approve") ? (
            <HeaderKpi label="À valider" href="/validation" value={<CountUpInt value={pendingQ + pendingI} />} pill={`${pendingQ} devis · ${pendingI} fact.`} />
          ) : (
            <HeaderKpi label="En attente du CEO" href="/devis?statut=PENDING_APPROVAL" value={<CountUpInt value={pendingQ + pendingI} />} />
          )}
          <HeaderKpi label="Devis en cours" href="/devis?statut=SENT" value={<CountUpInt value={openQuotes.length} />} pill={formatCents(pipeline)} />
          <HeaderKpi label="En retard" href="/factures?statut=OVERDUE" tone={d.overdueCount ? "text-rose-600" : ""} value={<CountUpInt value={d.overdueCount} />} pill={formatCents(d.overdue)} />
        </div>
      </div>

      <div className="mb-6 space-y-3 empty:hidden">
        {refus ? <Notice tone="red">Accès refusé : cette section est réservée au CEO.</Notice> : null}
        {unconfirmed.length > 0 || sequences.length < 2 ? (
          <Notice>
            <b>Numérotation à confirmer avant toute émission.</b> Derniers numéros pré-configurés :{" "}
            {sequences.map((s) => `${s.series === "QUOTE" ? "DEVIS" : "FACTURES"} ${formatReference(s.lastNumber, s.year, settings.numberPadding, s.series === "QUOTE" ? settings.quoteNumberFormat : settings.invoiceNumberFormat)}`).join(" · ") || "aucun"}.
            {can(user, "sequence.edit") ? <> <Link href="/parametres#numerotation" className="font-semibold underline">Confirmer maintenant</Link></> : " Le CEO doit les confirmer."}
          </Notice>
        ) : null}
        {!settings.accountantValidatedAt ? (
          <Notice tone={isProduction() ? "red" : "amber"}>
            Modèles et traitements fiscaux <b>non encore validés par le comptable</b>{isProduction() ? " : émission des factures bloquée." : " (requis avant la mise en production)."}
          </Notice>
        ) : null}
      </div>

      <div className="stagger grid gap-4 xl:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        {/* Encaissement de l'année + clients qui doivent le plus */}
        <section className="card p-5">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-sm font-semibold">Encaissement {year}</h2>
            <Link href="/paiements" className="chip bg-mist text-muted hover:text-ink">Paiements →</Link>
          </div>
          <div className="grid items-center gap-4 sm:grid-cols-[1fr_1.1fr] xl:grid-cols-1 2xl:grid-cols-[1fr_1.1fr]">
            <GaugeChart value={d.yearCollected} total={d.yearInvoiced} label="Encaissé sur l'année" />
            <div>
              <p className="mb-2 text-xs font-medium text-muted">Reste à encaisser · <span className="font-semibold text-ink">{formatCents(d.outstanding)}</span></p>
              <ul className="space-y-2.5">
                {d.topClients.map((c, i) => (
                  <li key={c.name} className="text-sm">
                    <div className="flex items-center gap-2">
                      <span className={`h-2 w-2 shrink-0 rounded-full ${c.late ? "bg-rose-500" : ["bg-brand", "bg-amber-500", "bg-go", "bg-sky", "bg-violet-500"][i % 5]}`} />
                      <span className="min-w-0 truncate font-medium">{c.name}</span>
                      <span className="mx-1 min-w-3 flex-1 border-b border-dashed border-ink/15" />
                      <span className="shrink-0 whitespace-nowrap tabular font-semibold">{formatCents(c.due)}</span>
                    </div>
                    <div className="mt-1 ml-4 h-1 overflow-hidden rounded-full bg-black/5">
                      <div className={`grow-x h-full rounded-full ${c.late ? "bg-rose-400" : "bg-ink/70"}`} style={{ width: `${(c.due / maxClient) * 100}%`, animationDelay: `${200 + i * 80}ms` }} />
                    </div>
                  </li>
                ))}
                {d.topClients.length === 0 ? <li className="text-sm text-muted">Tout est encaissé. 🎉</li> : null}
              </ul>
            </div>
          </div>
        </section>

        {/* Tendance mensuelle */}
        <section className="card p-5">
          <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-sm font-semibold">Facturé et encaissé — 12 mois (TTC)</h2>
              <p className="text-xs text-muted">Survolez un mois pour le détail</p>
            </div>
            <div className="flex gap-2">
              <span className="chip bg-brand text-white">Facturé TTC</span>
              <span className="chip bg-mist text-muted">Encaissé</span>
            </div>
          </div>
          <TrendChart points={d.trend} />
        </section>

        {/* Flux du pipeline */}
        <section className="card p-5 xl:col-span-2">
          <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold">Du devis à l&apos;encaissement</h2>
              <p className="text-xs text-muted">12 derniers mois · montants TTC</p>
            </div>
            <div className="flex gap-6">
              <div><p className="text-xs text-muted">Taux d&apos;acceptation</p><p className="text-xl font-bold tabular">{conversion} %</p></div>
              <div><p className="text-xs text-muted">CA HT 12 mois</p><p className="text-xl font-bold tabular">{formatCents(d.revenue12)}</p></div>
            </div>
          </div>
          <PipelineFlow stages={d.flow} />
        </section>
      </div>

      <div className="stagger mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label={`CA HT facturé · 12 mois`} cents={d.revenue12} tone="brand" hint="Net des avoirs, acomptes comptés une fois" icon={<Icon name="receipt" className="h-4 w-4" />} />
        <Stat label={`Encaissé ${year}`} cents={d.yearCollected} tone="green" progress={d.yearInvoiced ? (d.yearCollected / d.yearInvoiced) * 100 : 0} href="/paiements" icon={<Icon name="wallet" className="h-4 w-4" />} />
        <Stat label="Reste à encaisser" cents={d.outstanding} tone="sky" hint={`${d.openCount} facture(s) ouverte(s)`} href="/paiements" icon={<Icon name="clock" className="h-4 w-4" />} />
        <Stat label="En retard" cents={d.overdue} tone="red" hint={`${d.overdueCount} facture(s)`} href="/factures?statut=OVERDUE" icon={<Icon name="check" className="h-4 w-4" />} />
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <section className="card overflow-hidden">
          <div className="flex items-center justify-between px-5 pt-5 pb-3">
            <h2 className="text-sm font-semibold">Derniers devis</h2>
            <Link href="/devis" className="chip bg-mist text-muted hover:text-ink">Tout voir →</Link>
          </div>
          <ul className="stagger divide-y divide-line/70">
            {recentQuotes.map((q) => (
              <li key={q.id}>
                <Link href={`/devis/${q.id}`} className="flex items-center gap-3 px-5 py-3 text-sm transition hover:bg-mist/60">
                  <span className="min-w-0 flex-1 truncate"><b className="tabular">{quoteReference(q.reference, q.version)}</b> <span className="text-muted">· {q.client.name}</span></span>
                  <Money cents={cents(q.totalTtc)} className="text-muted" />
                  <Badge kind="quote" status={q.status} />
                </Link>
              </li>
            ))}
          </ul>
          {recentQuotes.length === 0 ? <Empty action={<Link href="/devis/nouveau" className="btn-brand">Créer un devis</Link>}>Aucun devis pour l&apos;instant.</Empty> : null}
        </section>
        <section className="card overflow-hidden">
          <div className="flex items-center justify-between px-5 pt-5 pb-3">
            <h2 className="text-sm font-semibold">Prochaines échéances</h2>
            <Link href="/paiements" className="chip bg-mist text-muted hover:text-ink">Suivi des paiements →</Link>
          </div>
          <ul className="stagger divide-y divide-line/70">
            {nextDue.map((i) => (
              <li key={i.id}>
                <Link href={`/factures/${i.id}`} className="flex items-center gap-3 px-5 py-3 text-sm transition hover:bg-mist/60">
                  <span className="min-w-0 flex-1 truncate"><b className="tabular">{i.reference}</b> <span className="text-muted">· {i.client.name}</span></span>
                  <span className={`tabular text-xs ${isOverdue(i) ? "font-semibold text-rose-600" : "text-muted"}`}>{formatDateShort(i.dueDate)}</span>
                  <Money cents={remainingDue(cents(i.netToPay), cents(i.amountPaid), cents(i.amountCredited))} className="font-semibold" />
                </Link>
              </li>
            ))}
          </ul>
          {nextDue.length === 0 ? <Empty>Aucune facture en attente de règlement.</Empty> : null}
        </section>
      </div>
    </>
  );
}
