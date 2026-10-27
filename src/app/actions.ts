"use server";
// Actions serveur : point d'entrée unique des mutations. Chaque action ré-authentifie l'utilisateur,
// les services vérifient les permissions ; les erreurs métier sont renvoyées proprement à l'UI.
import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { ZodError } from "zod";
import { getCurrentUser, login, logout, type CurrentUser } from "@/lib/auth";
import { AppError } from "@/lib/errors";
import { formatZodError } from "@/lib/validation";
import { archiveOfficialPdf } from "@/pdf/render";
import * as quotes from "@/server/quotes";
import * as invoices from "@/server/invoices";
import * as payments from "@/server/payments";
import * as clients from "@/server/clients";
import * as admin from "@/server/admin";
import * as hubspot from "@/server/hubspot";
import * as mailer from "@/server/mailer";

export type ActionResult<T = unknown> = { ok: true; data?: T; message?: string } | { ok: false; error: string };

async function run<T>(fn: (u: CurrentUser) => Promise<T>, message?: string): Promise<ActionResult<T>> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Session expirée : reconnectez-vous." };
  try {
    const data = await fn(user);
    revalidatePath("/", "layout");
    return { ok: true, data, message };
  } catch (e) {
    if (e instanceof AppError) return { ok: false, error: e.message };
    if (e instanceof ZodError) return { ok: false, error: formatZodError(e) };
    const msg = (e as Error)?.message ?? "";
    if (msg.includes("Unique constraint") || msg.includes("P2002")) {
      return { ok: false, error: "Conflit de numérotation détecté : opération annulée, réessayez." };
    }
    if (/non modifiable|interdit|ajout seul/.test(msg)) return { ok: false, error: msg.split("\n").pop()! };
    console.error("[action]", e);
    return { ok: false, error: "Erreur inattendue. L'opération n'a pas été enregistrée." };
  }
}

/** Effets après validation : archivage du PDF officiel puis traçabilité HubSpot (non bloquante). */
function afterOfficial(entityType: "QUOTE" | "INVOICE", id: string, user: CurrentUser) {
  after(async () => {
    try {
      await archiveOfficialPdf(entityType, id, user.id);
    } catch (e) {
      console.error("[archive]", e);
    }
    await hubspot.syncDocumentToHubspot(entityType, id, user);
  });
}

// ---------------------------------------------------------------- session

export async function loginAction(_prev: unknown, form: FormData): Promise<ActionResult> {
  const r = await login(String(form.get("email") ?? ""), String(form.get("password") ?? ""));
  if (!r.ok) return r;
  redirect("/");
}

export async function logoutAction() {
  await logout();
  redirect("/login");
}

// ---------------------------------------------------------------- devis

export async function saveQuoteAction(id: string | null, data: unknown) {
  return run(async (u) => (id ? quotes.updateQuote(u, id, data) : quotes.createQuote(u, data)).then((q) => q.id), "Devis enregistré");
}

export async function quoteOpAction(id: string, op: string, extra: { comment?: string; applySignature?: boolean } = {}) {
  return run(async (u) => {
    switch (op) {
      case "submit": return (await quotes.submitQuote(u, id)).id;
      case "approve": {
        const q = await quotes.approveQuote(u, id, { applySignature: Boolean(extra.applySignature) });
        afterOfficial("QUOTE", q.id, u);
        return q.id;
      }
      case "reject": return (await quotes.rejectQuote(u, id, extra.comment ?? "")).id;
      case "sent": {
        const q = await quotes.markQuoteSent(u, id);
        after(() => hubspot.syncDocumentToHubspot("QUOTE", id, u));
        return q.id;
      }
      case "accepted":
      case "refused": {
        const q = await quotes.markQuoteOutcome(u, id, op === "accepted" ? "ACCEPTED" : "REFUSED");
        after(() => hubspot.syncDocumentToHubspot("QUOTE", id, u));
        return q.id;
      }
      case "revise": return (await quotes.reviseQuote(u, id)).id;
      case "cancel": return (await quotes.cancelQuote(u, id, extra.comment ?? "Annulé")).id;
      case "delete": await quotes.deleteDraftQuote(u, id); return null;
      default: throw new AppError("Opération inconnue");
    }
  });
}

// ---------------------------------------------------------------- factures

export async function saveInvoiceAction(id: string | null, data: unknown) {
  return run(async (u) => (id ? invoices.updateInvoice(u, id, data) : invoices.createInvoice(u, data)).then((i) => i.id), "Facture enregistrée");
}

export async function invoiceFromQuoteAction(
  quoteId: string,
  kind: "DEPOSIT" | "BALANCE" | "STANDARD",
  opts: { percent?: number; deliveryDate?: string } = {},
) {
  return run(async (u) =>
    (await invoices.createInvoiceFromQuote(u, quoteId, kind, {
      percent: opts.percent,
      deliveryDate: opts.deliveryDate ? new Date(`${opts.deliveryDate}T00:00:00Z`) : null,
    })).id,
  );
}

