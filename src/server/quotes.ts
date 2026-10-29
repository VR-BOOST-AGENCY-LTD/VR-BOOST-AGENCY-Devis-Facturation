// Module DEVIS — workflow : Brouillon → Soumission CEO → Approbation (numéro) → Envoi → Accepté / Refusé.
// Toute modification d'un devis approuvé passe par une nouvelle version, soumise à nouvelle validation.
import { computeTotals } from "@/lib/calc";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { conflict, forbidden, invalid, notFound } from "@/lib/errors";
import { addDays, formatReference, quoteReference, todayUtc } from "@/lib/format";
import { allocateNumber } from "@/lib/numbering";
import { assertCan, assertNotSelfApproval, can, type Actor } from "@/lib/permissions";
import { getSettings } from "@/lib/settings";
import { quoteSchema, type QuoteData } from "@/lib/validation";
import { clientSnapshot, linesForDb, num, totalsForDb } from "./common";

const EDITABLE = ["DRAFT", "PENDING_APPROVAL"] as const;

/** Applique les conditions par défaut si l'utilisateur n'a pas le droit de les modifier. */
async function enforceTerms(actor: Actor, data: QuoteData): Promise<QuoteData> {
  const s = await getSettings();
  if (can(actor, "terms.edit") || s.salesCanEditTerms) return data;
  return {
    ...data,
    paymentTerms: s.defaultPaymentTerms,
    depositPercent: num(s.defaultDepositPercent),
    validityDays: s.defaultValidityDays,
  };
}

export async function createQuote(actor: Actor, input: unknown) {
  assertCan(actor, "quote.create");
  const data = await enforceTerms(actor, quoteSchema.parse(input));
  const client = await db.client.findUnique({ where: { id: data.clientId } });
  if (!client) throw notFound("Client introuvable");
  const totals = computeTotals(data.lines);
  return db.$transaction(async (tx) => {
    const q = await tx.quote.create({
      data: {
        clientId: data.clientId,
        hubspotDealId: data.hubspotDealId,
        title: data.title,
        subtitle: data.subtitle,
        projectName: data.projectName,
        validityDays: data.validityDays,
        depositPercent: data.depositPercent.toFixed(2),
        paymentTerms: data.paymentTerms,
        deliverables: data.deliverables,
        deadlines: data.deadlines,
        specificConditions: data.specificConditions,
        notes: data.notes,
        ...totalsForDb(totals),
        createdById: actor.id,
        lines: { create: linesForDb(data.lines) },
      },
    });
    await audit(tx, actor, "quote.create", "QUOTE", q.id, `Brouillon de devis créé : ${q.title}`, {
      totalTtc: totals.totalTtc,
    });
    return q;
  });
}

export async function updateQuote(actor: Actor, id: string, input: unknown) {
  assertCan(actor, "quote.editDraft");
  const data = await enforceTerms(actor, quoteSchema.parse(input));
  const totals = computeTotals(data.lines);
  return db.$transaction(async (tx) => {
    const q = await tx.quote.findUnique({ where: { id }, include: { lines: true } });
    if (!q) throw notFound();
    if (!EDITABLE.includes(q.status as (typeof EDITABLE)[number])) {
      throw conflict("Devis approuvé : créez une nouvelle version pour le modifier.");
    }
    if (actor.role !== "CEO" && q.createdById !== actor.id) throw forbidden();
    await tx.quoteLine.deleteMany({ where: { quoteId: id } });
    const updated = await tx.quote.update({
      where: { id },
      data: {
        status: "DRAFT", // une modification annule la soumission en cours
        submittedAt: null,
        clientId: data.clientId,
        hubspotDealId: data.hubspotDealId,
        title: data.title,
        subtitle: data.subtitle,
        projectName: data.projectName,
        validityDays: data.validityDays,
        depositPercent: data.depositPercent.toFixed(2),
        paymentTerms: data.paymentTerms,
        deliverables: data.deliverables,
        deadlines: data.deadlines,
        specificConditions: data.specificConditions,
        notes: data.notes,
        ...totalsForDb(totals),
        lines: { create: linesForDb(data.lines) },
      },
    });
    await audit(tx, actor, "quote.update", "QUOTE", id, `Devis modifié (brouillon)`, {
      before: { totalTtc: num(q.totalTtc), lines: q.lines.length },
      after: { totalTtc: totals.totalTtc / 100, lines: data.lines.length },
    });
    return updated;
  });
}

