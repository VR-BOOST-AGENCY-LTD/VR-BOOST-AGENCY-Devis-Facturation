import { describe, expect, it } from "vitest";
import { balanceAmounts, computeTotals, depositLines, lineTotalCents, remainingDue, toCents, vatOf } from "@/lib/calc";
import { amountInWords, formatCents, formatReference, numberToFrenchWords } from "@/lib/format";

describe("Calculs HT / TVA / TTC", () => {
  it("ligne simple et remise", () => {
    expect(lineTotalCents({ quantity: 1, unitPrice: 3000, vatRate: 20 })).toBe(300_000);
    expect(lineTotalCents({ quantity: 2, unitPrice: 3000, vatRate: 20, discountPercent: 10 })).toBe(540_000);
    expect(lineTotalCents({ quantity: 1.5, unitPrice: 333.33, vatRate: 20 })).toBe(50_000); // 499,995 → 500,00
    expect(lineTotalCents({ quantity: 3, unitPrice: 0.1, vatRate: 20 })).toBe(30); // pas d'erreur flottante
  });

  it("reproduit le devis de référence Yakeey 000187/2026 (29 500 HT → 35 400 TTC)", () => {
    const prices = [3000, 3000, 6000, 2000, 2500, 7000, 3500, 2500];
    const t = computeTotals(prices.map((p) => ({ quantity: 1, unitPrice: p, vatRate: 20 })));
    expect(t).toMatchObject({ totalHt: 2_950_000, totalVat: 590_000, totalTtc: 3_540_000 });
  });

  it("reproduit la facture de référence 00335/26 (8 250 HT → 9 900 TTC)", () => {
    const t = computeTotals([2000, 3100, 1850, 1300].map((p) => ({ quantity: 1, unitPrice: p, vatRate: 20 })));
    expect(t.totalTtc).toBe(990_000);
    expect(amountInWords(t.totalTtc)).toBe("neuf mille neuf cents dirhams");
  });

  it("TVA multi-taux ventilée et arrondie par taux", () => {
    const t = computeTotals([
      { quantity: 1, unitPrice: 1000, vatRate: 20 },
      { quantity: 1, unitPrice: 500, vatRate: 10 },
      { quantity: 1, unitPrice: 200, vatRate: 0 },
      { quantity: 3, unitPrice: 33.33, vatRate: 20 },
    ]);
    expect(t.vatBreakdown).toEqual([
      { rate: 20, base: 109_999, vat: 22_000 },
      { rate: 10, base: 50_000, vat: 5_000 },
      { rate: 0, base: 20_000, vat: 0 },
    ]);
    expect(t.totalTtc).toBe(t.totalHt + t.totalVat);
    expect(vatOf(1, 20)).toBe(0);
  });

  it("remise hors bornes refusée", () => {
    expect(() => lineTotalCents({ quantity: 1, unitPrice: 10, vatRate: 20, discountPercent: 120 })).toThrow();
  });
});

describe("Acomptes et soldes", () => {
  const quote = computeTotals([
    { quantity: 1, unitPrice: 10_000, vatRate: 20 },
    { quantity: 1, unitPrice: 999.99, vatRate: 10 },
  ]);

  it("acompte 50 % ventilé par taux", () => {
    const lines = depositLines(quote.vatBreakdown, 50);
    expect(lines).toEqual([{ rate: 20, baseCents: 500_000 }, { rate: 10, baseCents: 50_000 }]);
  });

  it("solde = total − acomptes, sans double comptage", () => {
    const dep = computeTotals(depositLines(quote.vatBreakdown, 50).map((l) => ({ quantity: 1, unitPrice: l.baseCents / 100, vatRate: l.rate })));
    const d = { invoiceId: "a", reference: "00455/2026", ht: dep.totalHt, vat: dep.totalVat, ttc: dep.totalTtc, breakdown: dep.vatBreakdown };
    const bal = balanceAmounts(quote, [d]);
    expect(bal.netToPay + dep.totalTtc).toBe(quote.totalTtc);
    expect(() => balanceAmounts(quote, [d, d])).toThrow(/deux fois/);
    expect(() => balanceAmounts(quote, [d, { ...d, invoiceId: "b" }, { ...d, invoiceId: "c" }])).toThrow(/dépassent/);
  });

  it("reste à payer jamais négatif", () => {
    expect(remainingDue(10_000, 4_000, 0)).toBe(6_000);
    expect(remainingDue(10_000, 4_000, 6_000)).toBe(0);
    expect(remainingDue(10_000, 12_000, 0)).toBe(0);
  });
});

describe("Formats", () => {
  it("références et montants", () => {
    expect(formatReference(455, 2026)).toBe("00455/2026");
    expect(formatReference(455, 2026, 5, "FAC-{n}/{yy}")).toBe("FAC-00455/26");
    expect(formatCents(3_540_000)).toBe("35 400 MAD");
    expect(formatCents(123_456, "MAD", true)).toBe("1 234,56 MAD");
    expect(toCents("1234.565")).toBe(123_457);
  });
  it("montant en lettres", () => {
    expect(numberToFrenchWords(71)).toBe("soixante et onze");
    expect(numberToFrenchWords(80)).toBe("quatre-vingts");
    expect(numberToFrenchWords(81)).toBe("quatre-vingt-un");
    expect(numberToFrenchWords(200_000)).toBe("deux cent mille");
    expect(numberToFrenchWords(1_000_000)).toBe("un million");
    expect(amountInWords(3_540_050)).toBe("trente-cinq mille quatre cents dirhams et cinquante centimes");
  });
});
