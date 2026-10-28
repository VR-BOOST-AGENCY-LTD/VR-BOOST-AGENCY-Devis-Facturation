// Relances des factures en retard : e-mail au client avec la facture officielle jointe,
// copie interne, ton progressif. Automatique (tâche planifiée quotidienne) ou manuelle.
import "server-only";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { remainingDue } from "@/lib/calc";
import { AppError, conflict, notFound } from "@/lib/errors";
import { addDays, formatCents, formatDateLong, todayUtc } from "@/lib/format";
import { assertCan, type Actor } from "@/lib/permissions";
import { getSettings } from "@/lib/settings";
import { archiveOfficialPdf } from "@/pdf/render";
import { cents } from "./common";
import { EMAIL, mailEnabled, sendMail } from "./mailer";

const TONE = [
  { subject: "Rappel de paiement", intro: "Sauf erreur de notre part, la facture ci-dessous reste à régler à ce jour." },
  { subject: "Deuxième relance", intro: "Malgré notre précédent rappel, nous n'avons pas encore reçu le règlement de la facture ci-dessous." },
  { subject: "Dernière relance avant mise en demeure", intro: "Nous vous remercions de procéder sans délai au règlement de la facture ci-dessous, qui demeure impayée malgré nos relances." },
];

/** Factures éligibles à une relance automatique aujourd'hui. */
export async function dueForReminder(today = todayUtc()) {
  const s = await getSettings();
  const list = await db.invoice.findMany({
    where: {
      type: { not: "CREDIT_NOTE" },
      status: { in: ["ISSUED", "PARTIALLY_PAID"] },
      dueDate: { lt: today },
      reminderCount: { lt: s.reminderMaxCount },
      OR: [{ lastReminderAt: null }, { lastReminderAt: { lte: addDays(today, -s.reminderIntervalDays) } }],
    },
    include: { client: true },
    orderBy: { dueDate: "asc" },
  });
  return list.filter((i) => i.client.email && EMAIL.test(i.client.email));
}

export async function sendReminder(actor: Actor | null, invoiceId: string) {
  if (actor) assertCan(actor, "document.send");
  if (!mailEnabled()) throw new AppError("Envoi d'e-mails non configuré (SMTP).", "CONFLICT");
  const inv = await db.invoice.findUnique({ where: { id: invoiceId }, include: { client: true } });
  if (!inv) throw notFound();
  if (inv.type === "CREDIT_NOTE" || !["ISSUED", "PARTIALLY_PAID"].includes(inv.status)) {
    throw conflict("Relance possible uniquement sur une facture émise non soldée.");
  }
  const to = inv.client.email?.trim();
  if (!to || !EMAIL.test(to)) throw conflict("Le client n'a pas d'adresse e-mail valide sur sa fiche.");
  const due = remainingDue(cents(inv.netToPay), cents(inv.amountPaid), cents(inv.amountCredited));
  if (due <= 0) throw conflict("Cette facture est soldée.");

  const s = await getSettings();
  const file = await archiveOfficialPdf("INVOICE", inv.id, actor?.id ?? null);
  if (!file) throw conflict("PDF officiel indisponible.");
  const tone = TONE[Math.min(inv.reminderCount, TONE.length - 1)];
  const internal = (process.env.MAIL_REMINDER_CC || process.env.SMTP_USER || "").split(",").map((x) => x.trim()).filter(Boolean);

  await sendMail({
    to: [to],
    cc: internal,
    subject: `${tone.subject} — Facture N° ${inv.reference} — ${s.companyName}`,
    text: `Bonjour${inv.client.contactName ? ` ${inv.client.contactName}` : ""},

${tone.intro}

  Facture N° ${inv.reference} du ${formatDateLong(inv.issueDate)}
  Échéance : ${formatDateLong(inv.dueDate)}
  Reste à payer : ${formatCents(due)} TTC

Règlement par virement :
  Banque : ${s.bankName}
  RIB : ${s.rib}
  Titulaire : ${s.accountHolder}

Si le règlement a été effectué entre-temps, merci de ne pas tenir compte de ce message et de nous transmettre la référence du virement.

La facture est jointe à ce message.

Cordialement,
${s.companyName}
${s.phone} · ${s.website}`,
    attachments: [{ filename: file.filename, content: Buffer.from(file.data), contentType: "application/pdf" }],
  });

  await db.invoice.update({
    where: { id: inv.id },
    data: { lastReminderAt: new Date(), reminderCount: { increment: 1 } },
  });
  await audit(db, actor, "invoice.reminder", "INVOICE", inv.id,
    `Relance n°${inv.reminderCount + 1} envoyée à ${to} (reste dû ${formatCents(due)})${actor ? "" : " — automatique"}`);
  return { to, count: inv.reminderCount + 1 };
}

/** Exécution planifiée (quotidienne) : n'envoie rien si les relances automatiques sont désactivées. */
export async function runAutoReminders() {
  const s = await getSettings();
  if (!s.remindersEnabled) return { enabled: false, sent: 0, errors: [] as string[] };
  const list = await dueForReminder();
  const errors: string[] = [];
  let sent = 0;
  for (const inv of list) {
    try {
      await sendReminder(null, inv.id);
      sent++;
    } catch (e) {
      errors.push(`${inv.reference} : ${(e as Error).message}`);
    }
  }
  return { enabled: true, sent, errors };
}
