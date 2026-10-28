// Notifications internes par e-mail : soumission au CEO, décision (approbation / renvoi) à l'auteur.
// Best-effort : un échec d'envoi est journalisé mais ne bloque jamais le workflow.
import "server-only";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { formatCents, quoteReference } from "@/lib/format";
import type { Actor } from "@/lib/permissions";
import { getSettings } from "@/lib/settings";
import { cents } from "./common";
import { mailEnabled, sendMail } from "./mailer";

type Kind = "QUOTE" | "INVOICE";

const appUrl = () => (process.env.APP_URL || "http://localhost:3100").replace(/\/$/, "");

async function loadDoc(kind: Kind, id: string) {
  if (kind === "QUOTE") {
    const q = await db.quote.findUnique({ where: { id }, include: { client: true, createdBy: true } });
    if (!q) return null;
    return {
      label: `Devis ${q.number ? quoteReference(q.reference, q.version) : "(brouillon)"}`,
      title: q.title,
      client: q.client.name,
      amount: cents(q.totalTtc),
      author: q.createdBy,
      url: `${appUrl()}/devis/${id}`,
    };
  }
  const inv = await db.invoice.findUnique({ where: { id }, include: { client: true, createdBy: true } });
  if (!inv) return null;
  const type = { STANDARD: "Facture", DEPOSIT: "Facture d'acompte", BALANCE: "Facture de solde", CREDIT_NOTE: "Avoir" }[inv.type];
  return {
    label: `${type} ${inv.reference ?? "(brouillon)"}`,
    title: inv.title,
    client: inv.client.name,
    amount: cents(inv.netToPay),
    author: inv.createdBy,
    url: `${appUrl()}/factures/${id}`,
  };
}

async function enabled() {
  return mailEnabled() && (await getSettings()).notificationsEnabled;
}

async function deliver(kind: Kind, id: string, actor: Actor, to: string[], subject: string, text: string) {
  if (to.length === 0) return;
  try {
    await sendMail({ to, subject, text });
    await audit(db, actor, "notify.sent", kind, id, `Notification envoyée à ${to.join(", ")} : ${subject}`);
  } catch (e) {
    await audit(db, actor, "notify.error", kind, id, `Échec de notification : ${(e as Error).message.slice(0, 200)}`);
  }
}

/** Document soumis : prévient le(s) CEO (sauf si c'est lui-même qui soumet). */
export async function notifySubmitted(kind: Kind, id: string, actor: Actor) {
  if (!(await enabled())) return;
  const doc = await loadDoc(kind, id);
  if (!doc) return;
  const ceos = await db.user.findMany({ where: { role: "CEO", active: true, id: { not: actor.id } } });
  await deliver(kind, id, actor, ceos.map((u) => u.email),
    `[À valider] ${doc.label} — ${doc.client} — ${formatCents(doc.amount)}`,
    `Bonjour,

${doc.author.name} a soumis un document à votre validation :

  ${doc.label}
  Client : ${doc.client}
  Objet : ${doc.title}
  Montant : ${formatCents(doc.amount)} TTC

Pour l'examiner, l'approuver ou le renvoyer :
${doc.url}

— VR BOOST · Devis & Factures`);
}

/** Décision du CEO : prévient l'auteur du document (s'il n'est pas l'auteur de la décision). */
export async function notifyDecision(kind: Kind, id: string, actor: Actor, decision: "approved" | "rejected", comment?: string) {
  if (!(await enabled())) return;
  const doc = await loadDoc(kind, id);
  if (!doc || doc.author.id === actor.id || !doc.author.active) return;
  const approved = decision === "approved";
  await deliver(kind, id, actor, [doc.author.email],
    `${approved ? "[Approuvé]" : "[À corriger]"} ${doc.label} — ${doc.client}`,
    `Bonjour ${doc.author.name},

${approved
  ? `Votre document a été approuvé${kind === "INVOICE" ? " et émis" : ""} par le CEO :`
  : "Votre document a été renvoyé en brouillon par le CEO :"}

  ${doc.label}
  Client : ${doc.client}
  Objet : ${doc.title}
  Montant : ${formatCents(doc.amount)} TTC
${!approved && comment ? `\nMotif / corrections attendues :\n  ${comment}\n` : ""}
${approved ? "Le PDF officiel est disponible et peut être envoyé au client :" : "Pour corriger et soumettre à nouveau :"}
${doc.url}

— VR BOOST · Devis & Factures`);
}