export async function submitQuote(actor: Actor, id: string) {
  assertCan(actor, "quote.submit");
  return db.$transaction(async (tx) => {
    const q = await tx.quote.findUnique({ where: { id } });
    if (!q) throw notFound();
    if (q.status !== "DRAFT") throw conflict("Seul un brouillon peut être soumis.");
    const updated = await tx.quote.update({
      where: { id },
      data: { status: "PENDING_APPROVAL", submittedAt: new Date(), rejectionComment: null },
    });
    await audit(tx, actor, "quote.submit", "QUOTE", id, "Devis soumis à la validation du CEO");
    return updated;
  });
}

export async function rejectQuote(actor: Actor, id: string, comment: string) {
  assertCan(actor, "quote.approve");
  if (!comment?.trim()) throw invalid("Un motif de refus est requis.");
  return db.$transaction(async (tx) => {
    const q = await tx.quote.findUnique({ where: { id } });
    if (!q) throw notFound();
    if (q.status !== "PENDING_APPROVAL") throw conflict("Ce devis n'est pas en attente de validation.");
    const updated = await tx.quote.update({
      where: { id },
      data: { status: "DRAFT", rejectionComment: comment.trim(), submittedAt: null },
    });
    await audit(tx, actor, "quote.reject", "QUOTE", id, `Devis renvoyé en brouillon : ${comment.trim()}`);
    return updated;
  });
}

export async function approveQuote(actor: Actor, id: string, opts: { applySignature: boolean }) {
  assertCan(actor, "quote.approve");
  if (opts.applySignature) assertCan(actor, "signature.apply");
  return db.$transaction(async (tx) => {
    // Verrou de ligne : empêche deux approbations simultanées du même devis
    await tx.$queryRaw`SELECT id FROM "Quote" WHERE id = ${id} FOR UPDATE`;
    const q = await tx.quote.findUnique({ where: { id }, include: { client: true } });
    if (!q) throw notFound();
    if (q.status !== "PENDING_APPROVAL") throw conflict("Ce devis n'est pas en attente de validation.");
    assertNotSelfApproval(actor, q.createdById);

    const issueDate = todayUtc();
    let number = q.number;
    let year = q.year;
    if (number == null) {
      year = issueDate.getUTCFullYear();
      number = await allocateNumber(tx, "QUOTE", year);
    }
    const s = await getSettings(tx);
    const reference = formatReference(number, year!, s.numberPadding, s.quoteNumberFormat);

    const updated = await tx.quote.update({
      where: { id },
      data: {
        status: "APPROVED",
        number,
        year,
        reference,
        issueDate,
        validUntil: addDays(issueDate, q.validityDays),
        clientSnapshot: clientSnapshot(q.client),
        approvedAt: new Date(),
        approvedById: actor.id,
        signed: opts.applySignature,
      },
    });
    if (q.previousVersionId) {
      await tx.quote.update({ where: { id: q.previousVersionId }, data: { status: "SUPERSEDED" } });
    }
    await audit(tx, actor, "quote.approve", "QUOTE", id,
      `Devis ${reference}${q.version > 1 ? ` V${q.version}` : ""} approuvé${opts.applySignature ? " avec cachet et signature" : ""}`,
      { number, year, version: q.version, signed: opts.applySignature });
    return updated;
  });
}

