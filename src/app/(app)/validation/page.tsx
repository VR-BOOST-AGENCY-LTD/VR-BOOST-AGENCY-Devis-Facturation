import Link from "next/link";
import { requirePermission } from "@/lib/auth";
import { db } from "@/lib/db";
import { quoteReference } from "@/lib/format";
import { cents } from "@/server/common";
import { ActionButton } from "@/components/ActionButton";
import { Empty, Money, PageHeader } from "@/components/ui";
import { INVOICE_TYPE } from "@/components/status";
import { invoiceOpAction, quoteOpAction } from "@/app/actions";

export const metadata = { title: "Validation CEO" };

export default async function ValidationPage() {
  await requirePermission("quote.approve");
  const [quotes, invoices] = await Promise.all([
    db.quote.findMany({ where: { status: "PENDING_APPROVAL" }, include: { client: true, createdBy: true }, orderBy: { submittedAt: "asc" } }),
    db.invoice.findMany({ where: { status: "PENDING_APPROVAL" }, include: { client: true, createdBy: true }, orderBy: { submittedAt: "asc" } }),
  ]);
  const when = (d: Date | null) => d?.toLocaleString("fr-MA", { dateStyle: "short", timeStyle: "short", timeZone: "Africa/Casablanca" }) ?? "";
  return (
    <>
      <PageHeader eyebrow="Pilotage" title="Validation CEO" subtitle="Approbation, numérotation définitive, cachet et signature" />
      <section className="card mb-6">
        <h2 className="border-b border-line px-5 py-4 text-sm font-semibold">Devis à approuver ({quotes.length})</h2>
        <ul className="divide-y divide-line">
          {quotes.map((q) => (
            <li key={q.id} className="flex flex-wrap items-center gap-3 px-5 py-4 text-sm">
              <div className="min-w-0 flex-1">
                <Link href={`/devis/${q.id}`} className="font-medium hover:underline">{q.client.name} — {q.title}</Link>
                <p className="text-xs text-muted">{q.number ? `${quoteReference(q.reference, q.version)} · ` : ""}Soumis par {q.createdBy.name} le {when(q.submittedAt)}</p>
              </div>
              <Money cents={cents(q.totalTtc)} className="font-semibold" />
              <Link href={`/devis/${q.id}`} className="btn-ghost">Examiner</Link>
              <ActionButton action={quoteOpAction.bind(null, q.id, "reject")} label="Renvoyer" prompt="Motif / corrections attendues" />
              <ActionButton action={quoteOpAction.bind(null, q.id, "approve")} label="Approuver" variant="brand" signatureOption confirm="Un numéro définitif de la série DEVIS sera attribué." />
            </li>
          ))}
        </ul>
        {quotes.length === 0 ? <Empty>Aucun devis en attente.</Empty> : null}
      </section>
      <section className="card">
        <h2 className="border-b border-line px-5 py-4 text-sm font-semibold">Factures et avoirs à émettre ({invoices.length})</h2>
        <ul className="divide-y divide-line">
          {invoices.map((i) => (
            <li key={i.id} className="flex flex-wrap items-center gap-3 px-5 py-4 text-sm">
              <div className="min-w-0 flex-1">
                <Link href={`/factures/${i.id}`} className="font-medium hover:underline">{INVOICE_TYPE[i.type]} · {i.client.name} — {i.title}</Link>
                <p className="text-xs text-muted">Soumise par {i.createdBy.name} le {when(i.submittedAt)}</p>
              </div>
              <Money cents={cents(i.netToPay)} className="font-semibold" />
              <Link href={`/factures/${i.id}`} className="btn-ghost">Examiner</Link>
              <ActionButton action={invoiceOpAction.bind(null, i.id, "reject")} label="Renvoyer" prompt="Motif / corrections attendues" />
              <ActionButton action={invoiceOpAction.bind(null, i.id, "approve")} label="Approuver et émettre" variant="brand" signatureOption confirm="Un numéro définitif de la série FACTURES sera attribué ; la facture deviendra non modifiable." />
            </li>
          ))}
        </ul>
        {invoices.length === 0 ? <Empty>Aucune facture en attente.</Empty> : null}
      </section>
    </>
  );
}
