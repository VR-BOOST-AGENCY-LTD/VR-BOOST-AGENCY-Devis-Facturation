// Catalogue alimenté depuis les devis, suppression (logique) des devis et factures réservée au CEO.
import { beforeEach, describe, expect, it } from "vitest";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { can, type Actor } from "@/lib/permissions";
import * as quotes from "@/server/quotes";
import * as invoices from "@/server/invoices";
import * as payments from "@/server/payments";
import * as admin from "@/server/admin";
import { editorOptions } from "@/server/queries";

let ceo: Actor;
let meryem: Actor;
let clientId: string;
const year = new Date().getFullYear();
const date = new Date().toISOString().slice(0, 10);

beforeEach(async () => {
  const tables = ["AuditLog", "DocumentFile", "Payment", "InvoiceLine", "Invoice", "QuoteLine", "Quote", "Client", "CatalogItem", "Sequence", "Session", "UserAvatar", "User", "CompanySettings"];
  await db.$executeRawUnsafe(`TRUNCATE ${tables.map((t) => `"${t}"`).join(", ")} RESTART IDENTITY CASCADE`);
  await db.companySettings.create({ data: { id: 1 } });
  const hash = await bcrypt.hash("MotDePasse-2026", 4);
  ceo = { id: (await db.user.create({ data: { email: "ceo@vrb.test", name: "CEO", role: "CEO", passwordHash: hash } })).id, role: "CEO" };
  meryem = { id: (await db.user.create({ data: { email: "meryem@vrb.test", name: "Meryem", role: "SALES", passwordHash: hash } })).id, role: "SALES" };
  for (const series of ["QUOTE", "INVOICE"] as const) await db.sequence.create({ data: { series, year, lastNumber: 454 } });
  await admin.setSequence(ceo, "QUOTE", year, 454);
  await admin.setSequence(ceo, "INVOICE", year, 454);
  clientId = (await db.client.create({ data: { name: "Client Démo", email: "demo@client.test" } })).id;
});

const drone = { designation: "Captation drone", description: "Plans aériens", quantity: 2, unit: "jour", unitPrice: 2500, vatRate: 20, discountPercent: 10 };
const montage = { designation: "Montage vidéo", quantity: 1, unit: "forfait", unitPrice: 4000, vatRate: 20 };

async function acceptedQuote(lines: object[] = [montage]) {
  const q = await quotes.createQuote(meryem, { clientId, title: "Film", paymentTerms: "x", lines });
  await quotes.submitQuote(meryem, q.id);
  await quotes.approveQuote(ceo, q.id, { applySignature: false });
  await quotes.markQuoteOutcome(meryem, q.id, "ACCEPTED");
  return q.id;
}

async function issue(id: string) {
  await invoices.submitInvoice(meryem, id);
  return invoices.approveAndIssueInvoice(ceo, id, { applySignature: false });
}

