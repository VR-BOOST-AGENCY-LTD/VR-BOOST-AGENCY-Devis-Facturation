// Tests d'intégration sur PostgreSQL réel (base vrboost_test) : workflow, numérotation, finances, sécurité.
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import type { Actor } from "@/lib/permissions";
import { configureSequence } from "@/lib/numbering";
import * as quotes from "@/server/quotes";
import * as invoices from "@/server/invoices";
import * as payments from "@/server/payments";
import * as admin from "@/server/admin";
import { cents } from "@/server/common";
import { archiveOfficialPdf } from "@/pdf/render";

let ceo: Actor;
let meryem: Actor;
let clientId: string;

const line = (unitPrice: number, extra: Record<string, unknown> = {}) => ({
  designation: "Prestation", description: "Détail", quantity: 1, unit: "forfait", unitPrice, vatRate: 20, discountPercent: 0, ...extra,
});
const quoteInput = (lines = [line(10_000)]) => ({
  clientId, title: "Production audiovisuelle", paymentTerms: "Libre", depositPercent: 30, validityDays: 10, lines,
});

async function reset() {
  const tables = ["AuditLog", "DocumentFile", "Payment", "InvoiceLine", "Invoice", "QuoteLine", "Quote", "Client", "CatalogItem", "Sequence", "Session", "User", "CompanySettings"];
  await db.$executeRawUnsafe(`TRUNCATE ${tables.map((t) => `"${t}"`).join(", ")} RESTART IDENTITY CASCADE`);
  await db.companySettings.create({ data: { id: 1 } });
  const c = await db.user.create({ data: { email: "ceo@test", name: "CEO", role: "CEO", passwordHash: "x" } });
  const m = await db.user.create({ data: { email: "meryem@test", name: "Meryem", role: "SALES", passwordHash: "x" } });
  ceo = { id: c.id, role: "CEO" };
  meryem = { id: m.id, role: "SALES" };
  const year = new Date().getFullYear();
  for (const series of ["QUOTE", "INVOICE"] as const) {
    await db.sequence.create({ data: { series, year, lastNumber: 454 } });
  }
  clientId = (await db.client.create({ data: { name: "Yakeey MEA", ice: "003194466000072" } })).id;
}

async function confirmSequences() {
  const year = new Date().getFullYear();
  await admin.setSequence(ceo, "QUOTE", year, 454);
  await admin.setSequence(ceo, "INVOICE", year, 454);
}

/** Devis approuvé puis accepté. */
async function acceptedQuote(lines = [line(10_000)]) {
  const q = await quotes.createQuote(meryem, quoteInput(lines));
  await quotes.submitQuote(meryem, q.id);
  await quotes.approveQuote(ceo, q.id, { applySignature: true });
  await quotes.markQuoteSent(meryem, q.id);
  await quotes.markQuoteOutcome(meryem, q.id, "ACCEPTED");
  return q.id;
}

async function issue(invoiceId: string, by: Actor = meryem) {
  await invoices.submitInvoice(by, invoiceId);
  return invoices.approveAndIssueInvoice(ceo, invoiceId, { applySignature: true });
}

beforeAll(reset);
beforeEach(reset);