export async function markQuoteSent(actor: Actor, id: string) {
  assertCan(actor, "quote.markSent");
  return db.$transaction(async (tx) => {
    const q = await tx.quote.findUnique({ where: { id } });
    if (!q) throw notFound();
    if (q.status !== "APPROVED") throw conflict("Seul un devis approuvé peut être marqué comme envoyé.");
    const updated = await tx.quote.update({ where: { id }, data: { status: "SENT", sentAt: new Date() } });
    await audit(tx, actor, "quote.sent", "QUOTE", id, `Devis ${q.reference} envoyé au client`);
    return updated;
  });
}

export async function markQuoteOutcome(actor: Actor, id: string, outcome: "ACCEPTED" | "REFUSED") {
  assertCan(actor, "quote.markOutcome");
  return db.$transaction(async (tx) => {
    const q = await tx.quote.findUnique({ where: { id } });
    if (!q) throw notFound();
    if (!["APPROVED", "SENT"].includes(q.status)) throw conflict("Le devis doit être approuvé ou envoyé.");
    const updated = await tx.quote.update({
      where: { id },
      data: outcome === "ACCEPTED"
        ? { status: "ACCEPTED", acceptedAt: new Date() }
        : { status: "REFUSED", refusedAt: new Date() },
    });
    await audit(tx, actor, `quote.${outcome.toLowerCase()}`, "QUOTE", id,
      `Devis ${q.reference} ${outcome === "ACCEPTED" ? "accepté" : "refusé"} par le client`);
    return updated;
  });
}

/** Nouvelle version d'un devis approuvé : même numéro, version + 1, nouvelle validation requise. */
export async function reviseQuote(actor: Actor, id: string) {
  assertCan(actor, "quote.revise");
  return db.$transaction(async (tx) => {
    const q = await tx.quote.findUnique({
      where: { id },
      include: { lines: true, nextVersion: true, invoices: { where: { deletedAt: null } } },
    });
    if (!q || q.deletedAt) throw notFound();
    if (!["APPROVED", "SENT", "REFUSED", "ACCEPTED"].includes(q.status)) {
      throw conflict("Seul un devis approuvé, envoyé, accepté ou refusé peut être révisé.");
    }
    if (q.nextVersion && !q.nextVersion.deletedAt) throw conflict("Une version plus récente existe déjà.");
    if (q.invoices.some((i) => i.status !== "CANCELLED")) {
      throw conflict("Ce devis a déjà été facturé : émettez un avoir avant de le réviser.");
    }
    // Les versions supprimées gardent leur numéro de version : on reprend après la plus haute
    const last = await tx.quote.aggregate({ _max: { version: true }, where: { OR: [{ id: q.rootId ?? q.id }, { rootId: q.rootId ?? q.id }] } });
    const copy = await tx.quote.create({
      data: {
        number: q.number,
        year: q.year,
        reference: q.reference,
        version: Math.max(q.version, last._max.version ?? 0) + 1,
        rootId: q.rootId ?? q.id,
        previousVersionId: q.id,
        status: "DRAFT",
        clientId: q.clientId,
        hubspotDealId: q.hubspotDealId,
        title: q.title,
        subtitle: q.subtitle,
        projectName: q.projectName,
        validityDays: q.validityDays,
        depositPercent: q.depositPercent,
        paymentTerms: q.paymentTerms,
        deliverables: q.deliverables,
        deadlines: q.deadlines,
        specificConditions: q.specificConditions,
        notes: q.notes,
        totalHt: q.totalHt,
        totalVat: q.totalVat,
        totalTtc: q.totalTtc,
        vatBreakdown: q.vatBreakdown ?? undefined,
        createdById: actor.id,
        lines: {
          create: q.lines.sort((a, b) => a.position - b.position).map(({ id: _id, quoteId: _q, ...l }) => l),
        },
      },
    });
    await audit(tx, actor, "quote.revise", "QUOTE", copy.id,
      `Nouvelle version V${copy.version} du devis ${q.reference} créée (validation CEO requise)`, { from: q.id });
    return copy;
  });
}