export async function invoiceOpAction(id: string, op: string, extra: { comment?: string; applySignature?: boolean } = {}) {
  return run(async (u) => {
    switch (op) {
      case "submit": return (await invoices.submitInvoice(u, id)).id;
      case "approve": {
        const inv = await invoices.approveAndIssueInvoice(u, id, { applySignature: Boolean(extra.applySignature) });
        afterOfficial("INVOICE", inv.id, u);
        return inv.id;
      }
      case "reject": return (await invoices.rejectInvoice(u, id, extra.comment ?? "")).id;
      case "delete": await invoices.deleteDraftInvoice(u, id); return null;
      case "creditFull": return (await invoices.createCreditNote(u, id, { reason: extra.comment ?? "", full: true })).id;
      case "rectify": return (await invoices.rectifyInvoice(u, id, extra.comment ?? "")).rectification.id;
      case "hubspot": return hubspot.syncDocumentToHubspot("INVOICE", id, u);
      default: throw new AppError("Opération inconnue");
    }
  });
}

export async function partialCreditAction(invoiceId: string, reason: string, lines: unknown[]) {
  return run(async (u) => (await invoices.createCreditNote(u, invoiceId, { reason, full: false, lines })).id);
}

// ---------------------------------------------------------------- paiements

export async function recordPaymentAction(data: unknown) {
  return run((u) => payments.recordPayment(u, data).then((p) => p.id), "Paiement enregistré");
}

export async function cancelPaymentAction(paymentId: string, reason: string) {
  return run((u) => payments.cancelPayment(u, paymentId, reason), "Paiement annulé");
}

// ---------------------------------------------------------------- clients & HubSpot

export async function saveClientAction(id: string | null, data: unknown) {
  return run(async (u) => (id ? clients.updateClient(u, id, data) : clients.createClient(u, data)).then((c) => c.id), "Client enregistré");
}

export async function hubspotSearchAction(query: string) {
  return run(async () => {
    if (!hubspot.hubspotEnabled()) throw new AppError("HubSpot non configuré : ajoutez HUBSPOT_ACCESS_TOKEN.");
    if (query.trim().length < 2) return { companies: [], contacts: [] };
    const [companies, contacts] = await Promise.all([hubspot.searchCompanies(query), hubspot.searchContacts(query)]);
    return { companies, contacts };
  });
}

export async function hubspotDealsAction(companyId: string) {
  return run(() => hubspot.companyDeals(companyId));
}

export async function hubspotImportAction(companyId: string, contactId?: string | null) {
  return run((u) => hubspot.importCompany(u, companyId, contactId).then((c) => c.id), "Client importé depuis HubSpot");
}

export async function hubspotPushClientAction(clientId: string) {
  return run((u) => hubspot.pushClientToHubspot(u, clientId), "Entreprise créée dans HubSpot");
}

export async function hubspotLinkClientAction(clientId: string, companyId: string) {
  return run((u) => hubspot.linkClient(u, clientId, companyId), "Client lié à HubSpot");
}

export async function hubspotSyncDocAction(entityType: "QUOTE" | "INVOICE", id: string) {
  return run(async (u) => {
    const r = await hubspot.syncDocumentToHubspot(entityType, id, u);
    if ("error" in r && r.error) throw new AppError(r.error);
    if ("skipped" in r && r.skipped) throw new AppError(r.skipped);
    return r;
  }, "Document tracé dans HubSpot");
}

// ---------------------------------------------------------------- paramètres (CEO)

export async function saveSettingsAction(data: unknown) {
  return run((u) => admin.updateSettings(u, data).then(() => null), "Paramètres enregistrés");
}

export async function setSequenceAction(series: "QUOTE" | "INVOICE", year: number, lastNumber: number) {
  return run((u) => admin.setSequence(u, series, year, lastNumber).then(() => null), "Numérotation confirmée");
}

export async function accountantValidationAction(name: string | null) {
  return run((u) => admin.setAccountantValidation(u, name), "Validation comptable enregistrée");
}

export async function saveCatalogItemAction(id: string | null, data: unknown) {
  return run((u) => admin.saveCatalogItem(u, id, data).then((i) => i.id), "Prestation enregistrée");
}

export async function toggleCatalogItemAction(id: string) {
  return run((u) => admin.toggleCatalogItem(u, id));
}

// ---------------------------------------------------------------- e-mail

export async function draftEmailAction(entityType: "QUOTE" | "INVOICE", id: string) {
  return run(() => mailer.draftDocumentEmail(entityType, id));
}

export async function sendEmailAction(entityType: "QUOTE" | "INVOICE", id: string, data: mailer.DraftEmail) {
  return run(async (u) => {
    const r = await mailer.sendDocumentEmail(u, entityType, id, data);
    if (entityType === "QUOTE") after(() => hubspot.syncDocumentToHubspot("QUOTE", id, u));
    return r;
  }, "E-mail envoyé");
}
