// Agrégats du tableau de bord (lecture seule). Montants en centimes.
import { db } from "@/lib/db";
import { remainingDue } from "@/lib/calc";
import { todayUtc } from "@/lib/format";
import { cents } from "./common";

const MONTHS = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];

export type TrendPoint = { key: string; label: string; invoiced: number; collected: number };
export type FlowStage = { key: string; label: string; count: number; amount: number };

export async function dashboardData() {
  const today = todayUtc();
  const start = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 11, 1));
  const yearStart = new Date(Date.UTC(today.getUTCFullYear(), 0, 1));

  const [invoices, payments, quotes, open] = await Promise.all([
    db.invoice.findMany({
      where: { number: { not: null }, issueDate: { gte: start } },
      select: { type: true, issueDate: true, totalHt: true, totalTtc: true, deductedTtc: true, netToPay: true },
    }),
    db.payment.findMany({ where: { cancelledAt: null, date: { gte: start } }, select: { amount: true, date: true } }),
    db.quote.findMany({
      where: { number: { not: null }, issueDate: { gte: start }, status: { notIn: ["SUPERSEDED", "CANCELLED"] } },
      select: { status: true, totalTtc: true, sentAt: true, invoices: { select: { status: true, type: true, number: true } } },
    }),
    db.invoice.findMany({
      where: { type: { not: "CREDIT_NOTE" }, status: { in: ["ISSUED", "PARTIALLY_PAID"] } },
      select: { netToPay: true, amountPaid: true, amountCredited: true, dueDate: true, client: { select: { id: true, name: true } } },
    }),
  ]);

  // --- Tendance mensuelle (12 mois), en TTC pour comparer facturé et encaissé :
  //     facturé = net à payer des factures émises (acomptes comptés une fois), moins les avoirs
  const trend: TrendPoint[] = Array.from({ length: 12 }, (_, i) => {
    const d = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + i, 1));
    return { key: `${d.getUTCFullYear()}-${d.getUTCMonth()}`, label: MONTHS[d.getUTCMonth()], invoiced: 0, collected: 0 };
  });
  const idx = (d: Date) => trend.findIndex((t) => t.key === `${d.getUTCFullYear()}-${d.getUTCMonth()}`);
  for (const inv of invoices) {
    const i = idx(inv.issueDate!);
    if (i < 0) continue;
    trend[i].invoiced += (inv.type === "CREDIT_NOTE" ? -1 : 1) * cents(inv.netToPay);
  }
  for (const p of payments) {
    const i = idx(p.date);
    if (i >= 0) trend[i].collected += cents(p.amount);
  }

  // --- Pipeline : du devis émis à l'encaissement (12 mois glissants)
  const sum = (arr: typeof quotes) => arr.reduce((s, q) => s + cents(q.totalTtc), 0);
  const sent = quotes.filter((q) => q.sentAt || ["SENT", "ACCEPTED", "REFUSED"].includes(q.status));
  const accepted = quotes.filter((q) => q.status === "ACCEPTED");
  const invoicedQ = accepted.filter((q) => q.invoices.some((i) => i.number != null && i.type !== "CREDIT_NOTE"));
  const paidQ = invoicedQ.filter((q) => {
    const real = q.invoices.filter((i) => i.number != null && i.type !== "CREDIT_NOTE" && i.status !== "CANCELLED");
    return real.length > 0 && real.every((i) => i.status === "PAID");
  });
  const flow: FlowStage[] = [
    { key: "issued", label: "Devis émis", count: quotes.length, amount: sum(quotes) },
    { key: "sent", label: "Envoyés", count: sent.length, amount: sum(sent) },
    { key: "accepted", label: "Acceptés", count: accepted.length, amount: sum(accepted) },
    { key: "invoiced", label: "Facturés", count: invoicedQ.length, amount: sum(invoicedQ) },
    { key: "paid", label: "Encaissés", count: paidQ.length, amount: sum(paidQ) },
  ];

  // --- Encaissement de l'année : encaissé / facturé TTC (net d'avoirs)
  const yearInvoiced = invoices
    .filter((i) => i.issueDate! >= yearStart)
    .reduce((s, i) => s + (i.type === "CREDIT_NOTE" ? -1 : 1) * cents(i.netToPay), 0);
  const yearCollected = payments.filter((p) => p.date >= yearStart).reduce((s, p) => s + cents(p.amount), 0);

  // --- Reste à encaisser : total, retards, principaux clients
  let outstanding = 0;
  let overdue = 0;
  let overdueCount = 0;
  const byClient = new Map<string, { name: string; due: number; late: boolean }>();
  for (const inv of open) {
    const due = remainingDue(cents(inv.netToPay), cents(inv.amountPaid), cents(inv.amountCredited));
    const late = inv.dueDate != null && inv.dueDate < today;
    outstanding += due;
    if (late) { overdue += due; overdueCount++; }
    const c = byClient.get(inv.client.id) ?? { name: inv.client.name, due: 0, late: false };
    c.due += due;
    c.late ||= late;
    byClient.set(inv.client.id, c);
  }
  const topClients = [...byClient.values()].sort((a, b) => b.due - a.due).slice(0, 5);

  return {
    trend,
    flow,
    yearInvoiced,
    yearCollected,
    outstanding,
    overdue,
    overdueCount,
    openCount: open.length,
    topClients,
    revenue12: invoices.reduce((s, inv) => {
      const ttc = cents(inv.totalTtc);
      const ratio = ttc ? (ttc - cents(inv.deductedTtc)) / ttc : 1;
      return s + (inv.type === "CREDIT_NOTE" ? -1 : 1) * Math.round(cents(inv.totalHt) * ratio);
    }, 0),
  };
}
