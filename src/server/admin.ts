// Paramètres sensibles (CEO) : société, conditions par défaut, numérotation, validation comptable, catalogue.
import { z } from "zod";
import type { Series } from "@/generated/prisma/enums";
import { db, type Tx } from "@/lib/db";
import { audit } from "@/lib/audit";
import { catalogKey } from "@/lib/catalog";
import { conflict, invalid, notFound } from "@/lib/errors";
import { quoteReference } from "@/lib/format";
import { configureSequence } from "@/lib/numbering";
import { assertCan, type Actor } from "@/lib/permissions";
import { getSettings } from "@/lib/settings";

const settingsSchema = z.object({
  companyName: z.string().trim().min(1).max(200),
  legalForm: z.string().trim().max(50),
  capital: z.string().trim().max(50),
  address: z.string().trim().min(1).max(300),
  city: z.string().trim().min(1).max(100),
  ice: z.string().trim().min(1).max(30),
  rc: z.string().trim().max(30),
  ifNumber: z.string().trim().max(30),
  tp: z.string().trim().max(30),
  cnss: z.string().trim().max(30),
  phone: z.string().trim().max(50),
  email: z.string().trim().max(200),
  website: z.string().trim().max(200),
  bankName: z.string().trim().min(1).max(100),
  rib: z.string().trim().min(1).max(60),
  accountHolder: z.string().trim().min(1).max(200),
  defaultVatRate: z.coerce.number().min(0).max(100),
  defaultDepositPercent: z.coerce.number().min(0).max(100),
  defaultValidityDays: z.coerce.number().int().min(1).max(365),
  defaultPaymentTerms: z.string().trim().min(1).max(2000),
  invoicePaymentTerms: z.string().trim().min(1).max(2000),
  invoiceDueDays: z.coerce.number().int().min(0).max(365),
  salesCanEditTerms: z.boolean(),
  notificationsEnabled: z.boolean(),
  remindersEnabled: z.boolean(),
  reminderIntervalDays: z.coerce.number().int().min(1).max(90),
  reminderMaxCount: z.coerce.number().int().min(1).max(10),
  quoteNumberFormat: z.string().trim().max(40).refine((v) => v.includes("{n}") && /\{yy(yy)?\}/.test(v), "Le modèle doit contenir {n} et {yy} ou {yyyy}"),
  invoiceNumberFormat: z.string().trim().max(40).refine((v) => v.includes("{n}") && /\{yy(yy)?\}/.test(v), "Le modèle doit contenir {n} et {yy} ou {yyyy}"),
  creditNoteNumberFormat: z.string().trim().max(40).refine((v) => v.includes("{n}") && /\{yy(yy)?\}/.test(v), "Le modèle doit contenir {n} et {yy} ou {yyyy}"),
});

export async function updateSettings(actor: Actor, input: unknown) {
  assertCan(actor, "settings.edit");
  const data = settingsSchema.parse(input);
  const before = await getSettings();
  const s = await db.companySettings.update({
    where: { id: 1 },
    data: {
      ...data,
      defaultVatRate: data.defaultVatRate.toFixed(2),
      defaultDepositPercent: data.defaultDepositPercent.toFixed(2),
    },
  });
  const changed = Object.keys(data).filter(
    (k) => String((before as Record<string, unknown>)[k]) !== String((s as Record<string, unknown>)[k]),
  );
  await audit(db, actor, "settings.update", "SETTINGS", "1", `Paramètres modifiés : ${changed.join(", ") || "aucun"}`, {
    changed,
  });
  return s;
}

export async function setSequence(actor: Actor, series: Series, year: number, lastNumber: number) {
  assertCan(actor, "sequence.edit");
  return db.$transaction(async (tx) => {
    const before = await tx.sequence.findUnique({ where: { series_year: { series, year } } });
    const seq = await configureSequence(tx, series, year, lastNumber, actor.id);
    await audit(tx, actor, "sequence.confirm", "SEQUENCE", seq.id,
      `Numérotation ${series === "QUOTE" ? "DEVIS" : "FACTURES"} ${year} : dernier numéro émis confirmé à ${lastNumber} (prochain : ${lastNumber + 1})`,
      { before: before?.lastNumber ?? null, after: lastNumber });
    return seq;
  });
}

export async function setAccountantValidation(actor: Actor, accountantName: string | null) {
  assertCan(actor, "settings.edit");
  if (accountantName !== null && !accountantName.trim()) throw invalid("Nom du comptable requis.");
  await db.companySettings.update({
    where: { id: 1 },
    data: accountantName
      ? { accountantValidatedAt: new Date(), accountantName: accountantName.trim() }
      : { accountantValidatedAt: null, accountantName: null },
  });
  await audit(db, actor, "settings.accountant", "SETTINGS", "1",
    accountantName ? `Modèles et traitements fiscaux validés par le comptable : ${accountantName.trim()}` : "Validation comptable retirée");
}

const catalogSchema = z.object({
  designation: z.string().trim().min(1).max(300),
  description: z.string().trim().max(2000).optional().nullable(),
  unit: z.string().trim().min(1).max(30).default("forfait"),
  unitPrice: z
    .union([z.literal(""), z.coerce.number().min(0).max(100_000_000)])
    .optional()
    .nullable()
    .transform((v) => (v === "" || v == null ? null : v)),
  vatRate: z.coerce.number().min(0).max(100),
});

