"use client";
// Éditeur commun devis / facture : prestations libres, prix personnalisés, totaux instantanés.
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import type { ActionResult } from "@/app/actions";
import { computeTotals, lineTotalCents } from "@/lib/calc";
import { formatCents, formatPercent } from "@/lib/format";

export type EditorLine = {
  designation: string;
  description: string;
  quantity: string;
  unit: string;
  unitPrice: string;
  vatRate: string;
  discountPercent: string;
};

export type EditorData = {
  clientId: string;
  hubspotDealId: string;
  title: string;
  subtitle: string;
  projectName: string;
  // devis
  validityDays: string;
  depositPercent: string;
  paymentTerms: string;
  deliverables: string;
  deadlines: string;
  specificConditions: string;
  notes: string;
  // facture
  deliveryDate: string;
  reason: string;
  lines: EditorLine[];
};

type ClientOpt = { id: string; name: string; ice: string | null; city: string | null; hubspotCompanyId: string | null };
type CatalogOpt = { id: string; designation: string; description: string | null; unit: string; unitPrice: number | null; vatRate: number };

const UNITS = ["forfait", "jour", "heure", "unité", "vidéo", "photo", "m²", "mois"];
const VAT_RATES = ["20", "14", "10", "7", "0"];

export function emptyLine(vat = "20"): EditorLine {
  return { designation: "", description: "", quantity: "1", unit: "forfait", unitPrice: "", vatRate: vat, discountPercent: "0" };
}

const n = (v: string) => {
  const x = Number(String(v).replace(",", ".").replace(/\s/g, ""));
  return Number.isFinite(x) ? x : 0;
};

