// Modèle de données d'un document PDF (indépendant de la base) + construction depuis Prisma.
import type { CompanySettings } from "@/generated/prisma/client";
import type { Deduction, VatGroup } from "@/lib/calc";
import { amountInWords, formatDateLong, quoteReference } from "@/lib/format";
import { breakdownOf, cents, num, type ClientSnapshot } from "@/server/common";

export type PdfLine = {
  designation: string;
  description: string | null;
  quantity: number;
  unit: string;
  unitPrice: number; // centimes
  vatRate: number;
  discountPercent: number;
  totalHt: number; // centimes
};

export type PdfDoc = {
  kind: "QUOTE" | "INVOICE";
  docLabel: string; // DEVIS, FACTURE, FACTURE D'ACOMPTE, FACTURE DE SOLDE, AVOIR
  reference: string | null;
  draft: boolean;
  signed: boolean;
  issueDate: string;
  dueDate?: string | null;
  validUntil?: string | null;
  company: CompanySettings;
  client: ClientSnapshot;
  projectName: string | null;
  title: string;
  subtitle: string | null;
  quoteReference?: string | null;
  relatedReference?: string | null;
  reason?: string | null;
  lines: PdfLine[];
  totalHt: number;
  totalVat: number;
  totalTtc: number;
  vatBreakdown: VatGroup[];
  deductions: Deduction[];
  netToPay: number;
  amountWords: string;
  paymentTerms: string | null;
  depositPercent?: number;
  validityDays?: number;
  deliverables?: string | null;
  deadlines?: string | null;
  specificConditions?: string | null;
  notes?: string | null;
};

type DbLine = {
  designation: string;
  description: string | null;
  quantity: unknown;
  unit: string;
  unitPrice: unknown;
  vatRate: unknown;
  discountPercent: unknown;
  totalHt: unknown;
  position: number;
};

const d = (v: unknown) => v as { toString(): string };

function mapLines(lines: DbLine[]): PdfLine[] {
  return [...lines]
    .sort((a, b) => a.position - b.position)
    .map((l) => ({
      designation: l.designation,
      description: l.description,
      quantity: num(d(l.quantity)),
      unit: l.unit,
      unitPrice: cents(d(l.unitPrice)),
      vatRate: num(d(l.vatRate)),
      discountPercent: num(d(l.discountPercent)),
      totalHt: cents(d(l.totalHt)),
    }));
}

function snapshotOr(snapshot: unknown, client: ClientSnapshot): ClientSnapshot {
  return (snapshot as ClientSnapshot | null) ?? client;
}

type QuoteRow = {
  status: string;
  reference: string | null;
  version: number;
  signed: boolean;
  issueDate: Date | null;
  validUntil: Date | null;
  validityDays: number;
  clientSnapshot: unknown;
  client: ClientSnapshot;
  projectName: string | null;
  title: string;
  subtitle: string | null;
  lines: DbLine[];
  totalHt: unknown;
  totalVat: unknown;
  totalTtc: unknown;
  vatBreakdown: unknown;
  paymentTerms: string;
  depositPercent: unknown;
  deliverables: string | null;
  deadlines: string | null;
  specificConditions: string | null;
  notes: string | null;
};

export function quoteToPdf(q: QuoteRow, company: CompanySettings): PdfDoc {
  const draft = !["APPROVED", "SENT", "ACCEPTED", "REFUSED", "SUPERSEDED"].includes(q.status);
  const ttc = cents(d(q.totalTtc));
  return {
    kind: "QUOTE",
    docLabel: "DEVIS",
    reference: draft ? null : quoteReference(q.reference, q.version),
    draft,
    signed: !draft && q.signed,
    issueDate: formatDateLong(q.issueDate ?? new Date()),
    validUntil: q.validUntil ? formatDateLong(q.validUntil) : null,
    company,
    client: snapshotOr(q.clientSnapshot, q.client),
    projectName: q.projectName,
    title: q.title,
    subtitle: q.subtitle,
    lines: mapLines(q.lines),
    totalHt: cents(d(q.totalHt)),
    totalVat: cents(d(q.totalVat)),
    totalTtc: ttc,
    vatBreakdown: breakdownOf(q.vatBreakdown),
    deductions: [],
    netToPay: ttc,
    amountWords: amountInWords(ttc),
    paymentTerms: q.paymentTerms,
    depositPercent: num(d(q.depositPercent)),
    validityDays: q.validityDays,
    deliverables: q.deliverables,
    deadlines: q.deadlines,
    specificConditions: q.specificConditions,
    notes: q.notes,
  };
}

type InvoiceRow = {
  type: "STANDARD" | "DEPOSIT" | "BALANCE" | "CREDIT_NOTE";
  status: string;
  reference: string | null;
  number: number | null;
  signed: boolean;
  issueDate: Date | null;
  dueDate: Date | null;
  clientSnapshot: unknown;
  client: ClientSnapshot;
  projectName: string | null;
  title: string;
  subtitle: string | null;
  reason: string | null;
  lines: DbLine[];
  totalHt: unknown;
  totalVat: unknown;
  totalTtc: unknown;
  vatBreakdown: unknown;
  deductions: unknown;
  netToPay: unknown;
  paymentTerms: string | null;
  notes: string | null;
  quote: { reference: string | null; version: number } | null;
  relatedInvoice: { reference: string | null } | null;
};

const LABELS = {
  STANDARD: "FACTURE",
  DEPOSIT: "FACTURE D'ACOMPTE",
  BALANCE: "FACTURE DE SOLDE",
  CREDIT_NOTE: "AVOIR",
} as const;

export function invoiceToPdf(inv: InvoiceRow, company: CompanySettings): PdfDoc {
  const draft = inv.number == null;
  const net = cents(d(inv.netToPay));
  return {
    kind: "INVOICE",
    docLabel: LABELS[inv.type],
    reference: inv.reference,
    draft,
    signed: !draft && inv.signed,
    issueDate: formatDateLong(inv.issueDate ?? new Date()),
    dueDate: inv.dueDate ? formatDateLong(inv.dueDate) : null,
    company,
    client: snapshotOr(inv.clientSnapshot, inv.client),
    projectName: inv.projectName,
    title: inv.title,
    subtitle: inv.subtitle,
    quoteReference: inv.quote ? quoteReference(inv.quote.reference, inv.quote.version) : null,
    relatedReference: inv.relatedInvoice?.reference ?? null,
    reason: inv.reason,
    lines: mapLines(inv.lines),
    totalHt: cents(d(inv.totalHt)),
    totalVat: cents(d(inv.totalVat)),
    totalTtc: cents(d(inv.totalTtc)),
    vatBreakdown: breakdownOf(inv.vatBreakdown),
    deductions: (inv.deductions as Deduction[] | null) ?? [],
    netToPay: net,
    amountWords: amountInWords(net),
    paymentTerms: inv.paymentTerms,
    notes: inv.notes,
  };
}
