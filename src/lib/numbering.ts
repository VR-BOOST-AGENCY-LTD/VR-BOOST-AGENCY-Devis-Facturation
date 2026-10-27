// Numérotation : deux séries indépendantes (DEVIS, FACTURES), annuelles, sans doublon.
// L'incrément se fait par UPDATE ... RETURNING dans la transaction d'émission : le verrou de ligne
// PostgreSQL sérialise les émissions concurrentes ; les contraintes UNIQUE servent de second filet.
import type { Series } from "@/generated/prisma/enums";
import type { Tx } from "./db";
import { conflict, invalid } from "./errors";

export async function allocateNumber(tx: Tx, series: Series, year: number): Promise<number> {
  const rows = await tx.$queryRaw<{ lastNumber: number; confirmedAt: Date | null }[]>`
    UPDATE "Sequence" SET "lastNumber" = "lastNumber" + 1, "updatedAt" = now()
    WHERE "series" = ${series}::"Series" AND "year" = ${year} AND "confirmedAt" IS NOT NULL
    RETURNING "lastNumber", "confirmedAt"`;
  if (rows.length === 1) return rows[0].lastNumber;

  const existing = await tx.sequence.findUnique({ where: { series_year: { series, year } } });
  if (existing) {
    throw conflict(
      `Numérotation ${series === "QUOTE" ? "des devis" : "des factures"} ${year} non confirmée : le CEO doit valider le dernier numéro émis dans Paramètres › Numérotation.`,
    );
  }
  // Nouvelle année : démarre à 1 seulement si la série a déjà été activée une année précédente.
  const previous = await tx.sequence.findFirst({
    where: { series, confirmedAt: { not: null }, year: { lt: year } },
  });
  if (!previous) {
    throw conflict(`Aucune séquence ${series} configurée pour ${year}. Configurez-la dans Paramètres › Numérotation.`);
  }
  await tx.$executeRaw`
    INSERT INTO "Sequence" ("id", "series", "year", "lastNumber", "confirmedAt", "updatedAt")
    VALUES (${`seq_${series}_${year}`}, ${series}::"Series", ${year}, 0, now(), now())
    ON CONFLICT ("series", "year") DO NOTHING`;
  return allocateNumber(tx, series, year);
}

/** Plus grand numéro réellement attribué dans une série/année. */
export async function maxIssued(tx: Tx, series: Series, year: number): Promise<number> {
  if (series === "QUOTE") {
    const r = await tx.quote.aggregate({ _max: { number: true }, where: { year } });
    return r._max.number ?? 0;
  }
  const r = await tx.invoice.aggregate({ _max: { number: true }, where: { year } });
  return r._max.number ?? 0;
}

/** Réglage / confirmation du dernier numéro émis (CEO). Ne peut jamais créer de doublon. */
export async function configureSequence(
  tx: Tx,
  series: Series,
  year: number,
  lastNumber: number,
  confirmedById: string,
) {
  if (!Number.isInteger(lastNumber) || lastNumber < 0 || lastNumber > 99999) {
    throw invalid("Dernier numéro invalide (0 à 99999)");
  }
  const max = await maxIssued(tx, series, year);
  if (lastNumber < max) {
    throw conflict(`Impossible : le numéro ${max}/${year} a déjà été attribué dans cette série.`);
  }
  return tx.sequence.upsert({
    where: { series_year: { series, year } },
    create: { series, year, lastNumber, confirmedAt: new Date(), confirmedById },
    update: { lastNumber, confirmedAt: new Date(), confirmedById },
  });
}
