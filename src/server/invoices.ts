// Module FACTURATION — Brouillon → Approbation CEO → Numéro définitif → Émission → Suivi des paiements.
// Types : facture définitive (STANDARD), acompte (DEPOSIT), solde (BALANCE), avoir (CREDIT_NOTE).
import type { Invoice, InvoiceStatus, InvoiceType } from "@/generated/prisma/client";
import {
  balanceAmounts,
  computeTotals,
  depositLines,
  remainingDue,
  type Deduction,
  type Totals,
} from "@/lib/calc";
import { db, type Tx } from "@/lib/db";
import { audit } from "@/lib/audit";
import { conflict, forbidden, invalid, notFound } from "@/lib/errors";
import { addDays, formatPercent, formatReference, todayUtc } from "@/lib/format";
import { allocateNumber } from "@/lib/numbering";
import { assertCan, assertNotSelfApproval, type Actor } from "@/lib/permissions";
import { getSettings, isProduction } from "@/lib/settings";
import { invoiceSchema, lineSchema, type LineData } from "@/lib/validation";
import {
  breakdownOf,
  cents,
  clientSnapshot,
  dbLineToData,
  dec2,
  linesForDb,
  num,
  totalsForDb,
  totalsOfDbLines,
} from "./common";

const ACTIVE_ISSUED: InvoiceStatus[] = ["ISSUED", "PARTIALLY_PAID", "PAID"];

export const TYPE_LABEL: Record<InvoiceType, string> = {
  STANDARD: "Facture",
  DEPOSIT: "Facture d'acompte",
  BALANCE: "Facture de solde",
  CREDIT_NOTE: "Avoir",
};

// ---------------------------------------------------------------- création manuelle

export async function createInvoice(actor: Actor, input: unknown) {
  assertCan(actor, "invoice.create");
  const data = invoiceSchema.parse(input);
  const client = await db.client.findUnique({ where: { id: data.clientId } });
  if (!client) throw notFound("Client introuvable");
  const totals = computeTotals(data.lines);
  if (totals.totalTtc <= 0) throw invalid("Le total d'une facture doit être positif.");
  const s = await getSettings();
  return db.$transaction(async (tx) => {
    const inv = await tx.invoice.create({
      data: {
        type: "STANDARD",
        clientId: data.clientId,
        hubspotDealId: data.hubspotDealId,
        title: data.title,
        subtitle: data.subtitle,
        projectName: data.projectName,
        deliveryDate: data.deliveryDate,
        paymentTerms: data.paymentTerms ?? s.invoicePaymentTerms,
        notes: data.notes,
        ...totalsForDb(totals),
        netToPay: dec2(totals.totalTtc),
        createdById: actor.id,
        lines: { create: linesForDb(data.lines) },
      },
    });
    await audit(tx, actor, "invoice.create", "INVOICE", inv.id, `Brouillon de facture créé : ${inv.title}`);
    return inv;
  });
}

// ---------------------------------------------------------------- depuis un devis accepté

type QuoteWithInvoices = NonNullable<Awaited<ReturnType<typeof loadQuoteForInvoicing>>>;

async function loadQuoteForInvoicing(tx: Tx, quoteId: string) {
  return tx.quote.findUnique({
    where: { id: quoteId },
    include: { lines: { orderBy: { position: "asc" } }, client: true, invoices: true },
  });
}

/** Factures « engagées » sur un devis : tout ce qui n'est pas annulé (brouillons inclus). */
function engaged(q: QuoteWithInvoices) {
  return q.invoices.filter((i) => i.status !== "CANCELLED" && i.type !== "CREDIT_NOTE");
}

/** Montant d'un acompte déductible : facturé moins avoirs émis sur cet acompte. */
function depositDeduction(dep: Invoice): Deduction | null {
  const ttc = cents(dep.totalTtc);
  const credited = cents(dep.amountCredited);
  const net = ttc - credited;
  if (net <= 0) return null;
  const ratio = net / ttc;
  const breakdown = breakdownOf(dep.vatBreakdown).map((g) => ({
    rate: g.rate,
    base: Math.round(g.base * ratio),
    vat: Math.round(g.vat * ratio),
  }));
  const ht = breakdown.reduce((s, g) => s + g.base, 0);
  return { invoiceId: dep.id, reference: dep.reference ?? "", ht, vat: net - ht, ttc: net, breakdown };
}

