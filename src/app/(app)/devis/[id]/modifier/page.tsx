import { notFound, redirect } from "next/navigation";
import { requirePermission } from "@/lib/auth";
import { db } from "@/lib/db";
import { quoteReference } from "@/lib/format";
import { can } from "@/lib/permissions";
import { getSettings } from "@/lib/settings";
import { num } from "@/server/common";
import { editorOptions, linesToEditor } from "@/server/queries";
import { DocEditor } from "@/components/DocEditor";
import { PageHeader } from "@/components/ui";
import { hubspotDealsAction, saveQuoteAction } from "@/app/actions";

export default async function EditQuotePage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePermission("quote.editDraft");
  const { id } = await params;
  const q = await db.quote.findUnique({ where: { id }, include: { lines: true } });
  if (!q) notFound();
  if (!["DRAFT", "PENDING_APPROVAL"].includes(q.status)) redirect(`/devis/${id}`);
  const [opts, s] = await Promise.all([editorOptions(), getSettings()]);
  return (
    <>
      <PageHeader title={`Modifier — ${quoteReference(q.reference, q.version)}`} subtitle={q.status === "PENDING_APPROVAL" ? "Modifier ce devis annule la soumission en cours." : undefined} />
      <DocEditor
        kind="quote"
        id={q.id}
        initial={{
          clientId: q.clientId, hubspotDealId: q.hubspotDealId ?? "", title: q.title, subtitle: q.subtitle ?? "",
          projectName: q.projectName ?? "", validityDays: String(q.validityDays), depositPercent: String(num(q.depositPercent)),
          paymentTerms: q.paymentTerms, deliverables: q.deliverables ?? "", deadlines: q.deadlines ?? "",
          specificConditions: q.specificConditions ?? "", notes: q.notes ?? "", deliveryDate: "", reason: "",
          lines: linesToEditor(q.lines),
        }}
        {...opts}
        canEditTerms={can(user, "terms.edit") || s.salesCanEditTerms}
        save={saveQuoteAction}
        dealsAction={hubspotDealsAction}
      />
    </>
  );
}
