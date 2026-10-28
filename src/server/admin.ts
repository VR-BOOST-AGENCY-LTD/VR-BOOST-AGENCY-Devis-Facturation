// Paramètres sensibles (CEO) : société, conditions par défaut, numérotation, validation comptable, catalogue.
import { z } from "zod";
import type { Series } from "@/generated/prisma/enums";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { invalid } from "@/lib/errors";
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
  const item = id
    ? await db.catalogItem.update({ where: { id }, data })
    : await db.catalogItem.create({ data });
  await audit(db, actor, id ? "catalog.update" : "catalog.create", "CATALOG", item.id, `Prestation catalogue : ${item.designation}`);
  return item;
}

export async function toggleCatalogItem(actor: Actor, id: string) {
  assertCan(actor, "catalog.edit");
  const item = await db.catalogItem.findUniqueOrThrow({ where: { id } });
  await db.catalogItem.update({ where: { id }, data: { active: !item.active } });
  await audit(db, actor, "catalog.toggle", "CATALOG", id, `${item.active ? "Désactivation" : "Activation"} : ${item.designation}`);
}
