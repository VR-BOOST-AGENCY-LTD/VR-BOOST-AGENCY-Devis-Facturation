import type { Client } from "@/generated/prisma/client";
import { computeTotals, lineTotalCents, toCents, type Totals, type VatGroup } from "@/lib/calc";
import type { LineData } from "@/lib/validation";

export const dec2 = (cents: number) => (cents / 100).toFixed(2);
export const num = (d: { toString(): string } | null | undefined) => (d == null ? 0 : Number(d.toString()));
export const cents = (d: { toString(): string } | null | undefined) => (d == null ? 0 : toCents(num(d)));

export function linesForDb(lines: LineData[]) {
  return lines.map((l, i) => ({
    position: i + 1,
    designation: l.designation,
    description: l.description ?? null,
    quantity: l.quantity.toFixed(3),
    unit: l.unit,
    unitPrice: l.unitPrice.toFixed(2),
    vatRate: l.vatRate.toFixed(2),
    discountPercent: (l.discountPercent ?? 0).toFixed(2),
    totalHt: dec2(lineTotalCents(l)),
  }));
}

export function totalsForDb(t: Totals) {
  return {
    totalHt: dec2(t.totalHt),
    totalVat: dec2(t.totalVat),
    totalTtc: dec2(t.totalTtc),
    vatBreakdown: t.vatBreakdown,
  };
}

type DbLine = {
  designation: string;
  description: string | null;
  quantity: { toString(): string };
  unit: string;
  unitPrice: { toString(): string };
  vatRate: { toString(): string };
  discountPercent: { toString(): string };
};

export function dbLineToData(l: DbLine): LineData {
  return {
    designation: l.designation,
    description: l.description,
    quantity: num(l.quantity),
    unit: l.unit,
    unitPrice: num(l.unitPrice),
    vatRate: num(l.vatRate),
    discountPercent: num(l.discountPercent),
  };
}

export function totalsOfDbLines(lines: DbLine[]): Totals {
  return computeTotals(lines.map(dbLineToData));
}

export function breakdownOf(json: unknown): VatGroup[] {
  return Array.isArray(json) ? (json as VatGroup[]) : [];
}

export function clientSnapshot(c: Client) {
  return {
    name: c.name,
    type: c.type,
    ice: c.ice,
    ifNumber: c.ifNumber,
    rc: c.rc,
    address: c.address,
    city: c.city,
    country: c.country,
    email: c.email,
    phone: c.phone,
    contactName: c.contactName,
  };
}

export type ClientSnapshot = ReturnType<typeof clientSnapshot>;