export async function cancelQuote(actor: Actor, id: string, reason: string) {
  assertCan(actor, "quote.cancel");
  return db.$transaction(async (tx) => {
    const q = await tx.quote.findUnique({ where: { id }, include: { invoices: { where: { deletedAt: null } } } });
    if (!q || q.deletedAt) throw notFound();
    if (["CANCELLED", "SUPERSEDED"].includes(q.status)) throw conflict("Devis déjà clôturé.");
    if (q.invoices.some((i) => i.status !== "CANCELLED")) throw conflict("Devis facturé : annulation impossible.");
    const updated = await tx.quote.update({ where: { id }, data: { status: "CANCELLED" } });
    await audit(tx, actor, "quote.cancel", "QUOTE", id, `Devis ${q.reference ?? "brouillon"} annulé : ${reason}`);
    return updated;
  });
}

/** Statut d'une version remplacée, reconstitué à partir de ses dates (restauration après suppression de la suivante). */
function statusBeforeSuperseded(q: { sentAt: Date | null; acceptedAt: Date | null; refusedAt: Date | null }) {
  if (q.refusedAt) return "REFUSED" as const;
  if (q.acceptedAt) return "ACCEPTED" as const;
  if (q.sentAt) return "SENT" as const;
  return "APPROVED" as const;
}

/**
 * Suppression (CEO uniquement) : suppression logique. Le devis reste en base — numéro consommé,
 * PDF archivé et journal conservés — mais disparaît des listes et ne peut plus être modifié.
 * Refusée si des factures actives y sont rattachées ou si une version plus récente existe.
 */
export async function deleteQuote(actor: Actor, id: string, reason: string) {
  assertCan(actor, "quote.delete");
  if (!reason?.trim()) throw invalid("Le motif de la suppression est obligatoire.");
  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Quote" WHERE id = ${id} FOR UPDATE`;
    const q = await tx.quote.findUnique({
      where: { id },
      include: { invoices: { where: { deletedAt: null } }, nextVersion: true, previousVersion: true },
    });
    if (!q || q.deletedAt) throw notFound();
    if (q.invoices.length > 0) {
      throw conflict(`Ce devis a des factures rattachées (${q.invoices.map((i) => i.reference ?? "brouillon").join(", ")}) : supprimez-les d'abord.`);
    }
    if (q.nextVersion && !q.nextVersion.deletedAt) {
      throw conflict(`Une version plus récente (V${q.nextVersion.version}) existe : supprimez-la d'abord.`);
    }
    const label = q.reference ? quoteReference(q.reference, q.version) : `brouillon « ${q.title} »`;
    // Libère le lien de version (unique) pour permettre une nouvelle révision de la version précédente
    await tx.quote.update({
      where: { id },
      data: { deletedAt: new Date(), deletedById: actor.id, deletionReason: reason.trim(), previousVersionId: null },
    });
    let restored: ReturnType<typeof statusBeforeSuperseded> | null = null;
    if (q.previousVersion && q.previousVersion.status === "SUPERSEDED" && !q.previousVersion.deletedAt) {
      restored = statusBeforeSuperseded(q.previousVersion);
      await tx.quote.update({ where: { id: q.previousVersion.id }, data: { status: restored } });
    }
    await audit(tx, actor, "quote.delete", "QUOTE", id, `Devis ${label} supprimé : ${reason.trim()}`, {
      status: q.status, number: q.number, version: q.version, totalTtc: num(q.totalTtc),
      previousVersionId: q.previousVersionId, previousVersionRestoredTo: restored,
    });
  });
}

export function isQuoteExpired(q: { status: string; validUntil: Date | null }, today = todayUtc()) {
  return ["APPROVED", "SENT"].includes(q.status) && q.validUntil != null && q.validUntil < today;
}

/**
 * Duplication : nouveau brouillon (V1, sans numéro) reprenant intitulé, prestations et conditions
 * d'un devis existant. Les conditions commerciales repassent par les règles de permission.
 */
