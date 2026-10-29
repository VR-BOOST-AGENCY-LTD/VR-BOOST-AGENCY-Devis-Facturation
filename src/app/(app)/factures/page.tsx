import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { remainingDue } from "@/lib/calc";
import { db } from "@/lib/db";
import { formatDateShort } from "@/lib/format";
import { cents } from "@/server/common";
import { isOverdue } from "@/server/invoices";
import { Badge, Empty, Money, PageHeader, Segmented } from "@/components/ui";
import { SearchBox } from "@/components/SearchBox";
import { INVOICE_STATUS, INVOICE_TYPE } from "@/components/status";
import { RowActions, RowLink } from "@/components/RowLink";

export const metadata = { title: "Factures" };

export default async function InvoicesPage({ searchParams }: { searchParams: Promise<{ statut?: string; type?: string; q?: string }> }) {
  await requireUser();
  const { statut, type, q } = await searchParams;
  const list = await db.invoice.findMany({
    where: {
      deletedAt: null,
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
      <PageHeader eyebrow="Ventes" title="Factures" subtitle={`${list.length} document(s)`} actions={<Link href="/factures/nouveau" className="btn-brand">+ Facture manuelle</Link>} />
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Segmented active={type === "CREDIT_NOTE" ? "CREDIT_NOTE" : statut ?? "ALL"} items={[
          { key: "ALL", label: "Toutes", href: "/factures" },
          ...filters.map((f) => ({ key: f, label: INVOICE_STATUS[f].label, href: `/factures?statut=${f}` })),
          { key: "CREDIT_NOTE", label: "Avoirs", href: "/factures?type=CREDIT_NOTE" },
        ]} />
        <div className="ml-auto"><SearchBox defaultValue={q} placeholder="Client, référence, intitulé…" /></div>
      </div>
      <div className="card overflow-x-auto">
        <table className="w-full min-w-[1000px]">
          <thead className="border-b border-line/80"><tr>
            <th className="th">Référence</th><th className="th">Type</th><th className="th">Client</th><th className="th">Émise</th>
            <th className="th">Échéance</th><th className="th text-right">Net à payer</th><th className="th text-right">Reste dû</th><th className="th">Statut</th><th className="th text-right">Actions</th>
          </tr></thead>
          <tbody className="stagger divide-y divide-line/70">
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