export async function createInvoiceFromQuote(
  actor: Actor,
  quoteId: string,
  kind: "DEPOSIT" | "BALANCE" | "STANDARD",
  opts: { percent?: number; deliveryDate?: Date | null } = {},
) {
  assertCan(actor, "invoice.create");
  const s = await getSettings();
  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Quote" WHERE id = ${quoteId} FOR UPDATE`;
    const q = await loadQuoteForInvoicing(tx, quoteId);
    if (!q) throw notFound("Devis introuvable");
    if (q.status !== "ACCEPTED") throw conflict("Seul un devis accepté par le client peut être facturé.");

    const active = engaged(q);
    const deposits = active.filter((i) => i.type === "DEPOSIT");
    const closing = active.find((i) => i.type === "BALANCE" || i.type === "STANDARD");
    if (closing) throw conflict(`Ce devis a déjà une facture de clôture (${closing.reference ?? "brouillon"}).`);

    const quoteTotals: Totals = {
      totalHt: cents(q.totalHt),
      totalVat: cents(q.totalVat),
      totalTtc: cents(q.totalTtc),
      vatBreakdown: breakdownOf(q.vatBreakdown),
    };
    const base = {
      clientId: q.clientId,
      quoteId: q.id,
      hubspotDealId: q.hubspotDealId,
      projectName: q.projectName,
      createdById: actor.id,
    };
    let created: Invoice;

    if (kind === "DEPOSIT") {
      const percent = opts.percent ?? num(q.depositPercent);
      const lines: LineData[] = depositLines(quoteTotals.vatBreakdown, percent).map((g) => ({
        designation: `Acompte de ${formatPercent(percent)} sur devis N° ${q.reference}`,
        description: `${q.title}${quoteTotals.vatBreakdown.length > 1 ? ` — prestations soumises à TVA ${formatPercent(g.rate)}` : ""}`,
        quantity: 1,
        unit: "forfait",
        unitPrice: g.baseCents / 100,
        vatRate: g.rate,
        discountPercent: 0,
      }));
      const totals = computeTotals(lines);
      const already = deposits.reduce((sum, d) => sum + cents(d.totalTtc) - cents(d.amountCredited), 0);
      if (already + totals.totalTtc > quoteTotals.totalTtc) {
        throw conflict("Le cumul des acomptes dépasserait le montant du devis.");
      }
      created = await tx.invoice.create({
        data: {
          ...base,
          type: "DEPOSIT",
          depositPercent: percent.toFixed(2),
          title: `Acompte — ${q.title}`,
          subtitle: `Acompte de ${formatPercent(percent)} exigible à la validation de la commande, avant le démarrage.`,
          paymentTerms: `Acompte de ${formatPercent(percent)} exigible avant le démarrage de la prestation.`,
          ...totalsForDb(totals),
          netToPay: dec2(totals.totalTtc),
          lines: { create: linesForDb(lines) },
        },
      });
    } else {
      const lines = q.lines.map(dbLineToData);
      const totals = computeTotals(lines);
      let deductions: Deduction[] = [];
      if (kind === "BALANCE") {
        if (deposits.length === 0) throw conflict("Aucun acompte facturé : utilisez une facture définitive.");
        const notIssued = deposits.find((d) => !ACTIVE_ISSUED.includes(d.status));
        if (notIssued) throw conflict("Un acompte est encore en brouillon : émettez-le ou supprimez-le avant le solde.");
        deductions = deposits.map(depositDeduction).filter((d): d is Deduction => d != null);
      } else if (deposits.length > 0) {
        throw conflict("Des acomptes existent : utilisez une facture de solde pour ne pas les compter deux fois.");
      }
      const bal = balanceAmounts(totals, deductions);
      created = await tx.invoice.create({
        data: {
          ...base,
          type: kind,
          title: kind === "BALANCE" ? `Solde — ${q.title}` : q.title,
          subtitle: kind === "BALANCE"
            ? `Facture de solde du devis N° ${q.reference}, exigible à la livraison.`
            : q.subtitle,
          deliveryDate: opts.deliveryDate ?? null,
          paymentTerms: kind === "BALANCE"
            ? "Solde exigible à la livraison."
            : s.invoicePaymentTerms,
          ...totalsForDb(totals),
          deductions: deductions,
          deductedTtc: dec2(bal.deductedTtc),
          netToPay: dec2(bal.netToPay),
          lines: { create: linesForDb(lines) },
        },
      });
    }
    await audit(tx, actor, "invoice.createFromQuote", "INVOICE", created.id,
      `${TYPE_LABEL[created.type]} (brouillon) créée depuis le devis ${q.reference}`, { quoteId, kind });
    return created;
  });
}

