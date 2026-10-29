// Lectures pour l'interface (aucune écriture).
import { catalogKey } from "@/lib/catalog";
import { db } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import type { EditorData, EditorLine } from "@/components/DocEditor";
import { num } from "./common";

export async function editorOptions() {
  const [clients, catalog] = await Promise.all([
    db.client.findMany({
      where: { archived: false },
      orderBy: { name: "asc" },
      select: { id: true, name: true, ice: true, city: true, hubspotCompanyId: true },
    }),
    db.catalogItem.findMany({ orderBy: { designation: "asc" } }),
  ]);
  return {
    clients,
    // Clés de toutes les prestations (désactivées comprises) pour signaler les lignes déjà au catalogue
    catalogKeys: catalog.map((c) => catalogKey(c.designation)),
    catalog: catalog.filter((c) => c.active).map((c) => ({
      id: c.id,
      designation: c.designation,
      description: c.description,
      unit: c.unit,
      unitPrice: c.unitPrice == null ? null : num(c.unitPrice),
      vatRate: num(c.vatRate),
    })),
  };
}

type L = {
  designation: string; description: string | null; quantity: unknown; unit: string;
  unitPrice: unknown; vatRate: unknown; discountPercent: unknown; position: number;
};
const s = (v: unknown) => String(num(v as { toString(): string }));

export function linesToEditor(lines: L[]): EditorLine[] {
  return [...lines]
    .sort((a, b) => a.position - b.position)
    .map((l) => ({
      designation: l.designation,
      description: l.description ?? "",
      quantity: s(l.quantity),
      unit: l.unit,
      unitPrice: s(l.unitPrice),
      vatRate: s(l.vatRate),
      discountPercent: s(l.discountPercent),
    }));
}

export async function blankEditor(kind: "quote" | "invoice", clientId = ""): Promise<EditorData> {
  const st = await getSettings();
  return {
    clientId,
    hubspotDealId: "",
    title: "",
    subtitle: "",
    projectName: "",
    validityDays: String(st.defaultValidityDays),
    depositPercent: String(num(st.defaultDepositPercent)),
    paymentTerms: kind === "quote" ? st.defaultPaymentTerms : st.invoicePaymentTerms,
    deliverables: "",
    deadlines: "",
    specificConditions: "",
    notes: "",
    deliveryDate: "",
    reason: "",
    lines: [{ designation: "", description: "", quantity: "1", unit: "forfait", unitPrice: "", vatRate: String(num(st.defaultVatRate)), discountPercent: "0" }],
  };
}
