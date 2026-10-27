// Intégration HubSpot — côté serveur uniquement (jeton Private App jamais exposé au navigateur).
// Principe : lecture libre ; écritures limitées à la CRÉATION (entreprise inexistante, notes, fichiers)
// et à une propriété personnalisée dédiée. Aucune donnée CRM existante n'est écrasée.
import "server-only";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { AppError, conflict, notFound } from "@/lib/errors";
import { formatCents } from "@/lib/format";
import { assertCan, type Actor } from "@/lib/permissions";
import { cents } from "./common";

const BASE = "https://api.hubapi.com";
// Types d'association HubSpot (définis par HubSpot)
const NOTE_TO_COMPANY = 190;
const NOTE_TO_DEAL = 214;

export const hubspotEnabled = () => Boolean(process.env.HUBSPOT_ACCESS_TOKEN);

let exchanged: { key: string; token: string; expiresAt: number } | null = null;

/**
 * Jeton d'accès : un jeton d'application privée / clé de service (« pat-… ») s'utilise tel quel ;
 * une clé d'accès personnelle est échangée contre un jeton OAuth temporaire, mis en cache.
 */
async function accessToken(): Promise<string> {
  const key = process.env.HUBSPOT_ACCESS_TOKEN!;
  if (key.startsWith("pat-")) return key;
  if (exchanged && exchanged.key === key && exchanged.expiresAt > Date.now() + 60_000) return exchanged.token;
  const res = await fetch(`${BASE}/localdevauth/v1/auth/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ encodedOAuthRefreshToken: key }),
    signal: AbortSignal.timeout(15_000),
    cache: "no-store",
  });
  if (!res.ok) throw new AppError(`Clé HubSpot refusée (${res.status}) : vérifiez HUBSPOT_ACCESS_TOKEN.`, "CONFLICT");
  const d = (await res.json()) as { oauthAccessToken: string; expiresAtMillis: number };
  exchanged = { key, token: d.oauthAccessToken, expiresAt: d.expiresAtMillis };
  return d.oauthAccessToken;
}

async function hs<T>(path: string, init: RequestInit = {}, attempt = 0): Promise<T> {
  if (!hubspotEnabled()) throw new AppError("HubSpot non configuré (HUBSPOT_ACCESS_TOKEN).", "CONFLICT");
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${await accessToken()}`,
      ...(init.body && !(init.body instanceof FormData) ? { "Content-Type": "application/json" } : {}),
      ...init.headers,
    },
    signal: AbortSignal.timeout(15_000),
    cache: "no-store",
  });
  if (res.status === 429 && attempt < 2) {
    await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
    return hs(path, init, attempt + 1);
  }
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new AppError(`HubSpot ${res.status} : ${body.slice(0, 200)}`, "CONFLICT");
  }
  return (res.status === 204 ? null : await res.json()) as T;
}

type HsObject = { id: string; properties: Record<string, string | null> };

export type HsCompany = { id: string; name: string; domain: string | null; city: string | null; phone: string | null; address: string | null };
export type HsContact = { id: string; name: string; email: string | null; phone: string | null; company: string | null };
export type HsDeal = { id: string; name: string; amount: string | null; stage: string | null };

export async function searchCompanies(query: string): Promise<HsCompany[]> {
  const r = await hs<{ results: HsObject[] }>("/crm/v3/objects/companies/search", {
    method: "POST",
    body: JSON.stringify({
      query: query.slice(0, 100),
      limit: 10,
      properties: ["name", "domain", "city", "phone", "address"],
    }),
  });
  return r.results.map((o) => ({
    id: o.id,
    name: o.properties.name ?? "(sans nom)",
    domain: o.properties.domain,
    city: o.properties.city,
    phone: o.properties.phone,
    address: o.properties.address,
  }));
}

export async function searchContacts(query: string): Promise<HsContact[]> {
  const r = await hs<{ results: HsObject[] }>("/crm/v3/objects/contacts/search", {
    method: "POST",
    body: JSON.stringify({
      query: query.slice(0, 100),
      limit: 10,
      properties: ["firstname", "lastname", "email", "phone", "company"],
    }),
  });
  return r.results.map((o) => ({
    id: o.id,
    name: [o.properties.firstname, o.properties.lastname].filter(Boolean).join(" ") || "(sans nom)",
    email: o.properties.email,
    phone: o.properties.phone,
    company: o.properties.company,
  }));
}