// ---------------------------------------------------------------- édition / soumission

export async function updateInvoice(actor: Actor, id: string, input: unknown) {
  assertCan(actor, "invoice.editDraft");
  const data = invoiceSchema.parse(input);
  return db.$transaction(async (tx) => {
    const inv = await tx.invoice.findUnique({ where: { id }, include: { lines: true } });
    if (!inv) throw notFound();
    if (!["DRAFT", "PENDING_APPROVAL"].includes(inv.status)) {
      throw conflict("Facture émise : non modifiable. Émettez un avoir ou une facture rectificative.");
    }
    if (inv.type === "CREDIT_NOTE" && actor.role !== "CEO") throw forbidden();
    if (actor.role !== "CEO" && inv.createdById !== actor.id) throw forbidden();
    // Les lignes d'un acompte / solde sont dictées par le devis : seules les mentions sont modifiables.
    const linesLocked = (inv.type === "DEPOSIT" || inv.type === "BALANCE") && !inv.isRectification;
    const common = {
      status: "DRAFT" as const,
      submittedAt: null,
      hubspotDealId: data.hubspotDealId,
      title: data.title,
      subtitle: data.subtitle,
      projectName: data.projectName,
      deliveryDate: data.deliveryDate,
      paymentTerms: data.paymentTerms,
      notes: data.notes,
      reason: data.reason,
    };
    if (linesLocked) {
      const updated = await tx.invoice.update({ where: { id }, data: common });
      await audit(tx, actor, "invoice.update", "INVOICE", id, "Mentions de la facture modifiées (brouillon)");
      return updated;
    }
    const totals = computeTotals(data.lines);
    if (totals.totalTtc <= 0) throw invalid("Le total doit être positif.");
    if (inv.type === "CREDIT_NOTE" && inv.relatedInvoiceId) {
      await assertCreditWithinLimit(tx, inv.relatedInvoiceId, totals.totalTtc, inv.id);
    }
    await tx.invoiceLine.deleteMany({ where: { invoiceId: id } });
    const updated = await tx.invoice.update({
      where: { id },
      data: {
        ...common,
        clientId: inv.type === "CREDIT_NOTE" ? inv.clientId : data.clientId,
        ...totalsForDb(totals),
        netToPay: dec2(totals.totalTtc),
        lines: { create: linesForDb(data.lines) },
      },
    });
    await audit(tx, actor, "invoice.update", "INVOICE", id, "Brouillon de facture modifié", {
      before: num(inv.totalTtc),
      after: totals.totalTtc / 100,
    });
    return updated;
  });
}

export async function submitInvoice(actor: Actor, id: string) {
  assertCan(actor, "invoice.submit");
  return db.$transaction(async (tx) => {
    const inv = await tx.invoice.findUnique({ where: { id } });
    if (!inv) throw notFound();
    if (inv.status !== "DRAFT") throw conflict("Seul un brouillon peut être soumis.");
    const updated = await tx.invoice.update({
      where: { id },
      data: { status: "PENDING_APPROVAL", submittedAt: new Date(), rejectionComment: null },
    });
    await audit(tx, actor, "invoice.submit", "INVOICE", id, `${TYPE_LABEL[inv.type]} soumise à la validation du CEO`);
    return updated;
  });
}

