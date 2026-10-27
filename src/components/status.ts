export const QUOTE_STATUS: Record<string, { label: string; cls: string }> = {
  DRAFT: { label: "Brouillon", cls: "bg-mist text-ink" },
  PENDING_APPROVAL: { label: "En attente CEO", cls: "bg-amber-100 text-amber-800" },
  APPROVED: { label: "Approuvé", cls: "bg-emerald-100 text-emerald-800" },
  SENT: { label: "Envoyé", cls: "bg-sky-soft text-sky" },
  ACCEPTED: { label: "Accepté", cls: "bg-emerald-600 text-white" },
  REFUSED: { label: "Refusé", cls: "bg-red-100 text-red-700" },
  SUPERSEDED: { label: "Remplacé", cls: "bg-mist text-muted line-through" },
  CANCELLED: { label: "Annulé", cls: "bg-mist text-muted" },
  EXPIRED: { label: "Expiré", cls: "bg-orange-100 text-orange-800" },
};

export const INVOICE_STATUS: Record<string, { label: string; cls: string }> = {
  DRAFT: { label: "Brouillon", cls: "bg-mist text-ink" },
  PENDING_APPROVAL: { label: "En attente CEO", cls: "bg-amber-100 text-amber-800" },
  ISSUED: { label: "Émise", cls: "bg-sky-soft text-sky" },
  PARTIALLY_PAID: { label: "Partiellement payée", cls: "bg-violet-100 text-violet-800" },
  PAID: { label: "Payée", cls: "bg-emerald-600 text-white" },
  OVERDUE: { label: "En retard", cls: "bg-red-600 text-white" },
  CANCELLED: { label: "Annulée (avoir)", cls: "bg-mist text-muted" },
};

export const INVOICE_TYPE: Record<string, string> = {
  STANDARD: "Facture",
  DEPOSIT: "Acompte",
  BALANCE: "Solde",
  CREDIT_NOTE: "Avoir",
};

export const PAYMENT_METHOD: Record<string, string> = {
  VIREMENT: "Virement",
  CHEQUE: "Chèque",
  ESPECES: "Espèces",
  EFFET: "Effet",
  CARTE: "Carte",
  AUTRE: "Autre",
};
