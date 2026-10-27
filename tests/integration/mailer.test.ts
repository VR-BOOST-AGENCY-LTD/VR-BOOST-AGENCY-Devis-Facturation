// Envoi par e-mail : transport SMTP simulé (aucun e-mail réel envoyé).
import { beforeEach, describe, expect, it, vi } from "vitest";

const sent: { to: string[]; attachments: { filename: string; content: Buffer }[]; subject: string }[] = [];
vi.mock("nodemailer", () => ({
  default: { createTransport: () => ({ sendMail: async (m: (typeof sent)[number]) => { sent.push(m); return { messageId: "<test@vrb>" }; } }) },
}));

import { db } from "@/lib/db";
import type { Actor } from "@/lib/permissions";
import * as quotes from "@/server/quotes";
import * as admin from "@/server/admin";
import { draftDocumentEmail, sendDocumentEmail } from "@/server/mailer";

let ceo: Actor;
let meryem: Actor;
let clientId: string;

beforeEach(async () => {
  Object.assign(process.env, { SMTP_HOST: "smtp.test", SMTP_USER: "u@test", SMTP_PASSWORD: "x", SMTP_PORT: "465" });
  sent.length = 0;
  const tables = ["AuditLog", "DocumentFile", "Payment", "InvoiceLine", "Invoice", "QuoteLine", "Quote", "Client", "Sequence", "Session", "User", "CompanySettings"];
  await db.$executeRawUnsafe(`TRUNCATE ${tables.map((t) => `"${t}"`).join(", ")} RESTART IDENTITY CASCADE`);
  await db.companySettings.create({ data: { id: 1 } });
  ceo = { id: (await db.user.create({ data: { email: "c@t", name: "CEO", role: "CEO", passwordHash: "x" } })).id, role: "CEO" };
  meryem = { id: (await db.user.create({ data: { email: "m@t", name: "Meryem", role: "SALES", passwordHash: "x" } })).id, role: "SALES" };
  const year = new Date().getFullYear();
  await db.sequence.create({ data: { series: "QUOTE", year, lastNumber: 454 } });
  await admin.setSequence(ceo, "QUOTE", year, 454);
  clientId = (await db.client.create({ data: { name: "Yakeey MEA", email: "achats@yakeey.test", contactName: "Sara" } })).id;
});

async function quote(approve: boolean) {
  const q = await quotes.createQuote(meryem, {
    clientId, title: "Tournage", paymentTerms: "x",
    lines: [{ designation: "Tournage", quantity: 1, unit: "forfait", unitPrice: 1000, vatRate: 20 }],
  });
  if (approve) {
    await quotes.submitQuote(meryem, q.id);
    await quotes.approveQuote(ceo, q.id, { applySignature: true });
  }
  return q.id;
}

describe("Envoi par e-mail", () => {
  it("brouillon prérempli avec l'e-mail du client", async () => {
    const d = await draftDocumentEmail("QUOTE", await quote(true));
    expect(d.to).toBe("achats@yakeey.test");
    expect(d.subject).toMatch(/^Devis N° 00455\//);
    expect(d.message).toMatch(/Bonjour Sara/);
  });

  it("Meryem envoie un devis approuvé : PDF joint, statut Envoyé, audit", async () => {
    const id = await quote(true);
    const d = await draftDocumentEmail("QUOTE", id);
    await sendDocumentEmail(meryem, "QUOTE", id, { ...d, cc: "ceo@vrb.test" });
    expect(sent).toHaveLength(1);
    expect(sent[0].attachments[0].filename).toMatch(/^DEVIS_00455/);
    expect(sent[0].attachments[0].content.subarray(0, 5).toString()).toBe("%PDF-");
    expect((await db.quote.findUniqueOrThrow({ where: { id } })).status).toBe("SENT");
    expect(await db.auditLog.count({ where: { action: "email.sent", entityId: id } })).toBe(1);
  });

  it("brouillon non envoyable ; adresses invalides refusées", async () => {
    const draftId = await quote(false);
    await expect(sendDocumentEmail(meryem, "QUOTE", draftId, { to: "a@b.ma", cc: "", subject: "x", message: "" })).rejects.toThrow(/approuvé/);
    const id = await quote(true);
    await expect(sendDocumentEmail(meryem, "QUOTE", id, { to: "pas-une-adresse", cc: "", subject: "x", message: "" })).rejects.toThrow(/invalide/);
    expect(sent).toHaveLength(0);
  });
});
