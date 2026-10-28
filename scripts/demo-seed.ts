// Données de démonstration (base vrboost_demo uniquement) : 12 mois de devis, factures et paiements fictifs.
// Usage : npm run demo:seed   — refuse de s'exécuter sur une base dont le nom ne contient pas « demo ».
import "dotenv/config";
import bcrypt from "bcryptjs";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

const url = process.env.DEMO_DATABASE_URL!;
if (!url || !/demo/.test(url)) throw new Error("DEMO_DATABASE_URL doit viser une base de démonstration (« demo » dans le nom).");
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });

const CLIENTS = [
  ["Yakeey MEA", "Casablanca"], ["Marriott Casablanca", "Casablanca"], ["Akdital", "Casablanca"],
  ["Alliances Immobilier", "Rabat"], ["Palmeraie Développement", "Marrakech"], ["Technopark", "Casablanca"],
  ["Orange Maroc", "Casablanca"], ["Prestigia", "Tanger"],
];
const SERVICES = [
  ["Production / tournage audiovisuel", 6000], ["Captation drone professionnelle", 2000],
  ["Postproduction - masters", 7000], ["Captation 3D Matterport", 1850], ["Reportage photographique", 2000],
  ["Direction créative & préproduction", 3000], ["Forfait déplacement & logistique", 1300],
];

let seed = 7;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const pick = <T,>(a: T[]) => a[Math.floor(rnd() * a.length)];
const day = (monthsAgo: number, d: number) => {
  const now = new Date();
  return new Date(Date.UTC(now.getFullYear(), now.getMonth() - monthsAgo, Math.min(d, 28)));
};
const dec = (c: number) => (c / 100).toFixed(2);
const pad = (n: number) => String(n).padStart(5, "0");

async function main() {
  const tables = ["AuditLog", "DocumentFile", "Payment", "InvoiceLine", "Invoice", "QuoteLine", "Quote", "Client", "CatalogItem", "Sequence", "Session", "User", "CompanySettings"];
  await db.$executeRawUnsafe(`TRUNCATE ${tables.map((t) => `"${t}"`).join(", ")} RESTART IDENTITY CASCADE`);
  await db.companySettings.create({ data: { id: 1, accountantValidatedAt: new Date(), accountantName: "Cabinet démo" } });
  const hash = await bcrypt.hash(process.env.DEMO_PASSWORD!, 10);
  const ceo = await db.user.create({ data: { email: process.env.DEMO_EMAIL!, name: "CEO Démo", role: "CEO", passwordHash: hash } });
  const sales = await db.user.create({ data: { email: "meryem@vrboost.local", name: "Meryem Démo", role: "SALES", passwordHash: hash } });
  const clients = [];
  for (const [name, city] of CLIENTS) clients.push(await db.client.create({ data: { name, city, ice: String(1e14 + Math.floor(rnd() * 9e14)), email: `compta@${name.toLowerCase().replace(/[^a-z]/g, "")}.ma` } }));

  const year = new Date().getFullYear();
  let qn = 300, fn = 300;
  for (let m = 11; m >= 0; m--) {
    const perMonth = 3 + Math.floor(rnd() * 4);
    for (let k = 0; k < perMonth; k++) {
      const client = pick(clients);
      const lines = Array.from({ length: 2 + Math.floor(rnd() * 3) }, (_, i) => {
        const [d, p] = pick(SERVICES) as [string, number];
        const price = Math.round(p * (0.8 + rnd() * 0.6) / 50) * 50;
        return { position: i + 1, designation: d, quantity: "1.000", unit: "forfait", unitPrice: price.toFixed(2), vatRate: "20.00", discountPercent: "0.00", totalHt: price.toFixed(2) };
      });
      const ht = lines.reduce((s, l) => s + Math.round(Number(l.totalHt) * 100), 0);
      const vat = Math.round(ht * 0.2), ttc = ht + vat;
      const issued = day(m, 2 + Math.floor(rnd() * 25));
      const r = rnd();
      const status = m === 0 && k === 0 ? "PENDING_APPROVAL" : m === 0 && k === 1 ? "DRAFT" : r < 0.12 ? "REFUSED" : r < 0.25 && m < 2 ? "SENT" : "ACCEPTED";
      const numbered = !["DRAFT", "PENDING_APPROVAL"].includes(status);
      const draft = await db.quote.create({
        data: {
          status: "DRAFT", clientId: client.id, title: pick(["Production audiovisuelle", "Visite virtuelle 3D", "Reportage photo & vidéo", "Film immobilier"]),
          issueDate: numbered ? issued : null, validUntil: numbered ? new Date(issued.getTime() + 30 * 864e5) : null,
          paymentTerms: "Acompte de 50 % à la validation de la commande. Solde de 50 % à la livraison.",
          totalHt: dec(ht), totalVat: dec(vat), totalTtc: dec(ttc), vatBreakdown: [{ rate: 20, base: ht, vat }],
          createdById: sales.id, approvedById: numbered ? ceo.id : null, approvedAt: numbered ? issued : null, signed: numbered,
          submittedAt: status === "PENDING_APPROVAL" ? new Date() : null,
          lines: { create: lines },
        },
      });
      // Passage au statut final après création des lignes (les triggers figent un devis approuvé)
      const q = await db.quote.update({
        where: { id: draft.id },
        data: {
          status: status as never,
          ...(numbered ? { number: ++qn, year, reference: `${pad(qn)}/${year}` } : {}),
        },
      });
      if (status !== "ACCEPTED") continue;
      // Facture (définitive) issue du devis ; paiement selon l'ancienneté
      const inv = await db.invoice.create({
        data: {
          type: "STANDARD", clientId: client.id, quoteId: q.id, title: q.title, createdById: sales.id,
          totalHt: dec(ht), totalVat: dec(vat), totalTtc: dec(ttc), netToPay: dec(ttc), vatBreakdown: [{ rate: 20, base: ht, vat }],
          lines: { create: lines },
        },
      });
      const invDate = new Date(issued.getTime() + (3 + Math.floor(rnd() * 10)) * 864e5);
      const due = new Date(invDate.getTime() + 15 * 864e5);
      const paidFull = m >= 2 ? rnd() < 0.9 : m === 1 ? rnd() < 0.5 : rnd() < 0.2;
      const partial = !paidFull && rnd() < 0.4;
      const paid = paidFull ? ttc : partial ? Math.round(ttc / 2) : 0;
      await db.invoice.update({
        where: { id: inv.id },
        data: {
          number: ++fn, year, reference: `FAC-${pad(fn)}/${String(year).slice(-2)}`, issueDate: invDate, dueDate: due,
          status: paid >= ttc ? "PAID" : paid > 0 ? "PARTIALLY_PAID" : "ISSUED", amountPaid: dec(paid),
          approvedById: ceo.id, approvedAt: invDate, signed: true,
        },
      });
      if (paid > 0) {
        await db.payment.create({
          data: { invoiceId: inv.id, amount: dec(paid), date: new Date(due.getTime() - Math.floor(rnd() * 10) * 864e5), method: "VIREMENT", recordedById: ceo.id },
        });
      }
    }
  }
  for (const series of ["QUOTE", "INVOICE"] as const) {
    await db.sequence.create({ data: { series, year, lastNumber: series === "QUOTE" ? qn : fn, confirmedAt: new Date(), confirmedById: ceo.id } });
  }
  console.log(`Démo : ${await db.quote.count()} devis, ${await db.invoice.count()} factures, ${await db.payment.count()} paiements.`);
}

main().finally(() => db.$disconnect());