export async function rejectInvoice(actor: Actor, id: string, comment: string) {
  assertCan(actor, "invoice.approveAndIssue");
  if (!comment?.trim()) throw invalid("Un motif de refus est requis.");
  return db.$transaction(async (tx) => {
    const inv = await tx.invoice.findUnique({ where: { id } });
    if (!inv) throw notFound();
    if (inv.status !== "PENDING_APPROVAL") throw conflict("Cette facture n'est pas en attente de validation.");
    const updated = await tx.invoice.update({
      where: { id },
      data: { status: "DRAFT", rejectionComment: comment.trim(), submittedAt: null },
    });
    await audit(tx, actor, "invoice.reject", "INVOICE", id, `Facture renvoyée en brouillon : ${comment.trim()}`);
    return updated;
  });
}

export async function deleteDraftInvoice(actor: Actor, id: string) {
  assertCan(actor, "invoice.editDraft");
  return db.$transaction(async (tx) => {
    const inv = await tx.invoice.findUnique({ where: { id } });
    if (!inv) throw notFound();
    if (inv.number != null || inv.status !== "DRAFT") throw conflict("Seul un brouillon non émis peut être supprimé.");
    if (actor.role !== "CEO" && inv.createdById !== actor.id) throw forbidden();
    await tx.invoice.delete({ where: { id } });
    await audit(tx, actor, "invoice.delete", "INVOICE", id, `Brouillon de facture supprimé : ${inv.title}`);
  });
}

// ---------------------------------------------------------------- approbation + émission

export async function approveAndIssueInvoice(actor: Actor, id: string, opts: { applySignature: boolean }) {
  assertCan(actor, "invoice.approveAndIssue");
  if (opts.applySignature) assertCan(actor, "signature.apply");
  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Invoice" WHERE id = ${id} FOR UPDATE`;
    const inv = await tx.invoice.findUnique({ where: { id }, include: { client: true, lines: true } });
    if (!inv) throw notFound();
    if (inv.status !== "PENDING_APPROVAL") throw conflict("Cette facture n'est pas en attente de validation.");
    assertNotSelfApproval(actor, inv.createdById);

    const s = await getSettings(tx);
    if (isProduction() && !s.accountantValidatedAt) {
      throw conflict("Émission bloquée : les modèles et traitements fiscaux doivent être validés par le comptable (Paramètres).");
    }

    // Recalcul systématique à l'émission (jamais confiance dans les totaux stockés)
    const totals = totalsOfDbLines(inv.lines);
    let deductions: Deduction[] = [];
    let netToPay = totals.totalTtc;

    if (inv.type === "BALANCE") {
      if (!inv.quoteId) throw conflict("Facture de solde sans devis.");
      const deps = await tx.invoice.findMany({
        where: { quoteId: inv.quoteId, type: "DEPOSIT", status: { in: ACTIVE_ISSUED } },
      });
      deductions = deps.map(depositDeduction).filter((d): d is Deduction => d != null);
      netToPay = balanceAmounts(totals, deductions).netToPay;
    }
    if (inv.type === "CREDIT_NOTE") {
      if (!inv.relatedInvoiceId) throw conflict("Avoir sans facture d'origine.");
      await assertCreditWithinLimit(tx, inv.relatedInvoiceId, totals.totalTtc, inv.id);
    }
    if (inv.isRectification && inv.relatedInvoiceId) {
      const orig = await tx.invoice.findUnique({ where: { id: inv.relatedInvoiceId } });
      if (orig && orig.status !== "CANCELLED") {
        throw conflict(`Émettez d'abord l'avoir total annulant la facture ${orig.reference}.`);
      }
    }

    const issueDate = todayUtc();
    const year = issueDate.getUTCFullYear();
    const number = await allocateNumber(tx, "INVOICE", year);
    const reference = formatReference(number, year, s.numberPadding);
    const dueDate =
      inv.type === "CREDIT_NOTE"
        ? null
        : inv.type === "DEPOSIT"
          ? issueDate
          : inv.type === "BALANCE" && inv.deliveryDate
            ? inv.deliveryDate
            : addDays(issueDate, s.invoiceDueDays);

    const issued = await tx.invoice.update({
      where: { id },
      data: {
        status: inv.type === "CREDIT_NOTE" ? "PAID" : "ISSUED",
        number,
        year,
        reference,
        issueDate,
        dueDate,
        clientSnapshot: clientSnapshot(inv.client),
        ...totalsForDb(totals),
        deductions: inv.type === "BALANCE" ? deductions : undefined,
        deductedTtc: dec2(totals.totalTtc - netToPay),
        netToPay: dec2(netToPay),
        approvedAt: new Date(),
        approvedById: actor.id,
        signed: opts.applySignature,
      },
    });

    if (inv.type === "CREDIT_NOTE" && inv.relatedInvoiceId) {
      const orig = await tx.invoice.findUniqueOrThrow({ where: { id: inv.relatedInvoiceId } });
      const credited = cents(orig.amountCredited) + totals.totalTtc;
      await tx.invoice.update({
        where: { id: orig.id },
        data: {
          amountCredited: dec2(credited),
          status: statusFor(cents(orig.netToPay), cents(orig.amountPaid), credited),
        },
      });
      await audit(tx, actor, "invoice.credited", "INVOICE", orig.id,
        `Facture ${orig.reference} créditée par l'avoir ${reference}`, { amount: totals.totalTtc / 100 });
    }

    await audit(tx, actor, "invoice.issue", "INVOICE", id,
      `${TYPE_LABEL[inv.type]} ${reference} approuvée et émise${opts.applySignature ? " avec cachet et signature" : ""}`,
      { number, year, totalTtc: totals.totalTtc / 100, netToPay: netToPay / 100, signed: opts.applySignature });
    return issued;
  });
}

