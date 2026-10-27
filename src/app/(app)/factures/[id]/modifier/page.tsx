import { notFound, redirect } from "next/navigation";
import { requirePermission } from "@/lib/auth";
import { db } from "@/lib/db";
import { editorOptions, linesToEditor } from "@/server/queries";
import { DocEditor } from "@/components/DocEditor";
import { PageHeader } from "@/components/ui";
import { INVOICE_TYPE } from "@/components/status";
import { hubspotDealsAction, saveInvoiceAction } from "@/app/actions";

export default async function EditInvoicePage({ params }: { params: Promise<{ id: string }> }) {
  await requirePermission("invoice.editDraft");
  const { id } = await params;
  const inv = await db.invoice.findUnique({ where: { id }, include: { lines: true } });
  if (!inv) notFound();
  if (!["DRAFT", "PENDING_APPROVAL"].includes(inv.status)) redirect(`/factures/${id}`);
  const opts = await editorOptions();
  return (
    <>
      <PageHeader title={`Modifier — ${INVOICE_TYPE[inv.type]} (brouillon)`} />
      <DocEditor
        kind="invoice"
        id={inv.id}
        isCreditNote={inv.type === "CREDIT_NOTE"}
        linesLocked={(inv.type === "DEPOSIT" || inv.type === "BALANCE") && !inv.isRectification}
        initial={{
          clientId: inv.clientId, hubspotDealId: inv.hubspotDealId ?? "", title: inv.title, subtitle: inv.subtitle ?? "",
          projectName: inv.projectName ?? "", validityDays: "", depositPercent: "", paymentTerms: inv.paymentTerms ?? "",
          deliverables: "", deadlines: "", specificConditions: "", notes: inv.notes ?? "",
          deliveryDate: inv.deliveryDate ? inv.deliveryDate.toISOString().slice(0, 10) : "", reason: inv.reason ?? "",
          lines: linesToEditor(inv.lines),
        }}
        {...opts}
        canEditTerms
        save={saveInvoiceAction}
        dealsAction={hubspotDealsAction}
      />
    </>
  );
}