export async function companyDeals(companyId: string): Promise<HsDeal[]> {
  const assoc = await hs<{ results: { toObjectId: number }[] }>(
    `/crm/v4/objects/companies/${encodeURIComponent(companyId)}/associations/deals?limit=50`,
  );
  if (assoc.results.length === 0) return [];
  const r = await hs<{ results: HsObject[] }>("/crm/v3/objects/deals/batch/read", {
    method: "POST",
    body: JSON.stringify({
      inputs: assoc.results.map((a) => ({ id: String(a.toObjectId) })),
      properties: ["dealname", "amount", "dealstage"],
    }),
  });
  return r.results.map((o) => ({
    id: o.id,
    name: o.properties.dealname ?? "(sans nom)",
    amount: o.properties.amount,
    stage: o.properties.dealstage,
  }));
}

/** Importe une entreprise HubSpot en fiche client locale (préremplissage, sans écraser l'existant). */
export async function importCompany(actor: Actor, companyId: string, contactId?: string | null) {
  assertCan(actor, "client.edit");
  const existing = await db.client.findUnique({ where: { hubspotCompanyId: companyId } });
  if (existing) return existing;
  const c = await hs<HsObject>(
    `/crm/v3/objects/companies/${encodeURIComponent(companyId)}?properties=name,city,phone,address,country,domain`,
  );
  let contact: HsObject | null = null;
  if (contactId) {
    contact = await hs<HsObject>(
      `/crm/v3/objects/contacts/${encodeURIComponent(contactId)}?properties=firstname,lastname,email,phone`,
    ).catch(() => null);
  }
  return db.$transaction(async (tx) => {
    const client = await tx.client.create({
      data: {
        name: c.properties.name ?? "Entreprise HubSpot",
        city: c.properties.city,
        address: c.properties.address,
        country: c.properties.country || "Maroc",
        phone: contact?.properties.phone ?? c.properties.phone,
        email: contact?.properties.email ?? null,
        contactName: contact ? [contact.properties.firstname, contact.properties.lastname].filter(Boolean).join(" ") : null,
        hubspotCompanyId: companyId,
        hubspotContactId: contactId ?? null,
        createdById: actor.id,
      },
    });
    await audit(tx, actor, "hubspot.import", "CLIENT", client.id, `Client importé depuis HubSpot (entreprise ${companyId})`);
    return client;
  });
}

/** Crée l'entreprise dans HubSpot pour un client local qui n'y est pas encore lié (jamais de mise à jour). */
export async function pushClientToHubspot(actor: Actor, clientId: string) {
  assertCan(actor, "hubspot.write");
  const client = await db.client.findUnique({ where: { id: clientId } });
  if (!client) throw notFound("Client introuvable");
  if (client.hubspotCompanyId) throw conflict("Ce client est déjà lié à une entreprise HubSpot.");
  const dupes = await searchCompanies(client.name);
  if (dupes.some((d) => d.name.trim().toLowerCase() === client.name.trim().toLowerCase())) {
    throw conflict("Une entreprise du même nom existe déjà dans HubSpot : liez-la plutôt que d'en créer une nouvelle.");
  }
  const created = await hs<HsObject>("/crm/v3/objects/companies", {
    method: "POST",
    body: JSON.stringify({
      properties: { name: client.name, city: client.city ?? "", phone: client.phone ?? "", address: client.address ?? "" },
    }),
  });
  await db.client.update({ where: { id: clientId }, data: { hubspotCompanyId: created.id } });
  await audit(db, actor, "hubspot.createCompany", "CLIENT", clientId, `Entreprise créée dans HubSpot (${created.id})`);
  return created.id;
}

/** Lie un client local à une entreprise HubSpot existante. */
export async function linkClient(actor: Actor, clientId: string, companyId: string) {
  assertCan(actor, "client.edit");
  const other = await db.client.findUnique({ where: { hubspotCompanyId: companyId } });
  if (other && other.id !== clientId) throw conflict(`Entreprise déjà liée au client « ${other.name} ».`);
  await db.client.update({ where: { id: clientId }, data: { hubspotCompanyId: companyId } });
  await audit(db, actor, "hubspot.link", "CLIENT", clientId, `Client lié à l'entreprise HubSpot ${companyId}`);
}