describe("Catalogue alimenté depuis les lignes de devis", () => {
  it("ajoute une ligne avec ses informations, réutilisable dans un autre devis", async () => {
    const r = await admin.addLinesToCatalog(meryem, [drone]);
    expect(r).toEqual({ added: ["Captation drone"], existing: [] });
    const item = await db.catalogItem.findFirstOrThrow();
    expect(item).toMatchObject({ designation: "Captation drone", description: "Plans aériens", unit: "jour", active: true });
    expect(Number(item.unitPrice)).toBe(2500); // prix unitaire HT, sans la remise propre au devis
    expect(Number(item.vatRate)).toBe(20);

    const opts = await editorOptions();
    const opt = opts.catalog.find((c) => c.designation === "Captation drone")!;
    expect(opt).toMatchObject({ unit: "jour", unitPrice: 2500, vatRate: 20 });
    // Réutilisation dans un nouveau devis (même mécanisme que la liste « Depuis le catalogue »)
    const q2 = await quotes.createQuote(meryem, { clientId, title: "Autre projet", paymentTerms: "x",
      lines: [{ designation: opt.designation, description: opt.description, quantity: 1, unit: opt.unit, unitPrice: opt.unitPrice, vatRate: opt.vatRate }] });
    const l2 = await db.quoteLine.findFirstOrThrow({ where: { quoteId: q2.id } });
    expect(l2.designation).toBe("Captation drone");
    expect(Number(l2.unitPrice)).toBe(2500);
  });

  it("doublons : même désignation (casse, accents, espaces ignorés) jamais dupliquée ni modifiée", async () => {
    await admin.addLinesToCatalog(meryem, [drone]);
    const r = await admin.addLinesToCatalog(meryem, [{ ...drone, designation: "  CAPTATION   DRÔNE ", unitPrice: 9999 }, montage, montage]);
    expect(r.added).toEqual(["Montage vidéo"]);
    expect(r.existing).toEqual([{ designation: "Captation drone", active: true }]);
    expect(await db.catalogItem.count()).toBe(2);
    expect(Number((await db.catalogItem.findFirstOrThrow({ where: { designation: "Captation drone" } })).unitPrice)).toBe(2500);
    // Une prestation désactivée compte aussi comme présente
    const m = await db.catalogItem.findFirstOrThrow({ where: { designation: "Montage vidéo" } });
    await admin.toggleCatalogItem(ceo, m.id);
    expect((await admin.addLinesToCatalog(meryem, [montage])).existing).toEqual([{ designation: "Montage vidéo", active: false }]);
    // Création manuelle dans le Catalogue : même règle
    await expect(admin.saveCatalogItem(meryem, null, { designation: "montage video", unit: "forfait", vatRate: 20 })).rejects.toThrow(/existe déjà/);
  });

  it("devis existant : enregistre ses lignes sans modifier le devis ; le devis ne change pas si le catalogue change", async () => {
    const qid = await acceptedQuote([drone, montage]);
    const before = await db.quote.findUniqueOrThrow({ where: { id: qid }, include: { lines: true } });
    const r = await admin.addQuoteLinesToCatalog(meryem, qid);
    expect(r.added.sort()).toEqual(["Captation drone", "Montage vidéo"]);
    const item = await db.catalogItem.findFirstOrThrow({ where: { designation: "Montage vidéo" } });
    await admin.saveCatalogItem(ceo, item.id, { designation: "Montage vidéo", unit: "forfait", unitPrice: 9000, vatRate: 20 });
    const after = await db.quote.findUniqueOrThrow({ where: { id: qid }, include: { lines: true } });
    expect(after.updatedAt).toEqual(before.updatedAt);
    expect(after.lines.map((l) => Number(l.unitPrice)).sort()).toEqual(before.lines.map((l) => Number(l.unitPrice)).sort());
    expect(await db.auditLog.count({ where: { action: "catalog.create" } })).toBe(2);
  });

  it("permissions : ajout refusé sans le droit catalog.edit ; ligne vide refusée", async () => {
    await expect(admin.addLinesToCatalog({ id: "x", role: "VIEWER" as never }, [montage])).rejects.toThrow(/non autorisée/);
    await expect(admin.addLinesToCatalog(meryem, [{ designation: " ", vatRate: 20 }])).rejects.toThrow(/Aucune prestation/);
  });
});

