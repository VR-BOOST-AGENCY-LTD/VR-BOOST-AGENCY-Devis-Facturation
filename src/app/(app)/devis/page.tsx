import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatDateShort, quoteReference } from "@/lib/format";
import { cents } from "@/server/common";
import { isQuoteExpired } from "@/server/quotes";
import { Badge, Empty, Money, PageHeader } from "@/components/ui";
import { QUOTE_STATUS } from "@/components/status";

export const metadata = { title: "Devis" };

export default async function QuotesPage({ searchParams }: { searchParams: Promise<{ statut?: string; q?: string }> }) {
  await requireUser();
  const { statut, q } = await searchParams;
  const quotes = await db.quote.findMany({
    where: {
      ...(statut && statut !== "EXPIRED" ? { status: statut as never } : { status: { not: "SUPERSEDED" } }),
      ...(q ? { OR: [{ title: { contains: q, mode: "insensitive" } }, { reference: { contains: q } }, { client: { name: { contains: q, mode: "insensitive" } } }] } : {}),
    },
    include: { client: { select: { name: true } }, createdBy: { select: { name: true } } },
    orderBy: { updatedAt: "desc" },
    take: 300,
  });
  const rows = statut === "EXPIRED" ? quotes.filter((x) => isQuoteExpired(x)) : quotes;
  const filters = ["DRAFT", "PENDING_APPROVAL", "APPROVED", "SENT", "ACCEPTED", "REFUSED", "EXPIRED"];
  return (
    <>
      <PageHeader title="Devis" subtitle={`${rows.length} document(s)`} actions={<Link href="/devis/nouveau" className="btn-brand">+ Nouveau devis</Link>} />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Link href="/devis" className={`rounded-full px-3 py-1 text-xs ${!statut ? "bg-ink text-white" : "bg-white ring-1 ring-line"}`}>Tous</Link>
        {filters.map((f) => (
          <Link key={f} href={`/devis?statut=${f}`} className={`rounded-full px-3 py-1 text-xs ${statut === f ? "bg-ink text-white" : "bg-white ring-1 ring-line"}`}>
            {QUOTE_STATUS[f].label}
          </Link>
        ))}
        <form className="ml-auto"><input name="q" defaultValue={q} placeholder="Rechercher…" className="input w-56" /></form>
      </div>
      <div className="card overflow-x-auto">
        <table className="w-full min-w-[760px]">
          <thead className="border-b border-line bg-mist/50"><tr>
            <th className="th">Référence</th><th className="th">Client</th><th className="th">Intitulé</th>
            <th className="th">Date</th><th className="th text-right">Total TTC</th><th className="th">Statut</th>
          </tr></thead>
          <tbody className="divide-y divide-line">
            {rows.map((x) => (
              <tr key={x.id} className="hover:bg-mist/40">
                <td className="td font-medium"><Link href={`/devis/${x.id}`} className="hover:underline">{quoteReference(x.reference, x.version)}</Link></td>
                <td className="td">{x.client.name}</td>
                <td className="td max-w-xs truncate text-muted">{x.title}</td>
                <td className="td text-muted">{formatDateShort(x.issueDate ?? x.createdAt)}</td>
                <td className="td text-right"><Money cents={cents(x.totalTtc)} /></td>
                <td className="td"><Badge kind="quote" status={isQuoteExpired(x) ? "EXPIRED" : x.status} /></td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 ? <Empty>Aucun devis.</Empty> : null}
      </div>
    </>
  );
}
