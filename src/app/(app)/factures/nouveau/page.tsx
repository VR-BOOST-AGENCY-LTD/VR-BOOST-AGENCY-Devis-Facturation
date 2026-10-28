import { requirePermission } from "@/lib/auth";
import { blankEditor, editorOptions } from "@/server/queries";
import { DocEditor } from "@/components/DocEditor";
import { Notice, PageHeader } from "@/components/ui";
import { hubspotDealsAction, saveInvoiceAction } from "@/app/actions";

export const metadata = { title: "Nouvelle facture" };

export default async function NewInvoicePage({ searchParams }: { searchParams: Promise<{ client?: string }> }) {
  await requirePermission("invoice.create");
  const { client } = await searchParams;
  const [opts, initial] = await Promise.all([editorOptions(), blankEditor("invoice", client)]);
  return (
    <>
      <PageHeader eyebrow="Ventes" title="Facture manuelle" subtitle="Brouillon — le numéro définitif est attribué à l'émission, après approbation du CEO" />
      <div className="mb-6"><Notice tone="sky">Pour facturer un devis accepté (acompte 50 %, solde, définitive), ouvrez le devis et utilisez « Facturer ce devis » : les acomptes sont alors déduits automatiquement.</Notice></div>
      <DocEditor kind="invoice" id={null} initial={initial} {...opts} canEditTerms save={saveInvoiceAction} dealsAction={hubspotDealsAction} />
    </>
  );
}
