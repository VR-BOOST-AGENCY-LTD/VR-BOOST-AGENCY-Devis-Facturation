// Statuts : étiquettes pastel (fond clair, texte saturé) + pastille ; « pulse » sur ce qui attend une action.
export type StatusStyle = { label: string; cls: string; dot: string; pulse?: boolean };

export const QUOTE_STATUS: Record<string, StatusStyle> = {
  DRAFT: { label: "Brouillon", cls: "bg-slate-100 text-slate-600", dot: "bg-slate-400" },
  PENDING_APPROVAL: { label: "En attente CEO", cls: "bg-amber-50 text-amber-700", dot: "bg-amber-500", pulse: true },
  APPROVED: { label: "Approuvé", cls: "bg-emerald-50 text-emerald-700", dot: "bg-emerald-500" },
  SENT: { label: "Envoyé", cls: "bg-sky-50 text-sky-700", dot: "bg-sky-500" },
  ACCEPTED: { label: "Accepté", cls: "bg-green-100 text-green-800", dot: "bg-green-600" },
  REFUSED: { label: "Refusé", cls: "bg-rose-50 text-rose-700", dot: "bg-rose-500" },
  SUPERSEDED: { label: "Remplacé", cls: "bg-slate-50 text-slate-400 line-through", dot: "bg-slate-300" },
  CANCELLED: { label: "Annulé", cls: "bg-slate-50 text-slate-500", dot: "bg-slate-300" },
  EXPIRED: { label: "Expiré", cls: "bg-orange-50 text-orange-700", dot: "bg-orange-500" },
};

export const INVOICE_STATUS: Record<string, StatusStyle> = {
  DRAFT: { label: "Brouillon", cls: "bg-slate-100 text-slate-600", dot: "bg-slate-400" },
  PENDING_APPROVAL: { label: "En attente CEO", cls: "bg-amber-50 text-amber-700", dot: "bg-amber-500", pulse: true },
  ISSUED: { label: "Émise", cls: "bg-sky-50 text-sky-700", dot: "bg-sky-500" },
  PARTIALLY_PAID: { label: "Partiellement payée", cls: "bg-violet-50 text-violet-700", dot: "bg-violet-500" },
  PAID: { label: "Payée", cls: "bg-green-100 text-green-800", dot: "bg-green-600" },
  OVERDUE: { label: "En retard", cls: "bg-rose-50 text-rose-700", dot: "bg-rose-500", pulse: true },
  CANCELLED: { label: "Annulée (avoir)", cls: "bg-slate-50 text-slate-500", dot: "bg-slate-300" },
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
