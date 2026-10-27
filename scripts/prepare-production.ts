// Remise à zéro avant la mise en service réelle.
// 1. Sauvegarde complète (pg_dump) dans backups/ ;
// 2. Supprime devis, factures, paiements, archives PDF, sessions et journal de test ;
// 3. Conserve comptes, paramètres société, clients et catalogue ;
// 4. Remet les séquences sur le dernier numéro réellement émis, NON confirmées (le CEO confirme dans l'app).
// Usage : npm run db:prepare-production -- --last-quote 454 --last-invoice 454 --confirm REINITIALISER
import "dotenv/config";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

const arg = (name: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : undefined;
};

async function main() {
  if (arg("confirm") !== "REINITIALISER") {
    throw new Error("Opération destructive : ajoutez --confirm REINITIALISER");
  }
  const lastQuote = Number(arg("last-quote") ?? 454);
  const lastInvoice = Number(arg("last-invoice") ?? 454);
  const year = Number(arg("year") ?? new Date().getFullYear());
  if (![lastQuote, lastInvoice, year].every(Number.isInteger)) throw new Error("Numéros invalides");
  const url = process.env.DATABASE_URL!;

  const dir = path.resolve("backups");
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `avant-mise-en-production-${new Date().toISOString().replace(/[:.]/g, "-")}.dump`);
  const pgDump = process.env.PGBIN ? path.join(process.env.PGBIN, "pg_dump") : "pg_dump";
  execFileSync(pgDump, ["--format=custom", `--file=${file}`, url], { stdio: "inherit" });
  if (!fs.existsSync(file) || fs.statSync(file).size === 0) throw new Error("Sauvegarde échouée : rien n'a été supprimé.");
  console.log(`Sauvegarde : ${file}`);

  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
  try {
    const before = {
      devis: await db.quote.count(),
      factures: await db.invoice.count(),
      paiements: await db.payment.count(),
    };
    await db.$transaction(async (tx) => {
      // TRUNCATE ne déclenche pas les triggers ligne à ligne : réservé à cette remise à zéro, après sauvegarde.
      await tx.$executeRawUnsafe(
        `TRUNCATE "Payment", "InvoiceLine", "Invoice", "QuoteLine", "Quote", "DocumentFile", "Session", "AuditLog" RESTART IDENTITY`,
      );
      await tx.$executeRawUnsafe(`ALTER TABLE "Sequence" DISABLE TRIGGER sequence_guard`);
      await tx.sequence.deleteMany({});
      await tx.$executeRawUnsafe(`ALTER TABLE "Sequence" ENABLE TRIGGER sequence_guard`);
      await tx.sequence.createMany({
        data: [
          { series: "QUOTE", year, lastNumber: lastQuote },
          { series: "INVOICE", year, lastNumber: lastInvoice },
        ],
      });
      await tx.auditLog.create({
        data: {
          action: "system.reset",
          entityType: "SYSTEM",
          summary: `Remise à zéro avant mise en production (sauvegarde ${path.basename(file)}). Supprimés : ${before.devis} devis, ${before.factures} factures, ${before.paiements} paiements. Séquences ${year} : devis ${lastQuote}, factures ${lastInvoice} (à confirmer).`,
        },
      });
    });
    console.log(`Supprimés : ${before.devis} devis, ${before.factures} factures/avoirs, ${before.paiements} paiements.`);
    console.log(`Conservés : ${await db.user.count()} comptes, ${await db.client.count()} clients, ${await db.catalogItem.count()} prestations catalogue, paramètres société.`);
    console.log(`Séquences ${year} : prochain devis ${lastQuote + 1}, prochaine facture ${lastInvoice + 1} — à confirmer par le CEO (Paramètres › Numérotation).`);
  } finally {
    await db.$disconnect();
  }
}

main().catch((e) => {
  console.error(`ÉCHEC : ${(e as Error).message}`);
  process.exit(1);
});