async function uploadPdf(filename: string, data: Uint8Array): Promise<string> {
  const form = new FormData();
  form.append("file", new Blob([data as BlobPart], { type: "application/pdf" }), filename);
  form.append("folderPath", "/vrboost-devis-factures");
  form.append("options", JSON.stringify({ access: "PRIVATE", overwrite: false, duplicateValidationStrategy: "NONE" }));
  const r = await hs<{ id: string }>("/files/v3/files", { method: "POST", body: form });
  return r.id;
}

const STATUS_LABEL: Record<string, string> = {
  APPROVED: "Devis approuvé",
  SENT: "Devis envoyé",
  ACCEPTED: "Devis accepté",
  REFUSED: "Devis refusé",
  ISSUED: "Facture émise",
  PARTIALLY_PAID: "Facture partiellement payée",
  PAID: "Facture payée",
  CANCELLED: "Facture annulée par avoir",
};

/**
 * Trace un document dans HubSpot : note sur l'entreprise (et la transaction), avec le PDF officiel
 * archivé en pièce jointe privée. Optionnellement, met à jour une propriété personnalisée dédiée.
 * Best-effort : un échec est journalisé mais ne bloque jamais le workflow.
 */
export async function syncDocumentToHubspot(entityType: "QUOTE" | "INVOICE", id: string, actor: Actor | null) {
  if (!hubspotEnabled()) return { skipped: "HubSpot non configuré" };
  try {
    const doc =
      entityType === "QUOTE"
        ? await db.quote.findUnique({ where: { id }, include: { client: true } })
        : await db.invoice.findUnique({ where: { id }, include: { client: true } });
    if (!doc) throw notFound();
    const companyId = doc.client.hubspotCompanyId;
    if (!companyId && !doc.hubspotDealId) return { skipped: "Client non lié à HubSpot" };

    const file = await db.documentFile.findFirst({ where: { entityType, entityId: id }, orderBy: { createdAt: "desc" } });
    const attachmentId = file ? await uploadPdf(file.filename, file.data) : null;
    const label = STATUS_LABEL[doc.status] ?? doc.status;
    const body = `<p><strong>${label}</strong> — ${doc.reference ?? "brouillon"}</p>
<p>${doc.title}<br/>Total TTC : ${formatCents(cents(doc.totalTtc))}</p>
<p><em>Synchronisé depuis VR BOOST — Devis & Factures</em></p>`;
    const associations = [
      ...(companyId ? [{ to: { id: companyId }, types: [{ associationCategory: "HUBSPOT_DEFINED", associationTypeId: NOTE_TO_COMPANY }] }] : []),
      ...(doc.hubspotDealId ? [{ to: { id: doc.hubspotDealId }, types: [{ associationCategory: "HUBSPOT_DEFINED", associationTypeId: NOTE_TO_DEAL }] }] : []),
    ];
    const note = await hs<{ id: string }>("/crm/v3/objects/notes", {
      method: "POST",
      body: JSON.stringify({
        properties: {
          hs_timestamp: new Date().toISOString(),
          hs_note_body: body,
          ...(attachmentId ? { hs_attachment_ids: attachmentId } : {}),
        },
        associations,
      }),
    });
    const prop = process.env.HUBSPOT_DEAL_STATUS_PROPERTY;
    if (prop && doc.hubspotDealId) {
      await hs(`/crm/v3/objects/deals/${encodeURIComponent(doc.hubspotDealId)}`, {
        method: "PATCH",
        body: JSON.stringify({ properties: { [prop]: `${label} ${doc.reference ?? ""}`.trim() } }),
      });
    }
    await audit(db, actor, "hubspot.sync", entityType, id, `Document tracé dans HubSpot (note ${note.id})`, {
      companyId,
      dealId: doc.hubspotDealId,
      attachmentId,
    });
    return { noteId: note.id };
  } catch (e) {
    await audit(db, actor, "hubspot.error", entityType, id, `Échec de synchronisation HubSpot : ${(e as Error).message.slice(0, 300)}`);
    return { error: (e as Error).message };
  }
}