/** Statut d'une facture émise selon les paiements et avoirs (montants en centimes). */
export function statusFor(netToPay: number, paid: number, credited: number): InvoiceStatus {
  if (credited >= netToPay && credited > 0) return "CANCELLED";
  if (remainingDue(netToPay, paid, credited) === 0) return "PAID";
  if (paid > 0) return "PARTIALLY_PAID";
  return "ISSUED";
}

export function isOverdue(inv: { status: InvoiceStatus; dueDate: Date | null; type: InvoiceType }, today = todayUtc()) {
  return inv.type !== "CREDIT_NOTE" && ["ISSUED", "PARTIALLY_PAID"].includes(inv.status) && inv.dueDate != null && inv.dueDate < today;
}

// ---------------------------------------------------------------- avoirs & rectification

async function assertCreditWithinLimit(tx: Tx, invoiceId: string, amount: number, excludeId?: string) {
  const orig = await tx.invoice.findUnique({ where: { id: invoiceId } });
  if (!orig || orig.number == null) throw conflict("Un avoir ne peut viser qu'une facture émise.");
  if (orig.type === "CREDIT_NOTE") throw conflict("Impossible d'émettre un avoir sur un avoir.");
  const pending = await tx.invoice.findMany({
    where: {
      relatedInvoiceId: invoiceId,
      type: "CREDIT_NOTE",
      status: { in: ["DRAFT", "PENDING_APPROVAL"] },
      id: excludeId ? { not: excludeId } : undefined,
    },
  });
  const pendingTotal = pending.reduce((s, p) => s + cents(p.totalTtc), 0);
  const available = cents(orig.netToPay) - cents(orig.amountCredited) - pendingTotal;
  if (amount > available) {
    throw conflict(`L'avoir dépasse le montant restant créditable (${(available / 100).toFixed(2)} MAD).`);
  }
  return orig;
}

/** Lignes d'un avoir total : reprend les lignes ; pour un solde, neutralise les acomptes déduits. */
function fullCreditLines(inv: Invoice & { lines: Parameters<typeof dbLineToData>[0][] }): LineData[] {
  const lines = inv.lines.map(dbLineToData);
  if (inv.type === "BALANCE") {
    for (const d of (inv.deductions as Deduction[] | null) ?? []) {
      for (const g of d.breakdown) {
        lines.push({
          designation: `Déduction acompte N° ${d.reference}`,
          description: null,
          quantity: 1,
          unit: "forfait",
          unitPrice: -g.base / 100,
          vatRate: g.rate,
          discountPercent: 0,
        });
      }
    }
  }
  return lines;
}

