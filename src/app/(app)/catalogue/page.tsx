import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { num } from "@/server/common";
import { CatalogManager } from "@/components/CatalogManager";
import { Notice, PageHeader } from "@/components/ui";
import { saveCatalogItemAction, toggleCatalogItemAction } from "@/app/actions";

export const metadata = { title: "Catalogue" };

export default async function CatalogPage() {
  await requireUser();
  const items = await db.catalogItem.findMany({ orderBy: [{ active: "desc" }, { designation: "asc" }] });
  return (
    <>
      <PageHeader title="Catalogue de prestations" subtitle="Facultatif — raccourcis de saisie" />
      <div className="mb-6"><Notice tone="sky">Le catalogue n&apos;est jamais obligatoire : toute prestation peut être saisie librement avec un prix personnalisé dans les devis et factures.</Notice></div>
      <CatalogManager
        items={items.map((i) => ({ id: i.id, designation: i.designation, description: i.description, unit: i.unit, unitPrice: i.unitPrice == null ? null : num(i.unitPrice), vatRate: num(i.vatRate), active: i.active }))}
        save={saveCatalogItemAction}
        toggle={toggleCatalogItemAction}
      />
    </>
  );
}
