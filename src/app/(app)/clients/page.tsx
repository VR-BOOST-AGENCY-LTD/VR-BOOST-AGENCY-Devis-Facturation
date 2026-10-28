import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { hubspotEnabled } from "@/server/hubspot";
import { HubspotSearch } from "@/components/HubspotSearch";
import { Empty, PageHeader } from "@/components/ui";
import { hubspotImportAction, hubspotSearchAction } from "@/app/actions";
import { RowLink } from "@/components/RowLink";
import { SearchBox } from "@/components/SearchBox";

export const metadata = { title: "Clients" };

export default async function ClientsPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  await requireUser();
  const { q } = await searchParams;
  const clients = await db.client.findMany({
    where: { archived: false, ...(q ? { OR: [{ name: { contains: q, mode: "insensitive" } }, { ice: { contains: q } }] } : {}) },
    include: { _count: { select: { quotes: true, invoices: true } } },
    orderBy: { name: "asc" },
  });
  return (
    <>
      <PageHeader eyebrow="Ventes" title="Clients" subtitle={`${clients.length} fiche(s)`} actions={<Link href="/clients/nouveau" className="btn-brand">+ Créer une fiche client</Link>} />
      <section className="card mb-6 p-5">
        <h2 className="mb-3 text-sm font-semibold">Importer depuis HubSpot</h2>
        <HubspotSearch enabled={hubspotEnabled()} search={hubspotSearchAction} onPick={hubspotImportAction} />
      </section>
      <div className="mb-4"><SearchBox defaultValue={q} placeholder="Rechercher un client (nom, ICE)…" /></div>
      <div className="card overflow-x-auto">
        <table className="w-full min-w-[640px]">
          <thead className="border-b border-line/80"><tr><th className="th">Client</th><th className="th">ICE</th><th className="th">Ville</th><th className="th">HubSpot</th><th className="th text-right">Devis</th><th className="th text-right">Factures</th></tr></thead>
          <tbody className="stagger divide-y divide-line/70">
            {clients.map((c) => (
              <RowLink key={c.id} href={`/clients/${c.id}`}>
                <td className="td font-medium"><Link className="hover:underline" href={`/clients/${c.id}`}>{c.name}</Link></td>
                <td className="td text-muted">{c.ice ?? "—"}</td>
                <td className="td text-muted">{c.city ?? "—"}</td>
                <td className="td">{c.hubspotCompanyId ? <span className="rounded-full bg-orange-100 px-2 py-0.5 text-xs text-orange-800">Lié</span> : <span className="text-xs text-muted">—</span>}</td>
                <td className="td text-right">{c._count.quotes}</td>
                <td className="td text-right">{c._count.invoices}</td>
              </RowLink>
            ))}
          </tbody>
        </table>
        {clients.length === 0 ? <Empty>Aucun client. Créez une fiche ou importez-la depuis HubSpot.</Empty> : null}
      </div>
    </>
  );
}