export function DocEditor({
  kind,
  id,
  initial,
  clients,
  catalog,
  canEditTerms,
  linesLocked = false,
  isCreditNote = false,
  save,
  dealsAction,
}: {
  kind: "quote" | "invoice";
  id: string | null;
  initial: EditorData;
  clients: ClientOpt[];
  catalog: CatalogOpt[];
  canEditTerms: boolean;
  linesLocked?: boolean;
  isCreditNote?: boolean;
  save: (id: string | null, data: unknown) => Promise<ActionResult<unknown>>;
  dealsAction: (companyId: string) => Promise<ActionResult<unknown>>;
}) {
  const router = useRouter();
  const [d, setD] = useState<EditorData>(initial);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [deals, setDeals] = useState<{ id: string; name: string }[]>([]);
  const client = clients.find((c) => c.id === d.clientId);

  useEffect(() => {
    if (!client?.hubspotCompanyId) return setDeals([]);
    dealsAction(client.hubspotCompanyId).then((r) => setDeals(r.ok ? (r.data as { id: string; name: string }[]) : []));
  }, [client?.hubspotCompanyId, dealsAction]);

  const set = <K extends keyof EditorData>(k: K, v: EditorData[K]) => setD((p) => ({ ...p, [k]: v }));
  const setLine = (i: number, patch: Partial<EditorLine>) =>
    setD((p) => ({ ...p, lines: p.lines.map((l, j) => (j === i ? { ...l, ...patch } : l)) }));
  const move = (i: number, dir: -1 | 1) =>
    setD((p) => {
      const lines = [...p.lines];
      const j = i + dir;
      if (j < 0 || j >= lines.length) return p;
      [lines[i], lines[j]] = [lines[j], lines[i]];
      return { ...p, lines };
    });

  const parsed = useMemo(
    () =>
      d.lines.map((l) => ({
        designation: l.designation,
        description: l.description || null,
        quantity: n(l.quantity),
        unit: l.unit,
        unitPrice: n(l.unitPrice),
        vatRate: n(l.vatRate),
        discountPercent: n(l.discountPercent),
      })),
    [d.lines],
  );
  const totals = useMemo(() => {
    try {
      return computeTotals(parsed.filter((l) => l.quantity > 0));
    } catch {
      return null;
    }
  }, [parsed]);

  const submit = () =>
    start(async () => {
      setError(null);
      const payload =
        kind === "quote"
          ? {
              clientId: d.clientId, hubspotDealId: d.hubspotDealId || null, title: d.title, subtitle: d.subtitle,
              projectName: d.projectName, validityDays: d.validityDays, depositPercent: d.depositPercent,
              paymentTerms: d.paymentTerms, deliverables: d.deliverables, deadlines: d.deadlines,
              specificConditions: d.specificConditions, notes: d.notes, lines: parsed,
            }
          : {
              clientId: d.clientId, hubspotDealId: d.hubspotDealId || null, title: d.title, subtitle: d.subtitle,
              projectName: d.projectName, deliveryDate: d.deliveryDate || null, paymentTerms: d.paymentTerms,
              notes: d.notes, reason: d.reason, lines: parsed,
            };
      const r = await save(id, payload);
      if (!r.ok) return setError(r.error);
      router.push(`/${kind === "quote" ? "devis" : "factures"}/${r.data}`);
      router.refresh();
    });

  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_320px]">
      <div className="space-y-6">
        {/* Client & en-tête */}
        <section className="card p-5">
          <h2 className="mb-4 text-sm font-semibold">Client et objet</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="label">Client *</label>
              <div className="flex gap-2">
                <select className="input" value={d.clientId} onChange={(e) => set("clientId", e.target.value)} disabled={isCreditNote}>
                  <option value="">— Sélectionner un client —</option>
                  {clients.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}{c.city ? ` — ${c.city}` : ""}{c.hubspotCompanyId ? " · HubSpot" : ""}
                    </option>
                  ))}
                </select>
                {!isCreditNote ? <Link href="/clients/nouveau" className="btn-ghost whitespace-nowrap">+ Client</Link> : null}
              </div>
              {client?.ice ? <p className="mt-1 text-xs text-muted">ICE {client.ice}</p> : null}
            </div>
            {deals.length > 0 ? (
              <div className="sm:col-span-2">
                <label className="label">Transaction HubSpot associée</label>
                <select className="input" value={d.hubspotDealId} onChange={(e) => set("hubspotDealId", e.target.value)}>
                  <option value="">— Aucune —</option>
                  {deals.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                </select>
              </div>
            ) : null}
            <div className="sm:col-span-2">
              <label className="label">Intitulé *</label>
              <input className="input" value={d.title} onChange={(e) => set("title", e.target.value)} placeholder="Production audiovisuelle - Tarif partenaire" />
            </div>
            <div className="sm:col-span-2">
              <label className="label">Sous-titre / présentation</label>
              <input className="input" value={d.subtitle} onChange={(e) => set("subtitle", e.target.value)} />
            </div>
            <div>
              <label className="label">Projet</label>
              <input className="input" value={d.projectName} onChange={(e) => set("projectName", e.target.value)} />
            </div>
            {kind === "invoice" && !isCreditNote ? (
              <div>
                <label className="label">Date de livraison</label>
                <input type="date" className="input" value={d.deliveryDate} onChange={(e) => set("deliveryDate", e.target.value)} />
              </div>
            ) : null}
            {isCreditNote || d.reason ? (
              <div className="sm:col-span-2">
                <label className="label">Motif</label>
                <input className="input" value={d.reason} onChange={(e) => set("reason", e.target.value)} />
              </div>
            ) : null}
          </div>
        </section>

        {/* Prestations */}
        <section className="card">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-5 py-4">
            <h2 className="text-sm font-semibold">{isCreditNote ? "Lignes de l'avoir" : "Prestations"}</h2>
            {!linesLocked ? (
              <div className="flex flex-wrap gap-2">
                {catalog.length > 0 ? (
                  <select
                    className="input w-auto"
                    value=""
                    onChange={(e) => {
                      const c = catalog.find((x) => x.id === e.target.value);
                      if (!c) return;
                      setD((p) => ({
                        ...p,
                        lines: [
                          ...p.lines.filter((l) => l.designation || l.unitPrice),
                          {
                            designation: c.designation, description: c.description ?? "", quantity: "1", unit: c.unit,
                            unitPrice: c.unitPrice != null ? String(c.unitPrice) : "", vatRate: String(c.vatRate), discountPercent: "0",
                          },
                        ],
                      }));
                    }}
                  >
                    <option value="">+ Depuis le catalogue (facultatif)</option>
                    {catalog.map((c) => <option key={c.id} value={c.id}>{c.designation}</option>)}
                  </select>
                ) : null}
                <button type="button" className="btn-primary" onClick={() => set("lines", [...d.lines, emptyLine()])}>+ Ligne libre</button>
              </div>
            ) : (
              <span className="text-xs text-muted">Lignes déterminées par le devis (non modifiables)</span>
            )}
          </div>
          <div className="divide-y divide-line">
            {d.lines.map((l, i) => {
              let ht = 0;
              try { ht = lineTotalCents(parsed[i]); } catch { /* saisie en cours */ }
              return (
                <div key={i} className="grid gap-3 px-5 py-4 md:grid-cols-12">
                  <div className="flex items-start gap-2 md:col-span-12">
                    <span className="mt-2 w-6 text-xs font-semibold text-brand">{String(i + 1).padStart(2, "0")}</span>
                    <div className="flex-1 space-y-2">
                      <input className="input font-medium" placeholder="Désignation *" value={l.designation} disabled={linesLocked}
                        onChange={(e) => setLine(i, { designation: e.target.value })} />
                      <textarea className="input min-h-14 text-xs" placeholder="Description détaillée" value={l.description} disabled={linesLocked}
                        onChange={(e) => setLine(i, { description: e.target.value })} />
                    </div>
                    {!linesLocked ? (
                      <div className="flex flex-col gap-1">
                        <button type="button" aria-label="Monter" className="rounded px-2 text-muted hover:bg-mist" onClick={() => move(i, -1)}>↑</button>
                        <button type="button" aria-label="Descendre" className="rounded px-2 text-muted hover:bg-mist" onClick={() => move(i, 1)}>↓</button>
                        <button type="button" aria-label="Supprimer la ligne" className="rounded px-2 text-red-600 hover:bg-red-50"
                          onClick={() => set("lines", d.lines.filter((_, j) => j !== i))}>✕</button>
                      </div>
                    ) : null}
                  </div>
                  <div className="grid grid-cols-2 gap-3 pl-8 sm:grid-cols-6 md:col-span-12">
                    <div>
                      <label className="label">Quantité</label>
                      <input className="input" inputMode="decimal" value={l.quantity} disabled={linesLocked} onChange={(e) => setLine(i, { quantity: e.target.value })} />
                    </div>
                    <div>
                      <label className="label">Unité</label>
                      <input className="input" list="units" value={l.unit} disabled={linesLocked} onChange={(e) => setLine(i, { unit: e.target.value })} />
                    </div>
                    <div className="col-span-2 sm:col-span-1">
                      <label className="label">Prix unitaire HT</label>
                      <input className="input text-right" inputMode="decimal" placeholder="0,00" value={l.unitPrice} disabled={linesLocked}
                        onChange={(e) => setLine(i, { unitPrice: e.target.value })} />
                    </div>
                    <div>
                      <label className="label">TVA %</label>
                      <input className="input" list="vat" inputMode="decimal" value={l.vatRate} disabled={linesLocked} onChange={(e) => setLine(i, { vatRate: e.target.value })} />
                    </div>
                    <div>
                      <label className="label">Remise %</label>
                      <input className="input" inputMode="decimal" value={l.discountPercent} disabled={linesLocked} onChange={(e) => setLine(i, { discountPercent: e.target.value })} />
                    </div>
                    <div className="text-right">
                      <label className="label">Total HT</label>
                      <p className="py-2 text-sm font-semibold tabular-nums">{formatCents(ht, "MAD", true)}</p>
                    </div>
                  </div>
                </div>
              );
            })}
            {d.lines.length === 0 ? <p className="px-5 py-8 text-center text-sm text-muted">Aucune ligne. Ajoutez une prestation libre.</p> : null}
          </div>
          <datalist id="units">{UNITS.map((u) => <option key={u} value={u} />)}</datalist>
          <datalist id="vat">{VAT_RATES.map((v) => <option key={v} value={v} />)}</datalist>
        </section>

        {kind === "quote" ? (
          <section className="card p-5">
            <h2 className="mb-4 text-sm font-semibold">Livrables, délais et conditions spécifiques</h2>
            <p className="mb-4 text-xs text-muted">Astuce : une ligne « Libellé : texte » s&apos;affiche en tableau dans le PDF (ex. « Drone : captation incluse… »).</p>
            <div className="grid gap-4">
              <div><label className="label">Livrables inclus</label><textarea className="input min-h-24" value={d.deliverables} onChange={(e) => set("deliverables", e.target.value)} /></div>
              <div><label className="label">Délais</label><textarea className="input min-h-16" value={d.deadlines} onChange={(e) => set("deadlines", e.target.value)} /></div>
              <div><label className="label">Conditions de production / spécifiques</label><textarea className="input min-h-24" value={d.specificConditions} onChange={(e) => set("specificConditions", e.target.value)} /></div>
              <div><label className="label">Notes</label><textarea className="input min-h-16" value={d.notes} onChange={(e) => set("notes", e.target.value)} /></div>
            </div>
          </section>
        ) : (
          <section className="card p-5">
            <h2 className="mb-4 text-sm font-semibold">Mentions</h2>
            <div className="grid gap-4">
              <div><label className="label">Modalités de paiement</label><textarea className="input min-h-16" value={d.paymentTerms} onChange={(e) => set("paymentTerms", e.target.value)} /></div>
              <div><label className="label">Notes</label><textarea className="input min-h-16" value={d.notes} onChange={(e) => set("notes", e.target.value)} /></div>
            </div>
          </section>
        )}
      </div>

      {/* Colonne récapitulatif */}
      <aside className="space-y-4 xl:sticky xl:top-6 xl:self-start">
        <section className="card overflow-hidden">
          <div className="space-y-2 p-5 text-sm">
            <div className="flex justify-between"><span className="font-medium">Total HT</span><span className="font-semibold tabular-nums">{totals ? formatCents(totals.totalHt, "MAD", true) : "—"}</span></div>
            {totals?.vatBreakdown.map((g) => (
              <div key={g.rate} className="flex justify-between text-muted"><span>TVA {formatPercent(g.rate)}</span><span className="tabular-nums">{formatCents(g.vat, "MAD", true)}</span></div>
            ))}
          </div>
          <div className="flex items-center justify-between bg-ink px-5 py-4 text-white">
            <span className="text-xs font-semibold uppercase tracking-wide">Total TTC</span>
            <span className="text-lg font-semibold tabular-nums">{totals ? formatCents(totals.totalTtc, "MAD", true) : "—"}</span>
          </div>
        </section>

        {kind === "quote" ? (
          <section className="card space-y-4 p-5">
            <h2 className="text-sm font-semibold">Conditions commerciales</h2>
            {!canEditTerms ? <p className="text-xs text-muted">Conditions par défaut fixées par l&apos;administrateur.</p> : null}
            <div className="grid grid-cols-2 gap-3">
              <div><label className="label">Acompte %</label><input className="input" value={d.depositPercent} disabled={!canEditTerms} onChange={(e) => set("depositPercent", e.target.value)} /></div>
              <div><label className="label">Validité (jours)</label><input className="input" value={d.validityDays} disabled={!canEditTerms} onChange={(e) => set("validityDays", e.target.value)} /></div>
            </div>
            <div><label className="label">Modalités</label><textarea className="input min-h-20" value={d.paymentTerms} disabled={!canEditTerms} onChange={(e) => set("paymentTerms", e.target.value)} /></div>
            {totals ? (
              <p className="rounded-lg bg-brand-soft px-3 py-2 text-xs">
                Acompte : <b>{formatCents(Math.round((totals.totalTtc * n(d.depositPercent)) / 100), "MAD", true)}</b> TTC · Solde :{" "}
                <b>{formatCents(totals.totalTtc - Math.round((totals.totalTtc * n(d.depositPercent)) / 100), "MAD", true)}</b>
              </p>
            ) : null}
          </section>
        ) : null}

        {error ? <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
        <button type="button" className="btn-brand w-full" disabled={pending} onClick={submit}>
          {pending ? "Enregistrement…" : "Enregistrer le brouillon"}
        </button>
        <p className="text-center text-xs text-muted">L&apos;aperçu PDF et la soumission au CEO sont disponibles après l&apos;enregistrement.</p>
      </aside>
    </div>
  );
}