export async function createCreditNote(
  actor: Actor,
  invoiceId: string,
  opts: { reason: string; full: boolean; lines?: unknown[] },
) {
  assertCan(actor, "invoice.creditNote");
  if (!opts.reason?.trim()) throw invalid("Le motif de l'avoir est obligatoire.");
  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Invoice" WHERE id = ${invoiceId} FOR UPDATE`;
    const inv = await tx.invoice.findUnique({ where: { id: invoiceId }, include: { lines: { orderBy: { position: "asc" } } } });
    if (!inv) throw notFound();
    const lines: LineData[] = opts.full
      ? fullCreditLines(inv)
      : (opts.lines ?? []).map((l) => lineSchema.parse(l));
    if (lines.length === 0) throw invalid("Aucune ligne d'avoir.");
    const totals = computeTotals(lines);
    if (totals.totalTtc <= 0) throw invalid("Le montant de l'avoir doit être positif.");
    await assertCreditWithinLimit(tx, invoiceId, totals.totalTtc);
    const cn = await tx.invoice.create({
      data: {
        type: "CREDIT_NOTE",
        clientId: inv.clientId,
        quoteId: inv.quoteId,
        relatedInvoiceId: inv.id,
        hubspotDealId: inv.hubspotDealId,
        title: `Avoir sur facture N° ${inv.reference}`,
        subtitle: opts.full ? "Annulation totale de la facture" : "Avoir partiel",
        projectName: inv.projectName,
        reason: opts.reason.trim(),
        ...totalsForDb(totals),
        netToPay: dec2(totals.totalTtc),
        createdById: actor.id,
        lines: { create: linesForDb(lines) },
      },
    });
    await audit(tx, actor, "creditNote.create", "INVOICE", cn.id,
      `Avoir (brouillon) créé sur la facture ${inv.reference} : ${opts.reason.trim()}`, { amount: totals.totalTtc / 100 });
    return cn;
  });
}

/**
 * Facture rectificative : avoir total (brouillon) + nouvelle facture (brouillon) reprenant le contenu,
 * à corriger puis à faire valider. La rectificative ne peut être émise qu'après l'avoir.
 */
export async function rectifyInvoice(actor: Actor, invoiceId: string, reason: string) {
  assertCan(actor, "invoice.creditNote");
  const cn = await createCreditNote(actor, invoiceId, { reason, full: true });
  return db.$transaction(async (tx) => {
    const inv = await tx.invoice.findUniqueOrThrow({ where: { id: invoiceId }, include: { lines: true } });
    const copy = await tx.invoice.create({
      data: {
        type: inv.type === "CREDIT_NOTE" ? "STANDARD" : inv.type,
        clientId: inv.clientId,
        quoteId: inv.quoteId,
        relatedInvoiceId: inv.id,
        isRectification: true,
        hubspotDealId: inv.hubspotDealId,
        title: inv.title,
        subtitle: inv.subtitle,
        projectName: inv.projectName,
        depositPercent: inv.depositPercent,
        deliveryDate: inv.deliveryDate,
        paymentTerms: inv.paymentTerms,
        notes: inv.notes,
        reason: `Rectifie la facture N° ${inv.reference} — ${reason.trim()}`,
        totalHt: inv.totalHt,
        totalVat: inv.totalVat,
        totalTtc: inv.totalTtc,
        vatBreakdown: inv.vatBreakdown ?? undefined,
        deductions: inv.deductions ?? undefined,
        deductedTtc: inv.deductedTtc,
        netToPay: inv.netToPay,
        createdById: actor.id,
        lines: {
          create: inv.lines
            .sort((a, b) => a.position - b.position)
            .map(({ id: _i, invoiceId: _v, ...l }) => l),
        },
      },
    });
    await audit(tx, actor, "invoice.rectify", "INVOICE", copy.id,
      `Facture rectificative (brouillon) créée pour ${inv.reference}`, { creditNoteId: cn.id });
    return { creditNote: cn, rectification: copy };
  });
}
