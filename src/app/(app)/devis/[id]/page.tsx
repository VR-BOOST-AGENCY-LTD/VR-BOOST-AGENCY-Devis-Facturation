import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatDateLong, formatPercent, quoteReference } from "@/lib/format";
import { can } from "@/lib/permissions";
import { breakdownOf, cents, num } from "@/server/common";
import { isQuoteExpired } from "@/server/quotes";
import { ActionButton } from "@/components/ActionButton";
import { PdfPreview } from "@/components/PdfPreview";
import { Timeline } from "@/components/Timeline";
import { Badge, Money, Notice, PageHeader } from "@/components/ui";
import { INVOICE_TYPE } from "@/components/status";
import { draftEmailAction, hubspotSyncDocAction, invoiceFromQuoteAction, quoteOpAction, sendEmailAction } from "@/app/actions";
import { SendEmailButton } from "@/components/SendEmailButton";
import { mailEnabled } from "@/server/mailer";

export default async function QuotePage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const q = await db.quote.findUnique({
    where: { id },
    include: {
      client: true,
      createdBy: { select: { name: true } },
      approvedBy: { select: { name: true } },
      invoices: { orderBy: { createdAt: "asc" } },
      nextVersion: { select: { id: true, version: true, status: true } },
    },
  });
  if (!q) notFound();
  const versions = await db.quote.findMany({
    where: { OR: [{ id: q.rootId ?? q.id }, { rootId: q.rootId ?? q.id }] },
    select: { id: true, version: true, status: true },
    orderBy: { version: "asc" },
  });
  const op = (name: string) => quoteOpAction.bind(null, q.id, name);
  const isCeo = can(user, "quote.approve");
  const activeInvoices = q.invoices.filter((i) => i.status !== "CANCELLED" && i.type !== "CREDIT_NOTE");
  const hasDeposit = activeInvoices.some((i) => i.type === "DEPOSIT");
  const hasClosing = activeInvoices.some((i) => i.type === "BALANCE" || i.type === "STANDARD");
  const expired = isQuoteExpired(q);
  const depositPct = num(q.depositPercent);

  return (
    <>
      <PageHeader
        title={`Devis ${quoteReference(q.reference, q.version)}`}
        subtitle={<span className="flex flex-wrap items-center gap-2"><Badge kind="quote" status={expired ? "EXPIRED" : q.status} /> {q.client.name} · créé par {q.createdBy.name}</span>}
        actions={
          <>
            {["DRAFT", "PENDING_APPROVAL"].includes(q.status) && (isCeo || q.createdById === user.id) ? (
              <Link href={`/devis/${q.id}/modifier`} className="btn-ghost">Modifier</Link>
            ) : null}
            {q.status === "DRAFT" ? <ActionButton action={op("submit")} label="Soumettre au CEO" variant="brand" confirm="Le devis sera transmis au CEO pour validation." /> : null}
            {q.status === "PENDING_APPROVAL" && isCeo ? (
              <>
                <ActionButton action={op("reject")} label="Renvoyer en brouillon" prompt="Motif / corrections attendues" />
                <ActionButton action={op("approve")} label="Approuver le devis" variant="brand" signatureOption
                  confirm={q.number ? `Nouvelle version V${q.version} du devis ${q.reference}.` : "Le prochain numéro de la série DEVIS sera attribué définitivement."} />
              </>
            ) : null}
            {["APPROVED", "SENT", "ACCEPTED"].includes(q.status) && can(user, "document.send") ? (
              <SendEmailButton enabled={mailEnabled()} draft={draftEmailAction.bind(null, "QUOTE", q.id)} send={sendEmailAction.bind(null, "QUOTE", q.id)} />
            ) : null}
            {q.status === "APPROVED" ? <ActionButton action={op("sent")} label="Marquer envoyé" /> : null}
            {["APPROVED", "SENT"].includes(q.status) ? (
              <>
                <ActionButton action={op("refused")} label="Refusé" variant="danger" confirm="Marquer ce devis comme refusé par le client ?" />
                <ActionButton action={op("accepted")} label="Accepté par le client" variant="primary" confirm="Le devis pourra ensuite être facturé." />
              </>
            ) : null}
            {["APPROVED", "SENT", "ACCEPTED", "REFUSED"].includes(q.status) && !q.nextVersion && activeInvoices.length === 0 ? (
              <ActionButton action={op("revise")} label="Nouvelle version" goTo="/devis/" confirm="Une nouvelle version (même numéro) sera créée en brouillon et devra être revalidée par le CEO." />
            ) : null}
            {q.status === "DRAFT" && q.number == null ? (
              <ActionButton action={op("delete")} label="Supprimer" variant="danger" confirm="Supprimer définitivement ce brouillon ?" goTo="/devis" />
            ) : null}
            {isCeo && !["CANCELLED", "SUPERSEDED"].includes(q.status) && q.number != null && activeInvoices.length === 0 ? (
              <ActionButton action={op("cancel")} label="Annuler" variant="danger" prompt="Motif d'annulation" />
            ) : null}
          </>
        }
      />

      <div className="mb-6 space-y-3">
        {q.rejectionComment && q.status === "DRAFT" ? <Notice tone="red"><b>Renvoyé par le CEO :</b> {q.rejectionComment}</Notice> : null}
        {q.nextVersion ? <Notice tone="sky">Une version plus récente existe : <Link className="underline" href={`/devis/${q.nextVersion.id}`}>V{q.nextVersion.version}</Link>.</Notice> : null}
        {expired ? <Notice>Validité dépassée depuis le {formatDateLong(q.validUntil)} : créez une nouvelle version pour actualiser.</Notice> : null}
        {q.status === "ACCEPTED" && can(user, "invoice.create") ? (
          <div className="card flex flex-wrap items-center gap-2 p-4">
            <span className="mr-2 text-sm font-semibold">Facturer ce devis :</span>
            {!hasClosing ? (
              <ActionButton action={invoiceFromQuoteAction.bind(null, q.id, "DEPOSIT", { percent: depositPct })}
                label={`Facture d'acompte ${formatPercent(depositPct)}`} variant="brand" goTo="/factures/" />
            ) : null}
            {hasDeposit && !hasClosing ? (
              <ActionButton action={invoiceFromQuoteAction.bind(null, q.id, "BALANCE", {})} label="Facture de solde" variant="primary" goTo="/factures/"
                confirm="Le solde reprend toutes les prestations et déduit les acomptes émis (sans double comptage)." />
            ) : null}
            {!hasDeposit && !hasClosing ? (
              <ActionButton action={invoiceFromQuoteAction.bind(null, q.id, "STANDARD", {})} label="Facture définitive (100 %)" goTo="/factures/" />
            ) : null}
            {hasClosing ? <span className="text-sm text-muted">Devis entièrement facturé.</span> : null}
          </div>
        ) : null}
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr_360px]">
        <PdfPreview src={`/api/pdf/quote/${q.id}`} title={q.number && !["DRAFT", "PENDING_APPROVAL"].includes(q.status) ? "PDF officiel archivé" : "Aperçu (brouillon filigrané)"} />
        <div className="space-y-6">
          <section className="card p-5 text-sm">
            <h2 className="mb-3 font-semibold">Récapitulatif</h2>
            <dl className="space-y-2">
              <div className="flex justify-between"><dt className="text-muted">Total HT</dt><dd><Money cents={cents(q.totalHt)} /></dd></div>
              {breakdownOf(q.vatBreakdown).map((g) => (
                <div key={g.rate} className="flex justify-between"><dt className="text-muted">TVA {formatPercent(g.rate)}</dt><dd><Money cents={g.vat} /></dd></div>
              ))}
              <div className="flex justify-between border-t border-line pt-2 font-semibold"><dt>Total TTC</dt><dd><Money cents={cents(q.totalTtc)} /></dd></div>
              <div className="flex justify-between"><dt className="text-muted">Acompte {formatPercent(depositPct)}</dt><dd><Money cents={Math.round((cents(q.totalTtc) * depositPct) / 100)} /></dd></div>
              <div className="flex justify-between"><dt className="text-muted">Émis le</dt><dd>{formatDateLong(q.issueDate)}</dd></div>
              <div className="flex justify-between"><dt className="text-muted">Valable jusqu&apos;au</dt><dd>{formatDateLong(q.validUntil)}</dd></div>
              {q.approvedBy ? <div className="flex justify-between"><dt className="text-muted">Approuvé par</dt><dd>{q.approvedBy.name}{q.signed ? " (signé)" : ""}</dd></div> : null}
            </dl>
          </section>
          {versions.length > 1 ? (
            <section className="card p-5 text-sm">
              <h2 className="mb-3 font-semibold">Versions</h2>
              <ul className="space-y-2">
                {versions.map((v) => (
                  <li key={v.id} className="flex items-center justify-between">
                    <Link href={`/devis/${v.id}`} className={v.id === q.id ? "font-semibold" : "hover:underline"}>V{v.version}</Link>
                    <Badge kind="quote" status={v.status} />
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
          {q.invoices.length > 0 ? (
            <section className="card p-5 text-sm">
              <h2 className="mb-3 font-semibold">Factures liées</h2>
              <ul className="space-y-2">
                {q.invoices.map((i) => (
                  <li key={i.id} className="flex items-center justify-between gap-2">
                    <Link href={`/factures/${i.id}`} className="hover:underline">{INVOICE_TYPE[i.type]} {i.reference ?? "(brouillon)"}</Link>
                    <Badge kind="invoice" status={i.status} />
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
          {q.client.hubspotCompanyId && q.number ? (
            <div className="flex"><ActionButton action={hubspotSyncDocAction.bind(null, "QUOTE", q.id)} label="Tracer dans HubSpot" /></div>
          ) : null}
          <Timeline entityType="QUOTE" ids={versions.map((v) => v.id)} />
        </div>
      </div>
    </>
  );
}
