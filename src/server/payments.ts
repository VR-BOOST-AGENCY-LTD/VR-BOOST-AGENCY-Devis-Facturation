// Suivi des règlements : paiements partiels, jamais supprimés (annulation tracée), reste à payer exact.
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { toCents, remainingDue } from "@/lib/calc";
import { conflict, invalid, notFound } from "@/lib/errors";
import { formatCents } from "@/lib/format";
import { assertCan, type Actor } from "@/lib/permissions";
import { paymentSchema } from "@/lib/validation";
import { cents, dec2 } from "./common";
import { statusFor } from "./invoices";

export async function recordPayment(actor: Actor, input: unknown) {
  assertCan(actor, "payment.record");
  const data = paymentSchema.parse(input);
  const amount = toCents(data.amount);
  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Invoice" WHERE id = ${data.invoiceId} FOR UPDATE`;
    const inv = await tx.invoice.findUnique({ where: { id: data.invoiceId } });
    if (!inv || inv.deletedAt) throw notFound();
    if (inv.type === "CREDIT_NOTE") throw invalid("Un avoir ne reçoit pas de paiement.");
    if (!["ISSUED", "PARTIALLY_PAID"].includes(inv.status)) {
      throw conflict("Paiement possible uniquement sur une facture émise non soldée.");
    }
    const net = cents(inv.netToPay);
    const paid = cents(inv.amountPaid);
    const credited = cents(inv.amountCredited);
    const due = remainingDue(net, paid, credited);
    if (amount > due) throw conflict(`Montant supérieur au reste à payer (${formatCents(due)}).`);
    const p = await tx.payment.create({
      data: {
        invoiceId: inv.id,
        amount: dec2(amount),
        date: data.date,
        method: data.method,
        reference: data.reference,
        notes: data.notes,
        recordedById: actor.id,
      },
    });
    const newPaid = paid + amount;
    await tx.invoice.update({
      where: { id: inv.id },
      data: { amountPaid: dec2(newPaid), status: statusFor(net, newPaid, credited) },
    });
    await audit(tx, actor, "payment.record", "INVOICE", inv.id,
      `Paiement de ${formatCents(amount)} enregistré sur ${inv.reference} (${data.method})`,
      { paymentId: p.id, remaining: (due - amount) / 100 });
    return p;
  });
}

export async function cancelPayment(actor: Actor, paymentId: string, reason: string) {
  assertCan(actor, "payment.cancel");
  if (!reason?.trim()) throw invalid("Motif d'annulation obligatoire.");
  return db.$transaction(async (tx) => {
    const p = await tx.payment.findUnique({ where: { id: paymentId } });
    if (!p) throw notFound("Paiement introuvable");
    if (p.cancelledAt) throw conflict("Paiement déjà annulé.");
    await tx.$queryRaw`SELECT id FROM "Invoice" WHERE id = ${p.invoiceId} FOR UPDATE`;
    const inv = await tx.invoice.findUniqueOrThrow({ where: { id: p.invoiceId } });
    await tx.payment.update({ where: { id: p.id }, data: { cancelledAt: new Date(), cancelReason: reason.trim() } });
    const newPaid = cents(inv.amountPaid) - cents(p.amount);
    await tx.invoice.update({
      where: { id: inv.id },
      data: {
        amountPaid: dec2(newPaid),
        status: statusFor(cents(inv.netToPay), newPaid, cents(inv.amountCredited)),
      },
    });
    await audit(tx, actor, "payment.cancel", "INVOICE", inv.id,
      `Paiement de ${formatCents(cents(p.amount))} annulé sur ${inv.reference} : ${reason.trim()}`, { paymentId });
  });
}
