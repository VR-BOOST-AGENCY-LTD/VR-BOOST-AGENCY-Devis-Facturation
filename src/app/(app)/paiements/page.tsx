import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { remainingDue } from "@/lib/calc";
import { db } from "@/lib/db";
import { formatDateShort } from "@/lib/format";
import { cents } from "@/server/common";
import { isOverdue } from "@/server/invoices";
import { Badge, Empty, Money, PageHeader } from "@/components/ui";
import { INVOICE_TYPE, PAYMENT_METHOD } from "@/components/status";

export const metadata = { title: "Paiements" };

export default async function PaymentsPage() {
  await requireUser();
  const [open, payments] = await Promise.all([
    db.invoice.findMany({
      where: { status: { in: ["ISSUED", "PARTIALLY_PAID"] }, type: { not: "CREDIT_NOTE" } },
      include: { client: { select: { name: true } } },
      orderBy: { dueDate: "asc" },
    }),
    db.payment.findMany({ include: { invoice: { select: { id: true, reference: true, client: { select: { name: true } } } }, recordedBy: { select: { name: true } } }, orderBy: { date: "desc" }, take: 100 }),
  ]);
  const total = open.reduce((s, i) => s + remainingDue(cents(i.netToPay), cents(i.amountPaid), cents(i.amountCredited)), 0);
  return (
    <>
      <PageHeader eyebrow="Ventes" title="Suivi des paiements" subtitle={<>Reste à encaisser : <Money cents={total} className="font-semibold text-ink" /></>} />
      <section className="card mb-6 overflow-x-auto">
        <h2 className="border-b border-line px-5 py-4 text-sm font-semibold">Factures ouvertes</h2>
        <table className="w-full min-w-[760px]">
          <thead className="border-b border-line/80"><tr>
            <th className="th">Facture</th><th className="th">Client</th><th className="th">Échéance</th>
            <th className="th text-right">Net à payer</th><th className="th text-right">Encaissé</th><th className="th text-right">Reste</th><th className="th">Statut</th>
          </tr></thead>
          <tbody className="stagger divide-y divide-line/70">
            {open.map((i) => (
              <tr key={i.id}>
                <td className="td font-medium"><Link className="hover:underline" href={`/factures/${i.id}`}>{INVOICE_TYPE[i.type]} {i.reference}</Link></td>
                <td className="td">{i.client.name}</td>
                <td className={`td ${isOverdue(i) ? "font-medium text-red-600" : "text-muted"}`}>{formatDateShort(i.dueDate)}</td>
                <td className="td text-right"><Money cents={cents(i.netToPay)} /></td>
                <td className="td text-right"><Money cents={cents(i.amountPaid)} /></td>
                <td className="td text-right font-semibold"><Money cents={remainingDue(cents(i.netToPay), cents(i.amountPaid), cents(i.amountCredited))} /></td>
                <td className="td"><Badge kind="invoice" status={isOverdue(i) ? "OVERDUE" : i.status} /></td>
              </tr>
            ))}
          </tbody>
        </table>
        {open.length === 0 ? <Empty>Toutes les factures émises sont soldées.</Empty> : null}
      </section>
      <section className="card overflow-x-auto">
        <h2 className="border-b border-line px-5 py-4 text-sm font-semibold">Derniers règlements</h2>
        <table className="w-full min-w-[700px]">
          <thead className="border-b border-line/80"><tr><th className="th">Date</th><th className="th">Facture</th><th className="th">Client</th><th className="th">Mode</th><th className="th">Saisi par</th><th className="th text-right">Montant</th></tr></thead>
          <tbody className="stagger divide-y divide-line/70">
            {payments.map((p) => (
              <tr key={p.id} className={p.cancelledAt ? "text-muted line-through" : ""}>
                <td className="td">{formatDateShort(p.date)}</td>
                <td className="td"><Link className="hover:underline" href={`/factures/${p.invoice.id}`}>{p.invoice.reference}</Link></td>
                <td className="td">{p.invoice.client.name}</td>
                <td className="td">{PAYMENT_METHOD[p.method]}{p.reference ? ` · ${p.reference}` : ""}</td>
                <td className="td text-muted">{p.recordedBy.name}</td>
                <td className="td text-right"><Money cents={cents(p.amount)} /></td>
              </tr>
            ))}
          </tbody>
        </table>
        {payments.length === 0 ? <Empty>Aucun règlement.</Empty> : null}
      </section>
    </>
  );
}