/** Verrou transactionnel : sérialise les ajouts au catalogue pour que le contrôle des doublons soit fiable. */
async function lockCatalog(tx: Tx) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('vrb_catalog'))`;
}

export async function saveCatalogItem(actor: Actor, id: string | null, input: unknown) {
  assertCan(actor, "catalog.edit");
  const d = catalogSchema.parse(input);
  const data = {
    designation: d.designation,
    description: d.description || null,
    unit: d.unit,
    unitPrice: d.unitPrice == null ? null : d.unitPrice.toFixed(2),
    vatRate: d.vatRate.toFixed(2),
  };
  return db.$transaction(async (tx) => {
    await lockCatalog(tx);
    const key = catalogKey(d.designation);
    const twin = (await tx.catalogItem.findMany({ where: id ? { id: { not: id } } : {} })).find((i) => catalogKey(i.designation) === key);
    if (twin) throw conflict(`La prestation « ${twin.designation} » existe déjà dans le catalogue${twin.active ? "" : " (désactivée)"}.`);
    const item = id
      ? await tx.catalogItem.update({ where: { id }, data })
      : await tx.catalogItem.create({ data });
    await audit(tx, actor, id ? "catalog.update" : "catalog.create", "CATALOG", item.id, `Prestation catalogue : ${item.designation}`);
    return item;
  });
}

const lineToCatalogSchema = z.object({
  designation: z.string().trim().max(300),
  description: z.string().trim().max(2000).optional().nullable(),
  unit: z.string().trim().max(30).optional().nullable(),
  unitPrice: z.coerce.number().min(0).max(100_000_000).optional().nullable(),
  vatRate: z.coerce.number().min(0).max(100),
});

export type CatalogAddResult = { added: string[]; existing: { designation: string; active: boolean }[] };

/**
 * Enregistre au catalogue des lignes de devis (désignation, description, unité, prix unitaire HT, TVA).
 * Ajout seul : les prestations déjà présentes (même désignation, voir catalogKey) ne sont ni dupliquées
 * ni modifiées, et le devis d'origine n'est jamais touché. Quantité et remise restent propres au devis.
 */
export async function addLinesToCatalog(actor: Actor, input: unknown[], source?: { quoteId?: string; label?: string }): Promise<CatalogAddResult> {
  assertCan(actor, "catalog.edit");
  const lines = input.map((l) => lineToCatalogSchema.parse(l)).filter((l) => l.designation);
  if (lines.length === 0) throw invalid("Aucune prestation à ajouter : renseignez au moins une désignation.");
  return db.$transaction(async (tx) => {
    await lockCatalog(tx);
    const known = new Map((await tx.catalogItem.findMany()).map((i) => [catalogKey(i.designation), i]));
    const result: CatalogAddResult = { added: [], existing: [] };
    const addedNow = new Set<string>();
    for (const l of lines) {
      const key = catalogKey(l.designation);
      if (addedNow.has(key)) continue; // même prestation répétée dans le devis
      const twin = known.get(key);
      if (twin) {
        if (!result.existing.some((e) => e.designation === twin.designation)) result.existing.push({ designation: twin.designation, active: twin.active });
        continue;
      }
      const item = await tx.catalogItem.create({
        data: {
          designation: l.designation,
          description: l.description || null,
          unit: l.unit || "forfait",
          unitPrice: l.unitPrice == null ? null : l.unitPrice.toFixed(2),
          vatRate: l.vatRate.toFixed(2),
        },
      });
      known.set(key, item);
      addedNow.add(key);
      result.added.push(item.designation);
      await audit(tx, actor, "catalog.create", "CATALOG", item.id,
        `Prestation ajoutée au catalogue depuis ${source?.label ?? "un devis"} : ${item.designation}`, source?.quoteId ? { quoteId: source.quoteId } : undefined);
    }
    return result;
  });
}

/** Enregistre au catalogue les lignes d'un devis existant (quel que soit son statut), sans modifier le devis. */
export async function addQuoteLinesToCatalog(actor: Actor, quoteId: string) {
  assertCan(actor, "catalog.edit");
  const q = await db.quote.findUnique({ where: { id: quoteId }, include: { lines: { orderBy: { position: "asc" } } } });
  if (!q || q.deletedAt) throw notFound("Devis introuvable");
  return addLinesToCatalog(actor, q.lines.map((l) => ({
    designation: l.designation,
    description: l.description,
    unit: l.unit,
    unitPrice: Number(l.unitPrice),
    vatRate: Number(l.vatRate),
  })), { quoteId, label: `le devis ${q.reference ? quoteReference(q.reference, q.version) : `brouillon « ${q.title} »`}` });
}

export async function toggleCatalogItem(actor: Actor, id: string) {
  assertCan(actor, "catalog.edit");
  const item = await db.catalogItem.findUniqueOrThrow({ where: { id } });
  await db.catalogItem.update({ where: { id }, data: { active: !item.active } });
  await audit(db, actor, "catalog.toggle", "CATALOG", id, `${item.active ? "Désactivation" : "Activation"} : ${item.designation}`);
}
