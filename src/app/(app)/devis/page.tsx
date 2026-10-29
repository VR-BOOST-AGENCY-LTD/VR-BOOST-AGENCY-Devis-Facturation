import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatCents, formatDateShort, quoteReference } from "@/lib/format";
import { cents } from "@/server/common";
import { isQuoteExpired } from "@/server/quotes";
import { Badge, Empty, Money, PageHeader, Segmented } from "@/components/ui";
import { QUOTE_STATUS } from "@/components/status";
import { RowActions, RowLink } from "@/components/RowLink";
import { SearchBox } from "@/components/SearchBox";

export const metadata = { title: "Devis" };

const PIPELINE = ["DRAFT", "PENDING_APPROVAL", "APPROVED", "SENT", "ACCEPTED"] as const;
const BAR: Record<string, string> = {
  DRAFT: "bg-slate-400", PENDING_APPROVAL: "bg-amber-500", APPROVED: "bg-emerald-500", SENT: "bg-sky-500", ACCEPTED: "bg-green-600",
};

export default async function QuotesPage({ searchParams }: { searchParams: Promise<{ statut?: string; q?: string; vue?: string }> }) {
  await requireUser();
  const { statut, q, vue } = await searchParams;
  const board = vue === "pipeline";
  const quotes = await db.quote.findMany({
    where: {
      deletedAt: null,
      ...(statut && statut !== "EXPIRED" && !board ? { status: statut as never } : { status: { notIn: ["SUPERSEDED", ...(board ? (["CANCELLED", "REFUSED"] as const) : [])] } }),
      ...(q ? { OR: [{ title: { contains: q, mode: "insensitive" } }, { reference: { contains: q } }, { client: { name: { contains: q, mode: "insensitive" } } }] } : {}),
    },
    include: { client: { select: { name: true } }, createdBy: { select: { name: true } } },
    orderBy: { updatedAt: "desc" },
    take: 300,
  });
  const rows = statut === "EXPIRED" && !board ? quotes.filter((x) => isQuoteExpired(x)) : quotes;
  const keep = (extra: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries({ statut, q, vue, ...extra })) if (v) p.set(k, v);
    const s = p.toString();
    return s ? `/devis?${s}` : "/devis";
  };
  const filters = ["DRAFT", "PENDING_APPROVAL", "APPROVED", "SENT", "ACCEPTED", "REFUSED", "EXPIRED"];

  return (
    <>
      <PageHeader eyebrow="Ventes" title="Devis" subtitle={`${rows.length} document(s)`}
        actions={
          <>
            <nav className="flex rounded-full bg-white/80 p-1 shadow-sm ring-1 ring-line" aria-label="Affichage">
              <Link href={keep({ vue: undefined })} aria-current={!board ? "page" : undefined}
                className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${!board ? "bg-ink text-white" : "text-muted hover:text-ink"}`}>Liste</Link>
              <Link href={keep({ vue: "pipeline", statut: undefined })} aria-current={board ? "page" : undefined}
                className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${board ? "bg-ink text-white" : "text-muted hover:text-ink"}`}>Pipeline</Link>
            </nav>
            <Link href="/devis/nouveau" className="btn-brand">+ Nouveau devis</Link>
          </>
        } />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        {!board ? (
          <Segmented active={statut ?? "ALL"} items={[
            { key: "ALL", label: "Tous", href: keep({ statut: undefined }) },
            ...filters.map((f) => ({ key: f, label: QUOTE_STATUS[f].label, href: keep({ statut: f }) })),
          ]} />
        ) : <p className="text-sm text-muted">Devis en cours, du brouillon à l&apos;acceptation. Cliquez sur une carte pour l&apos;ouvrir.</p>}
        <div className="ml-auto"><SearchBox defaultValue={q} placeholder="Client, référence, intitulé…" /></div>
      </div>

      {board ? (
        <div className="-mx-1 flex items-start gap-3 overflow-x-auto px-1 pb-3">
          {PIPELINE.map((s) => {
            const col = rows.filter((x) => x.status === s);
            const total = col.reduce((t, x) => t + cents(x.totalTtc), 0);
            return (
              <section key={s} className="w-[272px] shrink-0 rounded-[22px] bg-white/55 p-2.5 ring-1 ring-white/70 backdrop-blur-sm">
                <header className="flex items-center gap-2 px-2 pt-1 pb-2.5">
                  <span className={`h-4 w-1 rounded-full ${BAR[s]}`} />
                  <h2 className="flex-1 text-sm font-semibold">{QUOTE_STATUS[s].label}</h2>
                  <span className="rounded-md bg-white px-1.5 py-0.5 text-xs font-semibold tabular ring-1 ring-line">{col.length}</span>
                </header>
                <p className="px-2 pb-2 text-[11px] text-muted tabular">{formatCents(total)} TTC</p>
                <div className="stagger space-y-2">
                  {col.map((x) => (
                    <Link key={x.id} href={`/devis/${x.id}`}
                      className="card card-hover block !rounded-2xl p-3.5 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand/25">
                      <div className="mb-2 flex flex-wrap gap-1.5">
                        {isQuoteExpired(x) ? <Badge kind="quote" status="EXPIRED" /> : null}
                        <span className="chip bg-mist text-muted tabular">{quoteReference(x.reference, x.version)}</span>
                      </div>
                      <p className="truncate text-sm font-semibold">{x.client.name}</p>
                      <p className="mt-0.5 line-clamp-2 text-xs text-muted">{x.title}</p>
                      <div className="mt-3 flex items-center gap-2 border-t border-line/70 pt-2.5 text-xs">
                        <span className="font-semibold tabular">{formatCents(cents(x.totalTtc))}</span>
                        <span className="text-muted">•</span>
                        <span className="text-muted tabular">{formatDateShort(x.issueDate ?? x.createdAt)}</span>
                      </div>
                    </Link>
                  ))}
                  {col.length === 0 ? <p className="rounded-2xl border border-dashed border-line px-3 py-6 text-center text-xs text-muted">Aucun devis</p> : null}
                </div>
              </section>
            );
          })}
        </div>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[900px]">
            <thead className="border-b border-line/80"><tr>
              <th className="th">Référence</th><th className="th">Client</th><th className="th">Intitulé</th>
              <th className="th">Date</th><th className="th text-right">Total TTC</th><th className="th">Statut</th><th className="th text-right">Actions</th>
            </tr></thead>
            <tbody className="stagger divide-y divide-line/70">
              {rows.map((x) => (
                <RowLink key={x.id} href={`/devis/${x.id}`}>
                  <td className="td font-semibold tabular"><Link href={`/devis/${x.id}`} className="hover:text-brand">{quoteReference(x.reference, x.version)}</Link></td>
                  <td className="td">{x.client.name}</td>
                  <td className="td max-w-xs truncate text-muted">{x.title}</td>
                  <td className="td text-muted tabular">{formatDateShort(x.issueDate ?? x.createdAt)}</td>
                  <td className="td text-right font-medium"><Money cents={cents(x.totalTtc)} /></td>
                  <td className="td"><Badge kind="quote" status={isQuoteExpired(x) ? "EXPIRED" : x.status} /></td>
                  <td className="td"><RowActions href={`/devis/${x.id}`} pdf={`/api/pdf/quote/${x.id}`} /></td>
                </RowLink>
              ))}
            </tbody>
          </table>
          {rows.length === 0 ? <Empty action={<Link href="/devis/nouveau" className="btn-brand">Créer un devis</Link>}>Aucun devis ne correspond.</Empty> : null}
        </div>
      )}
    </>
  );
}