describe("Suppression réservée au CEO", () => {
  it("seul le CEO a les droits ; un non-CEO est refusé par appel direct", async () => {
    expect(can(ceo, "quote.delete") && can(ceo, "invoice.delete")).toBe(true);
    expect(can(meryem, "quote.delete") || can(meryem, "invoice.delete")).toBe(false);
    const q = await quotes.createQuote(meryem, { clientId, title: "Brouillon", paymentTerms: "x", lines: [montage] });
    const inv = await invoices.createInvoice(meryem, { clientId, title: "Facture", lines: [montage] });
    await expect(quotes.deleteQuote(meryem, q.id, "test")).rejects.toThrow(/non autorisée/);
    await expect(invoices.deleteInvoice(meryem, inv.id, "test")).rejects.toThrow(/non autorisée/);
    expect((await db.quote.findUniqueOrThrow({ where: { id: q.id } })).deletedAt).toBeNull();
    expect((await db.invoice.findUniqueOrThrow({ where: { id: inv.id } })).deletedAt).toBeNull();
  });

  it("le CEO supprime un devis approuvé : suppression logique, motif obligatoire, journal, numéro conservé", async () => {
    const q = await quotes.createQuote(meryem, { clientId, title: "Film", paymentTerms: "x", lines: [montage] });
    await quotes.submitQuote(meryem, q.id);
    await quotes.approveQuote(ceo, q.id, { applySignature: false });
    await expect(quotes.deleteQuote(ceo, q.id, " ")).rejects.toThrow(/motif/);
    await quotes.deleteQuote(ceo, q.id, "Doublon saisi par erreur");
    const row = await db.quote.findUniqueOrThrow({ where: { id: q.id }, include: { lines: true } });
    expect(row).toMatchObject({ number: 455, deletionReason: "Doublon saisi par erreur", deletedById: ceo.id });
    expect(row.lines).toHaveLength(1);
    const log = await db.auditLog.findFirstOrThrow({ where: { action: "quote.delete", entityId: q.id } });
    expect(log.summary).toMatch(/00455\/\d{4} supprimé : Doublon/);
    // Figé en base et invisible : plus aucune opération possible
    await expect(quotes.markQuoteSent(ceo, q.id)).rejects.toThrow(/supprimé/);
    await expect(quotes.deleteQuote(ceo, q.id, "encore")).rejects.toThrow(/introuvable/);
    // Le numéro reste consommé : le devis suivant prend 456
    const q2 = await quotes.createQuote(meryem, { clientId, title: "Suivant", paymentTerms: "x", lines: [montage] });
    await quotes.submitQuote(meryem, q2.id);
    expect((await quotes.approveQuote(ceo, q2.id, { applySignature: false })).number).toBe(456);
  });

  it("devis lié : facture active → refus ; versions : la plus récente d'abord, l'ancienne retrouve son statut", async () => {
    const qid = await acceptedQuote();
    const inv = await invoices.createInvoiceFromQuote(meryem, qid, "STANDARD");
    await expect(quotes.deleteQuote(ceo, qid, "x")).rejects.toThrow(/factures rattachées/);
    await invoices.deleteInvoice(ceo, inv.id, "Facture créée par erreur");
    // Facture supprimée : le devis redevient facturable puis supprimable
    const inv2 = await invoices.createInvoiceFromQuote(meryem, qid, "STANDARD");
    await invoices.deleteInvoice(ceo, inv2.id, "idem");

    const v2 = await quotes.reviseQuote(meryem, qid);
    await quotes.submitQuote(meryem, v2.id);
    await quotes.approveQuote(ceo, v2.id, { applySignature: false });
    expect((await db.quote.findUniqueOrThrow({ where: { id: qid } })).status).toBe("SUPERSEDED");
    await expect(quotes.deleteQuote(ceo, qid, "x")).rejects.toThrow(/version plus récente/);
    await quotes.deleteQuote(ceo, v2.id, "V2 inutile");
    expect((await db.quote.findUniqueOrThrow({ where: { id: qid } })).status).toBe("ACCEPTED");
    // Une nouvelle révision reste possible (V3, la V2 supprimée garde son numéro de version)
    const v3 = await quotes.reviseQuote(meryem, qid);
    expect(v3.version).toBe(3);
  });

  it("le CEO supprime une facture émise sans paiement : retirée du tableau de bord ; paiements/avoirs/solde liés → refus", async () => {
    const inv = await invoices.createInvoice(meryem, { clientId, title: "Facture", lines: [montage] });
    await issue(inv.id);
    const p = await payments.recordPayment(ceo, { invoiceId: inv.id, amount: 1000, date, method: "VIREMENT" });
    await expect(invoices.deleteInvoice(ceo, inv.id, "x")).rejects.toThrow(/paiements/);
    await payments.cancelPayment(ceo, p.id, "Erreur");
    const cn = await invoices.createCreditNote(ceo, inv.id, { reason: "Geste", full: false, lines: [{ ...montage, unitPrice: 100 }] });
    await expect(invoices.deleteInvoice(ceo, inv.id, "x")).rejects.toThrow(/Documents liés/);
    await issue(cn.id);
    await expect(invoices.deleteInvoice(ceo, cn.id, "x")).rejects.toThrow(/avoir émis/);

    const other = await invoices.createInvoice(meryem, { clientId, title: "Autre", lines: [montage] });
    const issued = await issue(other.id);
    await invoices.deleteInvoice(ceo, other.id, "Émise par erreur");
    const row = await db.invoice.findUniqueOrThrow({ where: { id: other.id }, include: { lines: true } });
    expect(row).toMatchObject({ number: issued.number, reference: issued.reference, deletionReason: "Émise par erreur" });
    expect(row.lines).toHaveLength(1);
    await expect(payments.recordPayment(ceo, { invoiceId: other.id, amount: 10, date, method: "VIREMENT" })).rejects.toThrow(/introuvable/);
    // Plus comptée dans les montants ouverts ni dans les relances
    const open = await db.invoice.count({ where: { status: { in: ["ISSUED", "PARTIALLY_PAID"] }, deletedAt: null } });
    expect(open).toBe(1);
  });

  it("acompte déduit par une facture de solde : supprimer le solde d'abord", async () => {
    const qid = await acceptedQuote();
    const dep = await invoices.createInvoiceFromQuote(meryem, qid, "DEPOSIT", { percent: 50 });
    await issue(dep.id);
    const bal = await invoices.createInvoiceFromQuote(meryem, qid, "BALANCE");
    await expect(invoices.deleteInvoice(ceo, dep.id, "x")).rejects.toThrow(/solde/);
    await invoices.deleteInvoice(ceo, bal.id, "Solde prématuré");
    await invoices.deleteInvoice(ceo, dep.id, "Acompte annulé");
    // Le devis peut être refacturé
    await expect(invoices.createInvoiceFromQuote(meryem, qid, "STANDARD")).resolves.toBeTruthy();
  });

  it("la base refuse toute modification d'un document supprimé, même hors application", async () => {
    const inv = await invoices.createInvoice(meryem, { clientId, title: "Facture", lines: [montage] });
    await invoices.deleteInvoice(ceo, inv.id, "test");
    await expect(db.invoice.update({ where: { id: inv.id }, data: { deletedAt: null } })).rejects.toThrow(/supprimé/);
    await expect(db.invoice.delete({ where: { id: inv.id } })).rejects.toThrow(/supprimé/);
  });
});

