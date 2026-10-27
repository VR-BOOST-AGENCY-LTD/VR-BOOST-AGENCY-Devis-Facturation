import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { remainingDue } from "@/lib/calc";
import { db } from "@/lib/db";
import { formatDateShort, formatReference, quoteReference } from "@/lib/format";
import { can } from "@/lib/permissions";
import { getSettings, isProduction } from "@/lib/settings";
import { cents } from "@/server/common";
import { isOverdue } from "@/server/invoices";
import { Badge, Money, Notice, PageHeader, Stat } from "@/components/ui";

export const metadata = { title: "Tableau de bord" };

export default async function Dashboard({ searchParams }: { searchParams: Promise<{ refus?: string }> }) {
  const user = await requireUser();
  const { refus } = await searchParams;
  const year = new Date().getFullYear();
  const yearStart = new Date(Date.UTC(year, 0, 1));
  const [settings, sequences, openInvoices, quotesPending, invoicesPending, recentQuotes, recentInvoices, issuedYear, paidYear, quotesOpen] =
    await Promise.all([
      getSettings(),
      db.sequence.findMany({ where: { year } }),
      db.invoice.findMany({
        where: { status: { in: ["ISSUED", "PARTIALLY_PAID"] }, type: { not: "CREDIT_NOTE" } },
        include: { client: { select: { name: true } } },
        orderBy: { dueDate: "asc" },
      }),
      db.quote.count({ where: { status: "PENDING_APPROVAL" } }),
      db.invoice.count({ where: { status: "PENDING_APPROVAL" } }),
      db.quote.findMany({ orderBy: { updatedAt: "desc" }, take: 6, include: { client: { select: { name: true } } }, where: { status: { not: "SUPERSEDED" } } }),
      db.invoice.findMany({ orderBy: { updatedAt: "desc" }, take: 6, include: { client: { select: { name: true } } } }),
      db.invoice.findMany({ where: { issueDate: { gte: yearStart }, number: { not: null } }, select: { type: true, totalHt: true, totalTtc: true, deductedTtc: true } }),
      db.payment.aggregate({ _sum: { amount: true }, where: { cancelledAt: null, date: { gte: yearStart } } }),
      db.quote.findMany({ where: { status: { in: ["APPROVED", "SENT"] } }, select: { totalTtc: true } }),
    ]);

  const outstanding = openInvoices.reduce((s, i) => s + remainingDue(cents(i.netToPay), cents(i.amountPaid), cents(i.amountCredited)), 0);
  const overdue = openInvoices.filter((i) => isOverdue(i));
  const overdueAmount = overdue.reduce((s, i) => s + remainingDue(cents(i.netToPay), cents(i.amountPaid), cents(i.amountCredited)), 0);
  // CA HT facturé : factures (acomptes inclus) − avoirs ; le solde ne recompte pas les acomptes (déduits HT).
  const revenueHt = issuedYear.reduce((s, i) => {
    const sign = i.type === "CREDIT_NOTE" ? -1 : 1;
    const ht = cents(i.totalHt);
    const ratio = cents(i.totalTtc) ? (cents(i.totalTtc) - cents(i.deductedTtc)) / cents(i.totalTtc) : 1;
    return s + sign * Math.round(ht * ratio);
  }, 0);
  const pipeline = quotesOpen.reduce((s, q) => s + cents(q.totalTtc), 0);
  const unconfirmed = sequences.filter((s) => !s.confirmedAt);

  return (
    <>
      <PageHeader title={`Bonjour ${user.name.split(" ")[0]}`} subtitle="Vue d'ensemble des devis, factures et règlements" actions={
        <>
          <Link href="/devis/nouveau" className="btn-brand">+ Nouveau devis</Link>
          <Link href="/factures/nouveau" className="btn-ghost">+ Facture</Link>
        </>
      } />
      <div className="mb-6 space-y-3">
        {refus ? <Notice tone="red">Accès refusé : cette section est réservée au CEO.</Notice> : null}
        {unconfirmed.length > 0 || sequences.length < 2 ? (
          <Notice>
            <b>Numérotation à confirmer avant toute émission.</b> Derniers numéros pré-configurés : {sequences.map((s) => `${s.series === "QUOTE" ? "DEVIS" : "FACTURES"} ${formatReference(s.lastNumber, s.year)}`).join(" · ") || "aucun"}.
            {can(user, "sequence.edit") ? <> <Link href="/parametres#numerotation" className="underline">Confirmer maintenant</Link></> : " Le CEO doit les confirmer."}
          </Notice>
        ) : null}
        {!settings.accountantValidatedAt ? (
          <Notice tone={isProduction() ? "red" : "amber"}>
            Modèles et traitements fiscaux <b>non encore validés par le comptable</b>{isProduction() ? " : émission des factures bloquée." : " (requis avant la mise en production)."}
          </Notice>
        ) : null}
      </div>

      <div className="mb-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label={`CA HT facturé ${year}`} value={<Money cents={revenueHt} />} hint="Net des avoirs, acomptes comptés une fois" />
        <Stat label="Encaissé cette année" value={<Money cents={cents(paidYear._sum.amount)} />} tone="sky" href="/paiements" />
        <Stat label="Reste à encaisser" value={<Money cents={outstanding} />} hint={`${openInvoices.length} facture(s) ouverte(s)`} tone="brand" href="/paiements" />
        <Stat label="En retard" value={<Money cents={overdueAmount} />} hint={`${overdue.length} facture(s)`} tone="red" href="/factures?statut=OVERDUE" />
        {can(user, "quote.approve") ? (
          <Stat label="À valider (CEO)" value={quotesPending + invoicesPending} hint={`${quotesPending} devis · ${invoicesPending} facture(s)`} href="/validation" />
        ) : (
          <Stat label="En attente du CEO" value={quotesPending + invoicesPending} hint="Documents soumis" />
        )}
        <Stat label="Devis en cours (TTC)" value={<Money cents={pipeline} />} hint={`${quotesOpen.length} approuvé(s) / envoyé(s)`} href="/devis?statut=SENT" />
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <section className="card">
          <div className="flex items-center justify-between border-b border-line px-5 py-4"><h2 className="text-sm font-semibold">Derniers devis</h2><Link href="/devis" className="text-xs text-muted hover:underline">Tout voir</Link></div>
          <ul className="divide-y divide-line">
            {recentQuotes.map((q) => (
              <li key={q.id} className="flex items-center justify-between gap-3 px-5 py-3 text-sm">
                <Link href={`/devis/${q.id}`} className="min-w-0 flex-1 truncate hover:underline"><b>{quoteReference(q.reference, q.version)}</b> · {q.client.name}</Link>
                <Money cents={cents(q.totalTtc)} className="text-muted" />
                <Badge kind="quote" status={q.status} />
              </li>
            ))}
            {recentQuotes.length === 0 ? <li className="px-5 py-6 text-sm text-muted">Aucun devis pour l&apos;instant.</li> : null}
          </ul>
        </section>
        <section className="card">
          <div className="flex items-center justify-between border-b border-line px-5 py-4"><h2 className="text-sm font-semibold">Échéances ouvertes</h2><Link href="/paiements" className="text-xs text-muted hover:underline">Suivi des paiements</Link></div>
          <ul className="divide-y divide-line">
            {openInvoices.slice(0, 6).map((i) => (
              <li key={i.id} className="flex items-center justify-between gap-3 px-5 py-3 text-sm">
                <Link href={`/factures/${i.id}`} className="min-w-0 flex-1 truncate hover:underline"><b>{i.reference}</b> · {i.client.name}</Link>
                <span className={isOverdue(i) ? "text-red-600" : "text-muted"}>{formatDateShort(i.dueDate)}</span>
                <Money cents={remainingDue(cents(i.netToPay), cents(i.amountPaid), cents(i.amountCredited))} />
              </li>
            ))}
            {openInvoices.length === 0 ? <li className="px-5 py-6 text-sm text-muted">Aucune facture en attente de règlement.</li> : null}
          </ul>
        </section>
        <section className="card xl:col-span-2">
          <div className="flex items-center justify-between border-b border-line px-5 py-4"><h2 className="text-sm font-semibold">Dernières factures</h2><Link href="/factures" className="text-xs text-muted hover:underline">Tout voir</Link></div>
          <ul className="divide-y divide-line">
            {recentInvoices.map((i) => (
              <li key={i.id} className="flex items-center justify-between gap-3 px-5 py-3 text-sm">
                <Link href={`/factures/${i.id}`} className="min-w-0 flex-1 truncate hover:underline"><b>{i.reference ?? "Brouillon"}</b> · {i.client.name} · <span className="text-muted">{i.title}</span></Link>
                <Money cents={cents(i.netToPay)} className="text-muted" />
                <Badge kind="invoice" status={isOverdue(i) ? "OVERDUE" : i.status} />
              </li>
            ))}
            {recentInvoices.length === 0 ? <li className="px-5 py-6 text-sm text-muted">Aucune facture pour l&apos;instant.</li> : null}
          </ul>
        </section>
      </div>
    </>
  );
}
