import { z } from "zod";

const num = (min: number, max: number) =>
  z.coerce.number().refine((n) => Number.isFinite(n) && n >= min && n <= max, `Valeur entre ${min} et ${max}`);

const optText = (max = 5000) =>
  z
    .string()
    .max(max)
    .optional()
    .nullable()
    .transform((v) => (v && v.trim() ? v.trim() : null));

export const lineSchema = z.object({
  designation: z.string().trim().min(1, "Désignation obligatoire").max(300),
  description: optText(2000),
  quantity: num(0.001, 1_000_000),
  unit: z.string().trim().min(1).max(30).default("forfait"),
  unitPrice: num(-100_000_000, 100_000_000),
  vatRate: num(0, 100),
  discountPercent: num(0, 100).default(0),
});

export type LineData = z.infer<typeof lineSchema>;

export const quoteSchema = z.object({
  clientId: z.string().min(1, "Client obligatoire"),
  hubspotDealId: optText(64),
  title: z.string().trim().min(1, "Intitulé obligatoire").max(200),
  subtitle: optText(500),
  projectName: optText(200),
  validityDays: z.coerce.number().int().min(1).max(365).default(30),
  depositPercent: num(0, 100).default(50),
  paymentTerms: z.string().trim().min(1).max(2000),
  deliverables: optText(),
  deadlines: optText(),
  specificConditions: optText(),
  notes: optText(),
  lines: z.array(lineSchema).min(1, "Au moins une prestation").max(200),
});

export type QuoteData = z.infer<typeof quoteSchema>;

export const invoiceSchema = z.object({
  clientId: z.string().min(1, "Client obligatoire"),
  hubspotDealId: optText(64),
  title: z.string().trim().min(1, "Intitulé obligatoire").max(200),
  subtitle: optText(500),
  projectName: optText(200),
  dueDays: z.coerce.number().int().min(0).max(365).optional(),
  deliveryDate: z
    .string()
    .optional()
    .nullable()
    .transform((v) => (v ? new Date(`${v.slice(0, 10)}T00:00:00Z`) : null)),
  paymentTerms: optText(2000),
  notes: optText(),
  reason: optText(1000),
  lines: z.array(lineSchema).min(1, "Au moins une ligne").max(200),
});

export type InvoiceData = z.infer<typeof invoiceSchema>;

export const clientSchema = z.object({
  type: z.enum(["COMPANY", "INDIVIDUAL"]).default("COMPANY"),
  name: z.string().trim().min(1, "Raison sociale obligatoire").max(200),
  ice: optText(30),
  ifNumber: optText(30),
  rc: optText(30),
  address: optText(300),
  city: optText(100),
  country: z.string().trim().max(100).default("Maroc"),
  email: optText(200).refine((v) => !v || /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v), "E-mail invalide"),
  phone: optText(50),
  contactName: optText(200),
  notes: optText(),
  hubspotCompanyId: optText(64),
  hubspotContactId: optText(64),
});

export type ClientData = z.infer<typeof clientSchema>;

export const paymentSchema = z.object({
  invoiceId: z.string().min(1),
  amount: num(0.01, 100_000_000),
  date: z.string().min(10).transform((v) => new Date(`${v.slice(0, 10)}T00:00:00Z`)),
  method: z.enum(["VIREMENT", "CHEQUE", "ESPECES", "EFFET", "CARTE", "AUTRE"]),
  reference: optText(100),
  notes: optText(1000),
});

export type PaymentData = z.infer<typeof paymentSchema>;

export function formatZodError(e: z.ZodError): string {
  return e.issues
    .map((i) => {
      const path = i.path.join(".").replace(/^lines\.(\d+)/, (_m, n) => `Ligne ${Number(n) + 1}`);
      return path ? `${path} : ${i.message}` : i.message;
    })
    .join(" · ");
}
