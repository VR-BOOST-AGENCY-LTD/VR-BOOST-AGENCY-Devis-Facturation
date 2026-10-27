import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { remainingDue } from "@/lib/calc";
import { db } from "@/lib/db";
import { formatDateShort } from "@/lib/format";
import { cents } from "@/server/common";
import { isOverdue } from "@/server/invoices";
import { Badge, Empty, Money, PageHeader } from "@/components/ui";
import { INVOICE_STATUS, INVOICE_TYPE } from "@/components/status";
import { RowActions, RowLink } from "@/components/RowLink";

export const metadata = { title: "Factures" };

export default async function InvoicesPage({ searchParams }: { searchParams: Promise<{ statut?: string; type?: string; q?: string }> }) {
  await requireUser();
  const { statut, type, q } = await searchParams;
  const list = await db.invoice.findMany({
    where: {
      ...(statut && statut !== "OVERDUE" ? { status: statut as never } : {}),
      ...(statut === "OVERDUE" ? { status: { in: ["ISSUED", "PARTIALLY_PAID"] }, dueDate: { lt: new Date() } } : {}),
      ...(type ? { type: type as never } : {}),
      ...(q ? { OR: [{ title: { contains: q, mode: "insensitive" } }, { reference: { contains: q } }, { client: { name: { contains: q, mode: "insensitive" } } }] } : {}),
    },
    include: { client: { select: { name: true } } },
    orderBy: [{ updatedAt: "desc" }],
    take: 300,
  });
  const filters = ["DRAFT", "PENDING_APPROVAL", "ISSUED", "PARTIALLY_PAID", "PAID", "OVERDUE", "CANCELLED"];
  return (
    <>
      <PageHeader title="Factures" subtitle={`${list.length} document(s)`} actions={<Link href="/factures/nouveau" className="btn-brand">+ Facture manuelle</Link>} />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Link href="/factures" className={`rounded-full px-3 py-1 text-xs ${!statut && !type ? "bg-ink text-white" : "bg-white ring-1 ring-line"}`}>Toutes</Link>
        {filters.map((f) => (
          <Link key={f} href={`/factures?statut=${f}`} className={`rounded-full px-3 py-1 text-xs ${statut === f ? "bg-ink text-white" : "bg-white ring-1 ring-line"}`}>{INVOICE_STATUS[f].label}</Link>
        ))}
        <Link href="/factures?type=CREDIT_NOTE" className={`rounded-full px-3 py-1 text-xs ${type === "CREDIT_NOTE" ? "bg-ink text-white" : "bg-white ring-1 ring-line"}`}>Avoirs</Link>
        <form className="ml-auto"><input name="q" defaultValue={q} placeholder="Rechercher…" className="input w-56" /></form>
      </div>
      <div className="card overflow-x-auto">
        <table className="w-full min-w-[1000px]">
          <thead className="border-b border-line bg-mist/50"><tr>
            <th className="th">Référence</th><th className="th">Type</th><th className="th">Client</th><th className="th">Émise</th>
            <th className="th">Échéance</th><th className="th text-right">Net à payer</th><th className="th text-right">Reste dû</th><th className="th">Statut</th><th className="th text-right">Actions</th>
          </tr></thead>
          <tbody className="divide-y divide-line">
            {list.map((i) => (
              <RowLink key={i.id} href={`/factures/${i.id}`}>
                <td className="td font-medium"><Link href={`/factures/${i.id}`} className="hover:underline">{i.reference ?? "Brouillon"}</Link></td>
                <td className="td text-muted">{INVOICE_TYPE[i.type]}</td>
                <td className="td">{i.client.name}</td>
                <td className="td text-muted">{formatDateShort(i.issueDate)}</td>
                <td className="td text-muted">{formatDateShort(i.dueDate)}</td>
                <td className="td text-right"><Money cents={cents(i.netToPay) * (i.type === "CREDIT_NOTE" ? -1 : 1)} /></td>
                <td className="td text-right">{i.number && i.type !== "CREDIT_NOTE" ? <Money cents={remainingDue(cents(i.netToPay), cents(i.amountPaid), cents(i.amountCredited))} /> : "—"}</td>
                <td className="td"><Badge kind="invoice" status={isOverdue(i) ? "OVERDUE" : i.status} /></td>
                <td className="td"><RowActions href={`/factures/${i.id}`} pdf={`/api/pdf/invoice/${i.id}`} /></td>
              </RowLink>
            ))}
          </tbody>
        </table>
        {list.length === 0 ? <Empty>Aucune facture.</Empty> : null}
      </div>
    </>
  );
}
