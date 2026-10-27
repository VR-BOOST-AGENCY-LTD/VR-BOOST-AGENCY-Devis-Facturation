import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { remainingDue } from "@/lib/calc";
import { db } from "@/lib/db";
import { formatDateLong, formatDateShort, formatPercent, quoteReference } from "@/lib/format";
import { can } from "@/lib/permissions";
import { getSettings, isProduction } from "@/lib/settings";
import { breakdownOf, cents } from "@/server/common";
import { isOverdue } from "@/server/invoices";
import type { Deduction } from "@/lib/calc";
import { ActionButton } from "@/components/ActionButton";
import { PaymentForm } from "@/components/PaymentForm";
import { PdfPreview } from "@/components/PdfPreview";
import { Timeline } from "@/components/Timeline";
import { Badge, Money, Notice, PageHeader } from "@/components/ui";
import { INVOICE_TYPE, PAYMENT_METHOD } from "@/components/status";
import { cancelPaymentAction, hubspotSyncDocAction, invoiceOpAction, recordPaymentAction } from "@/app/actions";

export default async function InvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const inv = await db.invoice.findUnique({
    where: { id },
    include: {
      client: true,
      quote: { select: { id: true, reference: true, version: true } },
      relatedInvoice: { select: { id: true, reference: true, type: true } },
      relatedFrom: { select: { id: true, reference: true, type: true, status: true, isRectification: true } },
      payments: { orderBy: { date: "asc" }, include: { recordedBy: { select: { name: true } } } },
      createdBy: { select: { name: true } },
      approvedBy: { select: { name: true } },
    },
  });
  if (!inv) notFound();
  const settings = await getSettings();
  const op = (name: string) => invoiceOpAction.bind(null, inv.id, name);
  const isCeo = can(user, "invoice.approveAndIssue");
  const issued = inv.number != null;
  const isCredit = inv.type === "CREDIT_NOTE";
  const net = cents(inv.netToPay);
  const paid = cents(inv.amountPaid);
  const credited = cents(inv.amountCredited);
  const due = remainingDue(net, paid, credited);
  const overdue = isOverdue(inv);
  const deductions = (inv.deductions as Deduction[] | null) ?? [];
  const label = INVOICE_TYPE[inv.type];
  const canEdit = ["DRAFT", "PENDING_APPROVAL"].includes(inv.status) && (isCeo || (inv.createdById === user.id && !isCredit));

  return (
    <>
      <PageHeader
        title={`${label} ${inv.reference ?? "(brouillon)"}`}
        subtitle={<span className="flex flex-wrap items-center gap-2"><Badge kind="invoice" status={overdue ? "OVERDUE" : inv.status} /> {inv.client.name} · créée par {inv.createdBy.name}</span>}
        actions={
          <>
            {canEdit ? <Link href={`/factures/${inv.id}/modifier`} className="btn-ghost">Modifier</Link> : null}
            {inv.status === "DRAFT" ? <ActionButton action={op("submit")} label="Soumettre au CEO" variant="brand" confirm="La facture sera transmise au CEO pour approbation et émission." /> : null}
            {inv.status === "PENDING_APPROVAL" && isCeo ? (
              <>
                <ActionButton action={op("reject")} label="Renvoyer en brouillon" prompt="Motif / corrections attendues" />
                <ActionButton action={op("approve")} label="Approuver et émettre" variant="brand" signatureOption
                  confirm="Le prochain numéro de la série FACTURES sera attribué définitivement. La facture deviendra non modifiable." />
              </>
            ) : null}
            {inv.status === "DRAFT" && !issued ? <ActionButton action={op("delete")} label="Supprimer" variant="danger" confirm="Supprimer ce brouillon ?" goTo="/factures" /> : null}
            {issued && !isCredit && inv.status !== "CANCELLED" && can(user, "invoice.creditNote") ? (
              <>
                <ActionButton action={op("creditFull")} label="Créer un avoir" goTo="/factures/" prompt="Motif de l'avoir"
                  confirm="Un avoir total est créé en brouillon ; réduisez ses lignes pour un avoir partiel, puis approuvez-le." />
                <ActionButton action={op("rectify")} label="Facture rectificative" goTo="/factures/" prompt="Motif de la rectification"
                  confirm="Crée un avoir total (brouillon) et une nouvelle facture corrigeable. La rectificative ne pourra être émise qu'après l'avoir." />
              </>
            ) : null}
          </>
        }
      />

      <div className="mb-6 space-y-3">
        {inv.rejectionComment && inv.status === "DRAFT" ? <Notice tone="red"><b>Renvoyée par le CEO :</b> {inv.rejectionComment}</Notice> : null}
        {inv.status === "PENDING_APPROVAL" && isCeo && isProduction() && !settings.accountantValidatedAt ? (
          <Notice tone="red">Émission bloquée en production tant que le comptable n&apos;a pas validé les modèles (Paramètres).</Notice>
        ) : null}
        {overdue ? <Notice tone="red">Échéance dépassée depuis le {formatDateLong(inv.dueDate)} — reste dû <Money cents={due} />.</Notice> : null}
        {inv.reason ? <Notice tone="sky">{inv.reason}</Notice> : null}
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr_360px]">
        <PdfPreview src={`/api/pdf/invoice/${inv.id}`} title={issued ? "PDF officiel archivé" : "Aperçu (brouillon filigrané)"} />
        <div className="space-y-6">
          <section className="card p-5 text-sm">
            <h2 className="mb-3 font-semibold">Montants</h2>
            <dl className="space-y-2">
              <div className="flex justify-between"><dt className="text-muted">Total HT</dt><dd><Money cents={cents(inv.totalHt)} /></dd></div>
              {breakdownOf(inv.vatBreakdown).map((g) => (
                <div key={g.rate} className="flex justify-between"><dt className="text-muted">TVA {formatPercent(g.rate)}</dt><dd><Money cents={g.vat} /></dd></div>
              ))}
              <div className="flex justify-between font-semibold"><dt>Total TTC</dt><dd><Money cents={cents(inv.totalTtc)} /></dd></div>
              {deductions.map((d) => (
                <div key={d.invoiceId} className="flex justify-between text-muted"><dt>Acompte {d.reference}</dt><dd>-<Money cents={d.ttc} /></dd></div>
              ))}
              {deductions.length ? <div className="flex justify-between font-semibold"><dt>Net à payer</dt><dd><Money cents={net} /></dd></div> : null}
              {!isCredit && issued ? (
                <>
                  <div className="flex justify-between border-t border-line pt-2"><dt className="text-muted">Encaissé</dt><dd><Money cents={paid} /></dd></div>
                  {credited ? <div className="flex justify-between"><dt className="text-muted">Avoirs</dt><dd>-<Money cents={credited} /></dd></div> : null}
                  <div className="flex justify-between text-base font-semibold"><dt>Reste à payer</dt><dd><Money cents={due} className={due > 0 ? "text-brand" : "text-emerald-700"} /></dd></div>
                </>
              ) : null}
              <div className="flex justify-between border-t border-line pt-2"><dt className="text-muted">Émise le</dt><dd>{formatDateLong(inv.issueDate)}</dd></div>
              {!isCredit ? <div className="flex justify-between"><dt className="text-muted">Échéance</dt><dd>{formatDateLong(inv.dueDate)}</dd></div> : null}
              {inv.approvedBy ? <div className="flex justify-between"><dt className="text-muted">Approuvée par</dt><dd>{inv.approvedBy.name}{inv.signed ? " (signée)" : ""}</dd></div> : null}
            </dl>
          </section>

          {(inv.quote || inv.relatedInvoice || inv.relatedFrom.length > 0) ? (
            <section className="card space-y-2 p-5 text-sm">
              <h2 className="mb-1 font-semibold">Documents liés</h2>
              {inv.quote ? <p>Devis : <Link className="underline" href={`/devis/${inv.quote.id}`}>{quoteReference(inv.quote.reference, inv.quote.version)}</Link></p> : null}
              {inv.relatedInvoice ? <p>{isCredit ? "Facture créditée" : "Rectifie"} : <Link className="underline" href={`/factures/${inv.relatedInvoice.id}`}>{inv.relatedInvoice.reference}</Link></p> : null}
              {inv.relatedFrom.map((r) => (
                <p key={r.id} className="flex items-center justify-between gap-2">
                  <Link className="underline" href={`/factures/${r.id}`}>{r.isRectification ? "Rectificative" : INVOICE_TYPE[r.type]} {r.reference ?? "(brouillon)"}</Link>
                  <Badge kind="invoice" status={r.status} />
                </p>
              ))}
            </section>
          ) : null}

          {!isCredit && issued ? (
            <section className="card p-5 text-sm">
              <h2 className="mb-3 font-semibold">Paiements</h2>
              <ul className="mb-4 space-y-2">
                {inv.payments.map((p) => (
                  <li key={p.id} className={`flex flex-wrap items-center justify-between gap-2 ${p.cancelledAt ? "text-muted line-through" : ""}`}>
                    <span>{formatDateShort(p.date)} · {PAYMENT_METHOD[p.method]}{p.reference ? ` · ${p.reference}` : ""}</span>
                    <span className="flex items-center gap-2">
                      <Money cents={cents(p.amount)} />
                      {!p.cancelledAt && can(user, "payment.cancel") ? (
                        <ActionButton action={async (x) => { "use server"; return cancelPaymentAction(p.id, x.comment ?? ""); }} label="Annuler" variant="danger" prompt="Motif d'annulation du paiement" />
                      ) : null}
                    </span>
                  </li>
                ))}
                {inv.payments.length === 0 ? <li className="text-muted">Aucun paiement enregistré.</li> : null}
              </ul>
              {can(user, "payment.record") && ["ISSUED", "PARTIALLY_PAID"].includes(inv.status) && due > 0 ? (
                <PaymentForm invoiceId={inv.id} remainingCents={due} record={recordPaymentAction} />
              ) : null}
            </section>
          ) : null}

          {inv.client.hubspotCompanyId && issued ? (
            <div className="flex"><ActionButton action={hubspotSyncDocAction.bind(null, "INVOICE", inv.id)} label="Tracer dans HubSpot" /></div>
          ) : null}
          <Timeline entityType="INVOICE" ids={[inv.id]} />
        </div>
      </div>
    </>
  );
}
