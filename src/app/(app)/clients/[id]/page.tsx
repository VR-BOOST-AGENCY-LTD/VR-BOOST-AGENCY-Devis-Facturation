import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { quoteReference } from "@/lib/format";
import { cents } from "@/server/common";
import { hubspotEnabled } from "@/server/hubspot";
import { ActionButton } from "@/components/ActionButton";
import { ClientForm } from "@/components/ClientForm";
import { HubspotSearch } from "@/components/HubspotSearch";
import { Badge, Money, PageHeader } from "@/components/ui";
import { INVOICE_TYPE } from "@/components/status";
import { hubspotLinkClientAction, hubspotPushClientAction, hubspotSearchAction, saveClientAction } from "@/app/actions";

export default async function ClientPage({ params }: { params: Promise<{ id: string }> }) {
  await requireUser();
  const { id } = await params;
  const c = await db.client.findUnique({
    where: { id },
    include: {
      quotes: { where: { status: { not: "SUPERSEDED" } }, orderBy: { createdAt: "desc" } },
      invoices: { orderBy: { createdAt: "desc" } },
    },
  });
  if (!c) notFound();
  return (
    <>
      <PageHeader eyebrow="Ventes" title={c.name} subtitle={c.hubspotCompanyId ? `Lié à HubSpot (entreprise ${c.hubspotCompanyId})` : "Non lié à HubSpot"} actions={
        <>
          <Link href={`/devis/nouveau?client=${c.id}`} className="btn-brand">+ Devis</Link>
          <Link href={`/factures/nouveau?client=${c.id}`} className="btn-ghost">+ Facture</Link>
        </>
      } />
      <div className="grid gap-6 xl:grid-cols-[1fr_400px]">
        <ClientForm id={c.id} save={saveClientAction} initial={{
          type: c.type, name: c.name, ice: c.ice ?? "", ifNumber: c.ifNumber ?? "", rc: c.rc ?? "", address: c.address ?? "",
          city: c.city ?? "", country: c.country, email: c.email ?? "", phone: c.phone ?? "", contactName: c.contactName ?? "", notes: c.notes ?? "",
        }} />
        <div className="space-y-6">
          {!c.hubspotCompanyId ? (
            <section className="card space-y-4 p-5">
              <h2 className="text-sm font-semibold">HubSpot</h2>
              <HubspotSearch enabled={hubspotEnabled()} search={hubspotSearchAction} onPick={hubspotLinkClientAction.bind(null, c.id)} pickLabel="Lier" />
              {hubspotEnabled() ? (
                <ActionButton action={hubspotPushClientAction.bind(null, c.id)} label="Créer l'entreprise dans HubSpot"
                  confirm="Création uniquement si aucune entreprise du même nom n'existe ; aucune donnée HubSpot n'est modifiée." />
              ) : null}
            </section>
          ) : null}
          <section className="card p-5 text-sm">
            <h2 className="mb-3 font-semibold">Devis</h2>
            <ul className="space-y-2">
              {c.quotes.map((q) => (
                <li key={q.id} className="flex items-center justify-between gap-2">
                  <Link href={`/devis/${q.id}`} className="truncate hover:underline">{quoteReference(q.reference, q.version)} · {q.title}</Link>
                  <Badge kind="quote" status={q.status} />
                </li>
              ))}
              {c.quotes.length === 0 ? <li className="text-muted">Aucun devis.</li> : null}
            </ul>
          </section>
          <section className="card p-5 text-sm">
            <h2 className="mb-3 font-semibold">Factures</h2>
            <ul className="space-y-2">
              {c.invoices.map((i) => (
                <li key={i.id} className="flex items-center justify-between gap-2">
                  <Link href={`/factures/${i.id}`} className="truncate hover:underline">{INVOICE_TYPE[i.type]} {i.reference ?? "(brouillon)"}</Link>
                  <span className="flex items-center gap-2"><Money cents={cents(i.netToPay)} className="text-muted" /><Badge kind="invoice" status={i.status} /></span>
                </li>
              ))}
              {c.invoices.length === 0 ? <li className="text-muted">Aucune facture.</li> : null}
            </ul>
          </section>
        </div>
      </div>
    </>
  );
}