describe("Numérotation", () => {
  it("bloque toute émission tant que le CEO n'a pas confirmé les derniers numéros", async () => {
    const q = await quotes.createQuote(meryem, quoteInput());
    await quotes.submitQuote(meryem, q.id);
    await expect(quotes.approveQuote(ceo, q.id, { applySignature: false })).rejects.toThrow(/non confirmée/);
  });

  it("DEVIS et FACTURES : séries indépendantes démarrant à 00455/AAAA", async () => {
    await confirmSequences();
    const year = new Date().getFullYear();
    const qid = await acceptedQuote();
    expect((await db.quote.findUniqueOrThrow({ where: { id: qid } })).reference).toBe(`00455/${year}`);
    const q2 = await quotes.createQuote(meryem, quoteInput());
    await quotes.submitQuote(meryem, q2.id);
    expect((await quotes.approveQuote(ceo, q2.id, { applySignature: false })).reference).toBe(`00456/${year}`);
    const inv = await invoices.createInvoiceFromQuote(meryem, qid, "STANDARD");
    expect(inv.number).toBeNull(); // pas de numéro au brouillon
    expect((await issue(inv.id)).reference).toBe(`FAC-00455/${String(year).slice(-2)}`);
  });

  it("aucun doublon sous émissions concurrentes (20 approbations simultanées)", async () => {
    await confirmSequences();
    const ids: string[] = [];
    for (let i = 0; i < 20; i++) {
      const q = await quotes.createQuote(meryem, quoteInput());
      await quotes.submitQuote(meryem, q.id);
      ids.push(q.id);
    }
    const results = await Promise.allSettled(ids.map((id) => quotes.approveQuote(ceo, id, { applySignature: false })));
    expect(results.every((r) => r.status === "fulfilled")).toBe(true);
    const nums = (await db.quote.findMany({ where: { id: { in: ids } } })).map((q) => q.number!).sort((a, b) => a - b);
    expect(new Set(nums).size).toBe(20);
    expect(nums[0]).toBe(455);
    expect(nums[19]).toBe(474); // séquence continue, sans trou
  });

  it("double approbation simultanée du même devis : un seul numéro consommé", async () => {
    await confirmSequences();
    const q = await quotes.createQuote(meryem, quoteInput());
    await quotes.submitQuote(meryem, q.id);
    const r = await Promise.allSettled([1, 2, 3].map(() => quotes.approveQuote(ceo, q.id, { applySignature: false })));
    expect(r.filter((x) => x.status === "fulfilled")).toHaveLength(1);
    const seq = await db.sequence.findFirstOrThrow({ where: { series: "QUOTE" } });
    expect(seq.lastNumber).toBe(455);
  });

  it("impossible de redescendre sous un numéro déjà attribué", async () => {
    await confirmSequences();
    await acceptedQuote();
    const year = new Date().getFullYear();
    await expect(admin.setSequence(ceo, "QUOTE", year, 400)).rejects.toThrow(/déjà été attribué/);
    await expect(db.$transaction((tx) => configureSequence(tx, "QUOTE", year, 454, ceo.id))).rejects.toThrow();
  });
});

