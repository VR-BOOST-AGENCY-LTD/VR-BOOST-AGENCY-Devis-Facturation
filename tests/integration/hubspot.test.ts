// HubSpot : API simulée (aucun appel réseau). Vérifie la règle « aucun écrasement des données CRM ».
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db";
import type { Actor } from "@/lib/permissions";
import * as hubspot from "@/server/hubspot";

type Call = { method: string; url: string; body: unknown };
let calls: Call[];
let actor: Actor;

function mockHubspot(routes: Record<string, (body: unknown) => unknown>) {
  calls = [];
  vi.stubGlobal("fetch", async (url: string, init: RequestInit = {}) => {
    const method = init.method ?? "GET";
    const path = url.replace("https://api.hubapi.com", "").split("?")[0];
    const body = typeof init.body === "string" ? JSON.parse(init.body) : init.body;
    calls.push({ method, url: path, body });
    const key = Object.keys(routes).find((k) => new RegExp(`^${k}$`).test(`${method} ${path}`));
    if (!key) return new Response("not found", { status: 404 });
    return new Response(JSON.stringify(routes[key](body)), { status: 200, headers: { "Content-Type": "application/json" } });
  });
}

beforeEach(async () => {
  process.env.HUBSPOT_ACCESS_TOKEN = "pat-test-token";
  await db.$executeRawUnsafe(`TRUNCATE "AuditLog", "DocumentFile", "Payment", "InvoiceLine", "Invoice", "QuoteLine", "Quote", "Client", "User" RESTART IDENTITY CASCADE`);
  const u = await db.user.create({ data: { email: "ceo@hs", name: "CEO", role: "CEO", passwordHash: "x" } });
  actor = { id: u.id, role: "CEO" };
});
afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.HUBSPOT_ACCESS_TOKEN;
  delete process.env.HUBSPOT_DEAL_STATUS_PROPERTY;
});

describe("HubSpot", () => {
  it("recherche entreprises et contacts côté serveur", async () => {
    mockHubspot({
      "POST /crm/v3/objects/companies/search": () => ({ results: [{ id: "11", properties: { name: "Yakeey", city: "Casablanca" } }] }),
      "POST /crm/v3/objects/contacts/search": () => ({ results: [{ id: "22", properties: { firstname: "Sara", lastname: "B", email: "s@y.ma" } }] }),
    });
    const [c] = await hubspot.searchCompanies("Yak");
    const [p] = await hubspot.searchContacts("Sara");
    expect(c).toMatchObject({ id: "11", name: "Yakeey" });
    expect(p).toMatchObject({ id: "22", name: "Sara B" });
  });

  it("import : préremplit sans jamais réécrire la fiche existante", async () => {
    mockHubspot({ "GET /crm/v3/objects/companies/11": () => ({ id: "11", properties: { name: "Yakeey", city: "Casablanca" } }) });
    const a = await hubspot.importCompany(actor, "11");
    await db.client.update({ where: { id: a.id }, data: { city: "Rabat" } }); // modification locale
    const b = await hubspot.importCompany(actor, "11");
    expect(b.id).toBe(a.id);
    expect(b.city).toBe("Rabat");
    expect(calls.every((c) => c.method !== "PATCH" && c.method !== "PUT")).toBe(true);
  });

  it("création d'entreprise refusée si un homonyme existe ; jamais de PATCH sur les entreprises", async () => {
    const client = await db.client.create({ data: { name: "Yakeey" } });
    mockHubspot({ "POST /crm/v3/objects/companies/search": () => ({ results: [{ id: "11", properties: { name: "yakeey" } }] }) });
    await expect(hubspot.pushClientToHubspot(actor, client.id)).rejects.toThrow(/existe déjà/);
    expect(calls.some((c) => c.method === "POST" && c.url === "/crm/v3/objects/companies")).toBe(false);
  });

  it("trace un document par une note associée à l'entreprise et à la transaction", async () => {
    process.env.HUBSPOT_DEAL_STATUS_PROPERTY = "vrb_statut_document";
    const client = await db.client.create({ data: { name: "Yakeey", hubspotCompanyId: "11" } });
    const inv = await db.invoice.create({
      data: { clientId: client.id, title: "Facture", createdById: actor.id, hubspotDealId: "99", status: "ISSUED", totalTtc: "1200.00" },
    });
    mockHubspot({
      "POST /crm/v3/objects/notes": () => ({ id: "n1" }),
      "PATCH /crm/v3/objects/deals/99": () => ({ id: "99" }),
    });
    const r = await hubspot.syncDocumentToHubspot("INVOICE", inv.id, actor);
    expect(r).toEqual({ noteId: "n1" });
    const note = calls.find((c) => c.url === "/crm/v3/objects/notes")!.body as { associations: { to: { id: string } }[] };
    expect(note.associations.map((a) => a.to.id)).toEqual(["11", "99"]);
    const patch = calls.find((c) => c.method === "PATCH")!;
    expect(Object.keys((patch.body as { properties: object }).properties)).toEqual(["vrb_statut_document"]); // propriété dédiée uniquement
  });

  it("une panne HubSpot ne bloque pas le workflow et est journalisée", async () => {
    const client = await db.client.create({ data: { name: "Yakeey", hubspotCompanyId: "11" } });
    const inv = await db.invoice.create({ data: { clientId: client.id, title: "F", createdById: actor.id } });
    mockHubspot({});
    const r = await hubspot.syncDocumentToHubspot("INVOICE", inv.id, actor);
    expect(r).toHaveProperty("error");
    expect(await db.auditLog.count({ where: { action: "hubspot.error" } })).toBe(1);
  });
});
