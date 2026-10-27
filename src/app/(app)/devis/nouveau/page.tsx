import { requirePermission } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { getSettings } from "@/lib/settings";
import { blankEditor, editorOptions } from "@/server/queries";
import { DocEditor } from "@/components/DocEditor";
import { PageHeader } from "@/components/ui";
import { hubspotDealsAction, saveQuoteAction } from "@/app/actions";

export const metadata = { title: "Nouveau devis" };

export default async function NewQuotePage({ searchParams }: { searchParams: Promise<{ client?: string }> }) {
  const user = await requirePermission("quote.create");
  const { client } = await searchParams;
  const [opts, initial, s] = await Promise.all([editorOptions(), blankEditor("quote", client), getSettings()]);
  return (
    <>
      <PageHeader title="Nouveau devis" subtitle="Brouillon — numéro attribué à l'approbation du CEO" />
      <DocEditor kind="quote" id={null} initial={initial} {...opts} canEditTerms={can(user, "terms.edit") || s.salesCanEditTerms}
        save={saveQuoteAction} dealsAction={hubspotDealsAction} />
    </>
  );
}