describe("Permissions et workflow", () => {
  beforeEach(confirmSequences);

  it("Meryem ne peut pas approuver, signer, ni modifier les séquences", async () => {
    const q = await quotes.createQuote(meryem, quoteInput());
    await quotes.submitQuote(meryem, q.id);
    await expect(quotes.approveQuote(meryem, q.id, { applySignature: false })).rejects.toThrow(/non autorisée/);
    await expect(admin.setSequence(meryem, "QUOTE", 2026, 999)).rejects.toThrow(/non autorisée/);
    await expect(admin.updateSettings(meryem, {})).rejects.toThrow(/non autorisée/);
  });

  it("conditions par défaut imposées à Meryem (acompte 50 %, validité 30 j) sauf autorisation", async () => {
    const q = await quotes.createQuote(meryem, quoteInput());
    expect(Number(q.depositPercent)).toBe(50);
    expect(q.validityDays).toBe(30);
    expect(q.paymentTerms).toMatch(/50 %/);
    await db.companySettings.update({ where: { id: 1 }, data: { salesCanEditTerms: true } });
    const q2 = await quotes.createQuote(meryem, quoteInput());
    expect(Number(q2.depositPercent)).toBe(30);
  });

  it("prix libres : n'importe quelle prestation hors catalogue", async () => {
    const q = await quotes.createQuote(meryem, quoteInput([line(12_345.67, { designation: "Prestation sur mesure", quantity: 2.5, unit: "jour", discountPercent: 5 })]));
    expect(cents(q.totalHt)).toBe(Math.round(12_345.67 * 2.5 * 0.95 * 100));
  });

  it("devis approuvé : toute modification exige une nouvelle version revalidée", async () => {
    const q = await quotes.createQuote(meryem, quoteInput());
    await quotes.submitQuote(meryem, q.id);
    await quotes.approveQuote(ceo, q.id, { applySignature: false });
    await expect(quotes.updateQuote(meryem, q.id, quoteInput([line(1)]))).rejects.toThrow(/nouvelle version/);
    // Contournement direct en base également bloqué par trigger
    await expect(db.quote.update({ where: { id: q.id }, data: { totalTtc: "1.00" } })).rejects.toThrow();

    const v2 = await quotes.reviseQuote(meryem, q.id);
    expect(v2.version).toBe(2);
    expect(v2.number).toBe(455);
    await quotes.updateQuote(meryem, v2.id, quoteInput([line(20_000)]));
    await quotes.submitQuote(meryem, v2.id);
    await quotes.approveQuote(ceo, v2.id, { applySignature: false });
    expect((await db.quote.findUniqueOrThrow({ where: { id: q.id } })).status).toBe("SUPERSEDED");
    expect((await db.quote.findUniqueOrThrow({ where: { id: v2.id } })).reference).toMatch(/^00455\//);
    expect((await db.sequence.findFirstOrThrow({ where: { series: "QUOTE" } })).lastNumber).toBe(455);
  });

  it("refus CEO avec motif renvoie en brouillon", async () => {
    const q = await quotes.createQuote(meryem, quoteInput());
    await quotes.submitQuote(meryem, q.id);
    await expect(quotes.rejectQuote(ceo, q.id, "")).rejects.toThrow();
    const r = await quotes.rejectQuote(ceo, q.id, "Revoir le prix");
    expect(r.status).toBe("DRAFT");
    expect(r.rejectionComment).toBe("Revoir le prix");
  });

  it("facture émise non modifiable (service et base)", async () => {
    const inv = await invoices.createInvoice(meryem, { clientId, title: "Facture", lines: [line(1000)] });
    await issue(inv.id);
    await expect(invoices.updateInvoice(meryem, inv.id, { clientId, title: "X", lines: [line(1)] })).rejects.toThrow(/non modifiable/);
    await expect(db.invoice.update({ where: { id: inv.id }, data: { totalTtc: "1.00" } })).rejects.toThrow(/non modifiable/);
    await expect(db.invoice.delete({ where: { id: inv.id } })).rejects.toThrow(/suppression interdite/);
    await expect(db.invoiceLine.deleteMany({ where: { invoiceId: inv.id } })).rejects.toThrow();
  });

  it("journal d'audit non modifiable et non effaçable", async () => {
    await quotes.createQuote(meryem, quoteInput());
    const log = await db.auditLog.findFirstOrThrow({ where: { action: "quote.create" } });
    expect(log.userId).toBe(meryem.id);
    await expect(db.auditLog.update({ where: { id: log.id }, data: { summary: "x" } })).rejects.toThrow(/ajout seul/);
    await expect(db.auditLog.delete({ where: { id: log.id } })).rejects.toThrow(/ajout seul/);
  });

  it("seul un devis accepté peut être facturé", async () => {
    const q = await quotes.createQuote(meryem, quoteInput());
    await expect(invoices.createInvoiceFromQuote(meryem, q.id, "DEPOSIT")).rejects.toThrow(/accepté/);
  });
});

describe("Acomptes, soldes, paiements, avoirs", () => {
  beforeEach(confirmSequences);

  it("acompte 50 % + solde 50 % : aucun double comptage", async () => {
    const qid = await acceptedQuote([line(10_000), line(2_500, { vatRate: 10 })]);
    const quote = await db.quote.findUniqueOrThrow({ where: { id: qid } });
    const ttc = cents(quote.totalTtc); // 12 000 + 2 750 = 14 750
    expect(ttc).toBe(1_475_000);

    const dep = await invoices.createInvoiceFromQuote(meryem, qid, "DEPOSIT", { percent: 50 });
    const depIssued = await issue(dep.id);
    expect(cents(depIssued.totalTtc)).toBe(737_500);
    expect(depIssued.dueDate?.getTime()).toBe(depIssued.issueDate?.getTime()); // exigible avant démarrage

    // garde-fous
    await expect(invoices.createInvoiceFromQuote(meryem, qid, "STANDARD")).rejects.toThrow(/solde/);
    await expect(invoices.createInvoiceFromQuote(meryem, qid, "DEPOSIT", { percent: 60 })).rejects.toThrow(/dépasserait/);

    const bal = await invoices.createInvoiceFromQuote(meryem, qid, "BALANCE");
    const balIssued = await issue(bal.id);
    expect(cents(balIssued.totalTtc)).toBe(ttc); // le solde reprend toutes les prestations
    expect(cents(balIssued.netToPay)).toBe(ttc - 737_500); // et déduit l'acompte une seule fois
    expect(cents(depIssued.netToPay) + cents(balIssued.netToPay)).toBe(ttc);
    await expect(invoices.createInvoiceFromQuote(meryem, qid, "BALANCE")).rejects.toThrow(/clôture/);
  });

  it("solde refusé tant qu'un acompte est en brouillon", async () => {
    const qid = await acceptedQuote();
    await invoices.createInvoiceFromQuote(meryem, qid, "DEPOSIT");
    await expect(invoices.createInvoiceFromQuote(meryem, qid, "BALANCE")).rejects.toThrow(/brouillon/);
  });

  it("paiements partiels, statut, reste à payer, annulation tracée", async () => {
    const inv = await invoices.createInvoice(meryem, { clientId, title: "F", lines: [line(1000)] }); // 1 200 TTC
    await issue(inv.id);
    const date = new Date().toISOString().slice(0, 10);
    await expect(payments.recordPayment(meryem, { invoiceId: inv.id, amount: 100, date, method: "VIREMENT" })).rejects.toThrow(/non autorisée/);
    const p1 = await payments.recordPayment(ceo, { invoiceId: inv.id, amount: 500, date, method: "VIREMENT" });
    expect((await db.invoice.findUniqueOrThrow({ where: { id: inv.id } })).status).toBe("PARTIALLY_PAID");
    await expect(payments.recordPayment(ceo, { invoiceId: inv.id, amount: 700.01, date, method: "CHEQUE" })).rejects.toThrow(/reste à payer/);
    await payments.recordPayment(ceo, { invoiceId: inv.id, amount: 700, date, method: "CHEQUE" });
    expect((await db.invoice.findUniqueOrThrow({ where: { id: inv.id } })).status).toBe("PAID");
    await payments.cancelPayment(ceo, p1.id, "Chèque rejeté");
    const after = await db.invoice.findUniqueOrThrow({ where: { id: inv.id } });
    expect(after.status).toBe("PARTIALLY_PAID");
    expect(cents(after.amountPaid)).toBe(70_000);
    await expect(db.payment.delete({ where: { id: p1.id } })).rejects.toThrow(/suppression interdite/);
  });

  it("avoir total : facture annulée ; avoir plafonné ; rectificative après avoir uniquement", async () => {
    const inv = await invoices.createInvoice(meryem, { clientId, title: "F", lines: [line(1000)] });
    await issue(inv.id);
    await expect(invoices.createCreditNote(meryem, inv.id, { reason: "x", full: true })).rejects.toThrow(/non autorisée/);
    const { creditNote, rectification } = await invoices.rectifyInvoice(ceo, inv.id, "Erreur de prix");
    // la rectificative ne peut être émise avant l'avoir
    await invoices.updateInvoice(ceo, rectification.id, { clientId, title: "F corrigée", lines: [line(900)] });
    await invoices.submitInvoice(ceo, rectification.id);
    await expect(invoices.approveAndIssueInvoice(ceo, rectification.id, { applySignature: false })).rejects.toThrow(/avoir total/);
    // second avoir au-delà du montant restant refusé
    await expect(invoices.createCreditNote(ceo, inv.id, { reason: "bis", full: false, lines: [line(10)] })).rejects.toThrow(/dépasse/);
    await invoices.submitInvoice(ceo, creditNote.id);
    const cn = await invoices.approveAndIssueInvoice(ceo, creditNote.id, { applySignature: true });
    expect(cn.number).toBe(456); // les avoirs partagent la série FACTURES
    expect(cn.reference).toBe(`AV-00456/${String(new Date().getFullYear()).slice(-2)}`);
    expect((await db.invoice.findUniqueOrThrow({ where: { id: inv.id } })).status).toBe("CANCELLED");
    await invoices.rejectInvoice(ceo, rectification.id, "relance");
    await invoices.submitInvoice(ceo, rectification.id);
    const rect = await invoices.approveAndIssueInvoice(ceo, rectification.id, { applySignature: true });
    expect(cents(rect.totalTtc)).toBe(108_000);
  });

  it("solde : un acompte partiellement crédité n'est déduit que pour son montant net", async () => {
    const qid = await acceptedQuote(); // 12 000 TTC
    const dep = await invoices.createInvoiceFromQuote(meryem, qid, "DEPOSIT", { percent: 50 });
    await issue(dep.id); // 6 000 TTC
    const cn = await invoices.createCreditNote(ceo, dep.id, { reason: "geste", full: false, lines: [line(1000)] }); // 1 200
    await invoices.submitInvoice(ceo, cn.id);
    await invoices.approveAndIssueInvoice(ceo, cn.id, { applySignature: false });
    const bal = await invoices.createInvoiceFromQuote(meryem, qid, "BALANCE");
    const issued = await issue(bal.id);
    expect(cents(issued.netToPay)).toBe(1_200_000 - 480_000);
  });
});

describe("Archivage PDF", () => {
  beforeEach(confirmSequences);

  it("PDF officiel archivé une seule fois, empreinte SHA-256, multipage", async () => {
    const lines = Array.from({ length: 25 }, (_, i) => line(1000 + i, { designation: `Prestation ${i + 1}` }));
    const qid = await acceptedQuote(lines);
    const a = await archiveOfficialPdf("QUOTE", qid, ceo.id);
    const b = await archiveOfficialPdf("QUOTE", qid, ceo.id);
    expect(a?.id).toBe(b?.id);
    expect(a?.sha256).toMatch(/^[a-f0-9]{64}$/);
    const pages = (Buffer.from(a!.data).toString("latin1").match(/\/Type\s*\/Page[^s]/g) ?? []).length;
    expect(pages).toBeGreaterThanOrEqual(3);
    await expect(db.documentFile.delete({ where: { id: a!.id } })).rejects.toThrow(/ajout seul/);
  });

  it("brouillon : pas d'archive officielle", async () => {
    const q = await quotes.createQuote(meryem, quoteInput());
    expect(await archiveOfficialPdf("QUOTE", q.id, ceo.id)).toBeNull();
  });
});
