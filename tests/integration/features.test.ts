// Notifications, relances, duplication, comptes, bon pour accord — SMTP simulé.
import { beforeEach, describe, expect, it, vi } from "vitest";

type Mail = { to: string[]; cc?: string[]; subject: string; text: string; attachments?: { filename: string }[] };
const sent: Mail[] = [];
vi.mock("nodemailer", () => ({
  default: { createTransport: () => ({ sendMail: async (m: Mail) => { sent.push(m); return { messageId: "<t@vrb>" }; } }) },
}));

import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import type { Actor } from "@/lib/permissions";
import * as quotes from "@/server/quotes";
import * as invoices from "@/server/invoices";
import * as admin from "@/server/admin";
import * as users from "@/server/users";
import { notifyDecision, notifySubmitted } from "@/server/notify";
import { dueForReminder, runAutoReminders, sendReminder } from "@/server/reminders";
import { addDays, todayUtc } from "@/lib/format";

let ceo: Actor;
let meryem: Actor;
let clientId: string;
const year = new Date().getFullYear();

beforeEach(async () => {
  Object.assign(process.env, { SMTP_HOST: "smtp.test", SMTP_USER: "interne@vrb.test", SMTP_PASSWORD: "x", SMTP_PORT: "465" });
  sent.length = 0;
  const tables = ["AuditLog", "DocumentFile", "Payment", "InvoiceLine", "Invoice", "QuoteLine", "Quote", "Client", "Sequence", "Session", "User", "CompanySettings"];
  await db.$executeRawUnsafe(`TRUNCATE ${tables.map((t) => `"${t}"`).join(", ")} RESTART IDENTITY CASCADE`);
  await db.companySettings.create({ data: { id: 1 } });
  const hash = await bcrypt.hash("MotDePasse-2026", 4);
  ceo = { id: (await db.user.create({ data: { email: "ceo@vrb.test", name: "CEO", role: "CEO", passwordHash: hash } })).id, role: "CEO" };
  meryem = { id: (await db.user.create({ data: { email: "meryem@vrb.test", name: "Meryem", role: "SALES", passwordHash: hash } })).id, role: "SALES" };
  for (const series of ["QUOTE", "INVOICE"] as const) await db.sequence.create({ data: { series, year, lastNumber: 454 } });
  await admin.setSequence(ceo, "QUOTE", year, 454);
  await admin.setSequence(ceo, "INVOICE", year, 454);
  clientId = (await db.client.create({ data: { name: "Yakeey MEA", email: "compta@yakeey.test", contactName: "Sara" } })).id;
});

const line = { designation: "Tournage", quantity: 1, unit: "forfait", unitPrice: 1000, vatRate: 20 };

async function approvedQuote() {
  const q = await quotes.createQuote(meryem, { clientId, title: "Tournage", paymentTerms: "x", lines: [line] });
  await quotes.submitQuote(meryem, q.id);
  await quotes.approveQuote(ceo, q.id, { applySignature: true });
  return q.id;
}

async function overdueInvoice(daysLate = 10) {
  const inv = await invoices.createInvoice(meryem, { clientId, title: "Facture", lines: [line] });
  await invoices.submitInvoice(meryem, inv.id);
  await invoices.approveAndIssueInvoice(ceo, inv.id, { applySignature: true });
  await db.invoice.update({ where: { id: inv.id }, data: { dueDate: addDays(todayUtc(), -daysLate) } });
  return inv.id;
}

