// Calculs financiers — fonctions pures, en centimes entiers (aucun flottant dans les montants).
// Règles :
//  - Total HT ligne = quantité × prix unitaire HT × (1 − remise %), arrondi au centime (demi vers le haut).
//  - TVA calculée par taux sur la base HT cumulée du taux (arrondi par taux), pas ligne à ligne.
//  - TTC = HT + TVA.

export type LineInput = {
  quantity: number; // jusqu'à 3 décimales
  unitPrice: number; // MAD HT, 2 décimales
  vatRate: number; // en %, ex. 20
  discountPercent?: number; // en %, ex. 10
};

export type VatGroup = { rate: number; base: number; vat: number }; // base & vat en centimes

export type Totals = {
  totalHt: number;
  totalVat: number;
  totalTtc: number;
  vatBreakdown: VatGroup[];
};

/** Division entière arrondie au plus proche, demi s'éloignant de zéro. */
function roundDiv(n: bigint, d: bigint): bigint {
  const neg = n < 0n !== d < 0n;
  const an = n < 0n ? -n : n;
  const ad = d < 0n ? -d : d;
  const q = (an * 2n + ad) / (ad * 2n);
  return neg ? -q : q;
}

/** Convertit un décimal en entier mis à l'échelle (ex. 12.345 × 1000) sans erreur flottante. */
function scaled(value: number, decimals: number): bigint {
  if (!Number.isFinite(value)) throw new Error("Valeur numérique invalide");
  return BigInt(Math.round(Number(value.toFixed(decimals)) * 10 ** decimals));
}

export function toCents(mad: number | string | { toString(): string }): number {
  const n = typeof mad === "number" ? mad : Number(mad.toString());
  return Number(scaled(n, 2));
}

export function fromCents(cents: number): number {
  return cents / 100;
}

/** Montant HT d'une ligne en centimes. */
export function lineTotalCents(line: LineInput): number {
  const qty = scaled(line.quantity, 3); // ×1000
  const price = scaled(line.unitPrice, 2); // centimes
  const discount = scaled(line.discountPercent ?? 0, 2); // %×100
  if (discount < 0n || discount > 10000n) throw new Error("Remise hors bornes (0–100 %)");
  return Number(roundDiv(qty * price * (10000n - discount), 1000n * 10000n));
}

export function vatOf(baseCents: number, rate: number): number {
  return Number(roundDiv(BigInt(baseCents) * scaled(rate, 2), 10000n));
}

/** Totaux d'un document à partir de ses lignes. */
export function computeTotals(lines: LineInput[]): Totals {
  const groups = new Map<number, number>();
  let totalHt = 0;
  for (const l of lines) {
    const ht = lineTotalCents(l);
    totalHt += ht;
    const rate = Number(l.vatRate.toFixed(2));
    groups.set(rate, (groups.get(rate) ?? 0) + ht);
  }
  const vatBreakdown = [...groups.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([rate, base]) => ({ rate, base, vat: vatOf(base, rate) }));
  const totalVat = vatBreakdown.reduce((s, g) => s + g.vat, 0);
  return { totalHt, totalVat, totalTtc: totalHt + totalVat, vatBreakdown };
}

/**
 * Lignes d'une facture d'acompte : une ligne par taux de TVA du devis, base = pourcentage de la base HT.
 * Garantit que la TVA de l'acompte suit la ventilation du devis.
 */
export function depositLines(
  quoteBreakdown: VatGroup[],
  percent: number,
): { rate: number; baseCents: number }[] {
  if (percent <= 0 || percent > 100) throw new Error("Pourcentage d'acompte invalide");
  const p = scaled(percent, 2); // %×100
  return quoteBreakdown
    .filter((g) => g.base !== 0)
    .map((g) => ({ rate: g.rate, baseCents: Number(roundDiv(BigInt(g.base) * p, 10000n)) }));
}

export type Deduction = {
  invoiceId: string;
  reference: string;
  ht: number;
  vat: number;
  ttc: number;
  breakdown: VatGroup[];
};

/**
 * Facture de solde : total du devis moins les acomptes réellement facturés (nets d'avoirs).
 * Les acomptes ne sont déduits qu'une seule fois : chaque facture d'acompte n'apparaît qu'une fois.
 */
export function balanceAmounts(total: Totals, deductions: Deduction[]) {
  const ids = new Set<string>();
  for (const d of deductions) {
    if (ids.has(d.invoiceId)) throw new Error(`Acompte ${d.reference} déduit deux fois`);
    ids.add(d.invoiceId);
  }
  const deductedHt = deductions.reduce((s, d) => s + d.ht, 0);
  const deductedVat = deductions.reduce((s, d) => s + d.vat, 0);
  const deductedTtc = deductions.reduce((s, d) => s + d.ttc, 0);
  if (deductedTtc > total.totalTtc) throw new Error("Les acomptes dépassent le total du devis");
  return {
    deductedHt,
    deductedVat,
    deductedTtc,
    netHt: total.totalHt - deductedHt,
    netVat: total.totalVat - deductedVat,
    netToPay: total.totalTtc - deductedTtc,
  };
}

/** Reste à payer d'une facture émise. */
export function remainingDue(netToPay: number, paid: number, credited: number): number {
  return Math.max(0, netToPay - paid - credited);
}