export async function duplicateQuote(actor: Actor, id: string) {
  assertCan(actor, "quote.create");
  const src = await db.quote.findUnique({ where: { id }, include: { lines: { orderBy: { position: "asc" } } } });
  if (!src || src.deletedAt) throw notFound();
  return createQuote(actor, {
    clientId: src.clientId,
    title: src.title,
    subtitle: src.subtitle,
    projectName: src.projectName,
    validityDays: src.validityDays,
    depositPercent: num(src.depositPercent),
    paymentTerms: src.paymentTerms,
    deliverables: src.deliverables,
    deadlines: src.deadlines,
    specificConditions: src.specificConditions,
    notes: src.notes,
    lines: src.lines.map((l) => ({
      designation: l.designation,
      description: l.description,
      quantity: num(l.quantity),
      unit: l.unit,
      unitPrice: num(l.unitPrice),
      vatRate: num(l.vatRate),
      discountPercent: num(l.discountPercent),
    })),
  }).then(async (q) => {
    await audit(db, actor, "quote.duplicate", "QUOTE", q.id,
      `Brouillon créé par duplication du devis ${src.reference ? quoteReference(src.reference, src.version) : "(brouillon)"}`, { from: id });
    return q;
  });
}

const SIGNED_TYPES: Record<string, { ext: string; magic: number[] }> = {
  "application/pdf": { ext: "pdf", magic: [0x25, 0x50, 0x44, 0x46] }, // %PDF
  "image/jpeg": { ext: "jpg", magic: [0xff, 0xd8, 0xff] },
  "image/png": { ext: "png", magic: [0x89, 0x50, 0x4e, 0x47] },
};
export const SIGNED_MAX_BYTES = 10 * 1024 * 1024;

/**
 * Bon pour accord : archive le devis signé renvoyé par le client (PDF ou photo), en ajout seul.
 * Peut marquer le devis comme accepté dans la même opération.
 */
export async function attachSignedQuote(
  actor: Actor,
  quoteId: string,
  file: { name: string; type: string; bytes: Uint8Array },
  opts: { markAccepted: boolean },
) {
  assertCan(actor, "quote.markOutcome");
  const kind = SIGNED_TYPES[file.type];
  if (!kind) throw invalid("Format accepté : PDF, JPG ou PNG.");
  if (file.bytes.length === 0) throw invalid("Fichier vide.");
  if (file.bytes.length > SIGNED_MAX_BYTES) throw invalid("Fichier trop volumineux (10 Mo maximum).");
  if (!kind.magic.every((b, i) => file.bytes[i] === b)) throw invalid("Le contenu du fichier ne correspond pas à son format.");

  const q = await db.quote.findUnique({ where: { id: quoteId } });
  if (!q || q.deletedAt) throw notFound();
  if (!["APPROVED", "SENT", "ACCEPTED"].includes(q.status)) {
    throw conflict("Le bon pour accord se joint à un devis approuvé, envoyé ou accepté.");
  }
  if (q.status !== "ACCEPTED" && opts.markAccepted) await markQuoteOutcome(actor, quoteId, "ACCEPTED");

  const crypto = await import("node:crypto");
  const ref = (q.reference ?? "devis").replace(/[^\w-]+/g, "-");
  const doc = await db.documentFile.create({
    data: {
      entityType: "QUOTE_SIGNED",
      entityId: quoteId,
      reference: q.reference ?? "",
      filename: `BON-POUR-ACCORD_${ref}${q.version > 1 ? `-V${q.version}` : ""}.${kind.ext}`,
      mime: file.type,
      data: new Uint8Array(file.bytes),
      sha256: crypto.createHash("sha256").update(file.bytes).digest("hex"),
      createdById: actor.id,
    },
  });
  await audit(db, actor, "quote.signedAttached", "QUOTE", quoteId,
    `Bon pour accord signé joint au devis ${q.reference ?? ""} (${file.name}, ${Math.round(file.bytes.length / 1024)} Ko)`, { fileId: doc.id, sha256: doc.sha256 });
  return doc;
}