describe("Notifications internes", () => {
  it("soumission : le CEO est prévenu ; décision : l'auteur est prévenu avec le motif", async () => {
    const q = await quotes.createQuote(meryem, { clientId, title: "Tournage", paymentTerms: "x", lines: [line] });
    await quotes.submitQuote(meryem, q.id);
    await notifySubmitted("QUOTE", q.id, meryem);
    expect(sent[0].to).toEqual(["ceo@vrb.test"]);
    expect(sent[0].subject).toMatch(/^\[À valider\] Devis/);
    expect(sent[0].text).toMatch(/\/devis\//);

    await quotes.rejectQuote(ceo, q.id, "Revoir la remise");
    await notifyDecision("QUOTE", q.id, ceo, "rejected", "Revoir la remise");
    expect(sent[1].to).toEqual(["meryem@vrb.test"]);
    expect(sent[1].subject).toMatch(/^\[À corriger\]/);
    expect(sent[1].text).toMatch(/Revoir la remise/);
  });

  it("pas de notification si désactivées, ni à soi-même", async () => {
    const q = await quotes.createQuote(ceo, { clientId, title: "T", paymentTerms: "x", lines: [line] });
    await notifySubmitted("QUOTE", q.id, ceo); // seul CEO actif = l'auteur
    await notifyDecision("QUOTE", q.id, ceo, "approved");
    await db.companySettings.update({ where: { id: 1 }, data: { notificationsEnabled: false } });
    await notifySubmitted("QUOTE", q.id, meryem);
    expect(sent).toHaveLength(0);
  });
});

describe("Relances des factures en retard", () => {
  it("relance manuelle : PDF joint, copie interne, compteur incrémenté, ton progressif", async () => {
    const id = await overdueInvoice();
    await sendReminder(meryem, id);
    await sendReminder(meryem, id);
    expect(sent[0].to).toEqual(["compta@yakeey.test"]);
    expect(sent[0].cc).toEqual(["interne@vrb.test"]);
    expect(sent[0].subject).toMatch(/^Rappel de paiement — Facture N° FAC-00455/);
    expect(sent[0].attachments?.[0].filename).toMatch(/^FACTURE_FAC-00455/);
    expect(sent[1].subject).toMatch(/^Deuxième relance/);
    const inv = await db.invoice.findUniqueOrThrow({ where: { id } });
    expect(inv.reminderCount).toBe(2);
  });

  it("automatique : désactivée par défaut, puis respecte intervalle et maximum", async () => {
    const id = await overdueInvoice();
    expect((await runAutoReminders()).enabled).toBe(false);
    await db.companySettings.update({ where: { id: 1 }, data: { remindersEnabled: true, reminderIntervalDays: 7, reminderMaxCount: 2 } });
    expect((await runAutoReminders()).sent).toBe(1);
    expect((await runAutoReminders()).sent).toBe(0); // intervalle de 7 jours non écoulé
    await db.invoice.update({ where: { id }, data: { lastReminderAt: addDays(new Date(), -8) } });
    expect((await runAutoReminders()).sent).toBe(1);
    await db.invoice.update({ where: { id }, data: { lastReminderAt: addDays(new Date(), -30) } });
    expect((await runAutoReminders()).sent).toBe(0); // maximum atteint
  });

  it("factures non échues, payées ou sans e-mail client : ignorées", async () => {
    await overdueInvoice(-5); // échéance future
    const paid = await overdueInvoice();
    await db.invoice.update({ where: { id: paid }, data: { status: "PAID" } });
    const noMail = await overdueInvoice();
    await db.client.update({ where: { id: clientId }, data: { email: null } });
    expect(await dueForReminder()).toHaveLength(0);
    await expect(sendReminder(meryem, noMail)).rejects.toThrow(/adresse e-mail/);
  });
});

describe("Dupliquer un devis", () => {
  it("nouveau brouillon sans numéro, mêmes prestations, source intacte", async () => {
    const src = await approvedQuote();
    const copy = await quotes.duplicateQuote(meryem, src);
    expect(copy.status).toBe("DRAFT");
    expect(copy.number).toBeNull();
    expect(copy.version).toBe(1);
    const lines = await db.quoteLine.findMany({ where: { quoteId: copy.id } });
    expect(lines).toHaveLength(1);
    expect(lines[0].designation).toBe("Tournage");
    expect((await db.quote.findUniqueOrThrow({ where: { id: src } })).status).toBe("APPROVED");
  });
});

describe("Comptes", () => {
  it("changement de son mot de passe : contrôle de l'actuel, autres sessions révoquées", async () => {
    await db.session.createMany({ data: [
      { tokenHash: "garder", userId: meryem.id, expiresAt: addDays(new Date(), 1) },
      { tokenHash: "autre", userId: meryem.id, expiresAt: addDays(new Date(), 1) },
    ] });
    await expect(users.changeOwnPassword(meryem, { current: "faux", next: "NouveauMdp-2026", confirm: "NouveauMdp-2026" }, "garder")).rejects.toThrow(/actuel incorrect/);
    await expect(users.changeOwnPassword(meryem, { current: "MotDePasse-2026", next: "court1", confirm: "court1" }, "garder")).rejects.toThrow(/trop court/);
    await users.changeOwnPassword(meryem, { current: "MotDePasse-2026", next: "NouveauMdp-2026", confirm: "NouveauMdp-2026" }, "garder");
    const s = await db.session.findMany({ where: { userId: meryem.id } });
    expect(s.map((x) => x.tokenHash)).toEqual(["garder"]);
    const u = await db.user.findUniqueOrThrow({ where: { id: meryem.id } });
    expect(await bcrypt.compare("NouveauMdp-2026", u.passwordHash)).toBe(true);
  });

  it("gestion réservée au CEO ; dernier CEO protégé ; désactivation immédiate", async () => {
    await expect(users.createUser(meryem, { email: "x@y.ma", name: "X", role: "SALES", password: "Abcdefgh-1234", confirm: "Abcdefgh-1234" })).rejects.toThrow(/non autorisée/);
    await expect(users.updateUser(ceo, ceo.id, { active: false })).rejects.toThrow(/propre compte/);
    const c2 = await users.createUser(ceo, { email: "ceo2@vrb.test", name: "CEO 2", role: "CEO", password: "Abcdefgh-1234", confirm: "Abcdefgh-1234" });
    await db.user.update({ where: { id: ceo.id }, data: { active: false } });
    await expect(users.updateUser({ id: c2.id, role: "CEO" }, c2.id, { role: "SALES" })).rejects.toThrow(/propre compte/);
    await db.user.update({ where: { id: ceo.id }, data: { active: true } });
    await db.session.create({ data: { tokenHash: "m", userId: meryem.id, expiresAt: addDays(new Date(), 1) } });
    await users.updateUser(ceo, meryem.id, { active: false });
    expect(await db.session.count({ where: { userId: meryem.id } })).toBe(0);
    await users.updateUser(ceo, c2.id, { active: false });
    await expect(users.updateUser({ id: c2.id, role: "CEO" }, ceo.id, { role: "SALES" })).rejects.toThrow();
  });
});

describe("Bon pour accord signé", () => {
  const pdf = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34]);

  it("PDF joint, devis marqué accepté, archive en ajout seul", async () => {
    const id = await approvedQuote();
    const doc = await quotes.attachSignedQuote(meryem, id, { name: "signe.pdf", type: "application/pdf", bytes: pdf }, { markAccepted: true });
    expect(doc.entityType).toBe("QUOTE_SIGNED");
    expect(doc.filename).toMatch(/^BON-POUR-ACCORD_00455-2026\.pdf$/);
    expect((await db.quote.findUniqueOrThrow({ where: { id } })).status).toBe("ACCEPTED");
    await expect(db.documentFile.delete({ where: { id: doc.id } })).rejects.toThrow(/ajout seul/);
  });

  it("refuse un format usurpé, un fichier trop lourd ou un brouillon", async () => {
    const id = await approvedQuote();
    await expect(quotes.attachSignedQuote(meryem, id, { name: "x.pdf", type: "application/pdf", bytes: new Uint8Array([1, 2, 3, 4]) }, { markAccepted: false })).rejects.toThrow(/ne correspond pas/);
    await expect(quotes.attachSignedQuote(meryem, id, { name: "x.exe", type: "application/x-msdownload", bytes: pdf }, { markAccepted: false })).rejects.toThrow(/Format/);
    const big = new Uint8Array(quotes.SIGNED_MAX_BYTES + 1); big.set(pdf);
    await expect(quotes.attachSignedQuote(meryem, id, { name: "x.pdf", type: "application/pdf", bytes: big }, { markAccepted: false })).rejects.toThrow(/volumineux/);
    const draft = await quotes.createQuote(meryem, { clientId, title: "T", paymentTerms: "x", lines: [line] });
    await expect(quotes.attachSignedQuote(meryem, draft.id, { name: "s.pdf", type: "application/pdf", bytes: pdf }, { markAccepted: true })).rejects.toThrow(/approuvé/);
  });
});