describe("Logo du compte", () => {
  const png = (w: number, h: number) => {
    const b = new Uint8Array(64);
    b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
    new DataView(b.buffer).setUint32(16, w);
    new DataView(b.buffer).setUint32(20, h);
    return b;
  };

  it("chaque compte enregistre et retire son propre logo, avec les contrôles de format", async () => {
    const { setOwnAvatar, removeOwnAvatar } = await import("@/server/users");
    await expect(setOwnAvatar(meryem, png(512, 300))).rejects.toThrow(/carrée/);
    await expect(setOwnAvatar(meryem, png(64, 64))).rejects.toThrow(/trop petite/);
    await expect(setOwnAvatar(meryem, png(4096, 4096))).rejects.toThrow(/trop grande/);
    await expect(setOwnAvatar(meryem, new TextEncoder().encode("<svg/>"))).rejects.toThrow(/Format/);
    await expect(setOwnAvatar(meryem, new Uint8Array(1024 * 1024 + 1))).rejects.toThrow(/1 Mo/);

    await setOwnAvatar(meryem, png(512, 512));
    const u = await db.user.findUniqueOrThrow({ where: { id: meryem.id }, include: { avatar: true } });
    expect(u.avatarUpdatedAt).not.toBeNull();
    expect(u.avatar).toMatchObject({ mime: "image/png", width: 512, height: 512 });
    expect(await db.userAvatar.count({ where: { userId: ceo.id } })).toBe(0); // n'affecte que son compte

    await removeOwnAvatar(meryem);
    expect((await db.user.findUniqueOrThrow({ where: { id: meryem.id } })).avatarUpdatedAt).toBeNull();
    expect(await db.userAvatar.count()).toBe(0);
  });
});

describe("Nom et libellé du compte", () => {
  it("le CEO règle prénom (accueil) et libellé (barre latérale) ; vide = retour au nom", async () => {
    const { updateUser } = await import("@/server/users");
    await updateUser(ceo, ceo.id, { name: "Rachid", accountLabel: "  VR BOOST AGENCY " });
    expect(await db.user.findUniqueOrThrow({ where: { id: ceo.id } })).toMatchObject({ name: "Rachid", accountLabel: "VR BOOST AGENCY" });
    await updateUser(ceo, ceo.id, { accountLabel: "" });
    expect((await db.user.findUniqueOrThrow({ where: { id: ceo.id } })).accountLabel).toBeNull();
    await expect(updateUser(meryem, ceo.id, { accountLabel: "x" })).rejects.toThrow(/non autorisée/);
    const log = await db.auditLog.findFirstOrThrow({ where: { action: "user.update" }, orderBy: { id: "asc" } });
    expect(log.summary).toMatch(/nom « Rachid ».*libellé « VR BOOST AGENCY »/);
  });
});
