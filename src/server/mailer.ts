// Envoi des documents officiels au client par e-mail (SMTP), avec le PDF archivé en pièce jointe.
import "server-only";
import nodemailer from "nodemailer";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { AppError, conflict, invalid, notFound } from "@/lib/errors";
import { formatCents, quoteReference } from "@/lib/format";
import { assertCan, type Actor } from "@/lib/permissions";
import { getSettings } from "@/lib/settings";
import { archiveOfficialPdf } from "@/pdf/render";
import { cents } from "./common";
import { markQuoteSent } from "./quotes";

export const mailEnabled = () => Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASSWORD);

function transport() {
  const port = Number(process.env.SMTP_PORT || 465);
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure: port === 465,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD },
  });
}

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

function parseList(v: string | null | undefined): string[] {
  return (v ?? "").split(/[,;\s]+/).map((x) => x.trim()).filter(Boolean);
}

export type DraftEmail = { to: string; cc: string; subject: string; message: string };

/** Brouillon d'e-mail prérempli (destinataire = e-mail de la fiche client). */
export async function draftDocumentEmail(entityType: "QUOTE" | "INVOICE", id: string): Promise<DraftEmail> {
  const s = await getSettings();
  if (entityType === "QUOTE") {
    const q = await db.quote.findUnique({ where: { id }, include: { client: true } });
    if (!q) throw notFound();
    const ref = quoteReference(q.reference, q.version);
    return {
      to: q.client.email ?? "",
      cc: "",
      subject: `Devis N° ${ref} — ${q.title} — ${s.companyName}`,
      message: `Bonjour${q.client.contactName ? ` ${q.client.contactName}` : ""},

Veuillez trouver ci-joint notre devis N° ${ref} relatif à « ${q.title} », d'un montant de ${formatCents(cents(q.totalTtc))} TTC.

${q.paymentTerms}
Ce devis est valable ${q.validityDays} jours à compter de sa date d'émission.

Pour le valider, il vous suffit de nous le retourner signé avec la mention « Bon pour accord ».

Nous restons à votre disposition pour toute question.

Cordialement,
${s.companyName}
${s.phone} · ${s.website}`,
    };
  }
  const inv = await db.invoice.findUnique({ where: { id }, include: { client: true } });
  if (!inv) throw notFound();
  const label = inv.type === "CREDIT_NOTE" ? "Avoir" : inv.type === "DEPOSIT" ? "Facture d'acompte" : inv.type === "BALANCE" ? "Facture de solde" : "Facture";
  return {
    to: inv.client.email ?? "",
    cc: "",
    subject: `${label} N° ${inv.reference} — ${s.companyName}`,
    message: `Bonjour${inv.client.contactName ? ` ${inv.client.contactName}` : ""},

Veuillez trouver ci-joint notre ${label.toLowerCase()} N° ${inv.reference}${inv.type === "CREDIT_NOTE" ? "" : `, d'un montant net à payer de ${formatCents(cents(inv.netToPay))} TTC`}.
${inv.type === "CREDIT_NOTE" ? "" : `
Règlement par virement :
Banque : ${s.bankName}
RIB : ${s.rib}
Titulaire : ${s.accountHolder}
`}
Nous restons à votre disposition pour toute question.

Cordialement,
${s.companyName}
${s.phone} · ${s.website}`,
  };
}

export async function sendDocumentEmail(actor: Actor, entityType: "QUOTE" | "INVOICE", id: string, input: DraftEmail) {
  assertCan(actor, "document.send");
  if (!mailEnabled()) throw new AppError("Envoi d'e-mails non configuré (SMTP).", "CONFLICT");
  const to = parseList(input.to);
  const cc = parseList(input.cc);
  if (to.length === 0) throw invalid("Destinataire obligatoire.");
  const bad = [...to, ...cc].find((a) => !EMAIL.test(a));
  if (bad) throw invalid(`Adresse e-mail invalide : ${bad}`);
  if (!input.subject?.trim()) throw invalid("Objet obligatoire.");

  // Seuls les documents officiels (approuvés / émis) peuvent être envoyés.
  if (entityType === "QUOTE") {
    const q = await db.quote.findUnique({ where: { id } });
    if (!q) throw notFound();
    if (!["APPROVED", "SENT", "ACCEPTED"].includes(q.status)) throw conflict("Seul un devis approuvé par le CEO peut être envoyé.");
  } else {
    const inv = await db.invoice.findUnique({ where: { id } });
    if (!inv) throw notFound();
    if (inv.number == null) throw conflict("Seule une facture émise peut être envoyée.");
  }
  const file = await archiveOfficialPdf(entityType, id, actor.id);
  if (!file) throw conflict("PDF officiel indisponible.");

  const info = await transport().sendMail({
    from: process.env.MAIL_FROM || process.env.SMTP_USER,
    replyTo: process.env.MAIL_REPLY_TO || undefined,
    to,
    cc: cc.length ? cc : undefined,
    subject: input.subject.trim(),
    text: input.message,
    attachments: [{ filename: file.filename, content: Buffer.from(file.data), contentType: "application/pdf" }],
  });

  if (entityType === "QUOTE") {
    const q = await db.quote.findUniqueOrThrow({ where: { id } });
    if (q.status === "APPROVED") await markQuoteSent(actor, id);
  }
  await audit(db, actor, "email.sent", entityType, id, `${file.reference} envoyé par e-mail à ${[...to, ...cc].join(", ")}`, {
    to, cc, subject: input.subject.trim(), messageId: info.messageId, sha256: file.sha256,
  });
  return { messageId: info.messageId };
}
