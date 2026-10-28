"use client";
import { useRouter } from "next/navigation";
import { formatReference } from "@/lib/format";
import { useState, useTransition } from "react";
import type { ActionResult } from "@/app/actions";
import { toast } from "./Toaster";

function useSubmit() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const run = (fn: () => Promise<ActionResult<unknown>>) =>
    start(async () => {
      setMsg(null);
      const r = await fn();
      setMsg(r.ok ? { ok: true, text: r.message ?? "Enregistré" } : { ok: false, text: r.error });
      if (r.ok) toast(r.message ?? "Enregistré");
      if (r.ok) router.refresh();
    });
  const Msg = () => (msg ? <p className={`rounded-lg px-3 py-2 text-sm ${msg.ok ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-700"}`}>{msg.text}</p> : null);
  return { pending, run, Msg };
}

type Settings = Record<string, string | number | boolean>;

const COMPANY: [string, string][] = [
  ["companyName", "Raison sociale"], ["legalForm", "Forme juridique"], ["capital", "Capital"], ["address", "Adresse"], ["city", "Ville"],
  ["ice", "ICE"], ["rc", "RC"], ["ifNumber", "IF"], ["tp", "TP"], ["cnss", "CNSS"], ["phone", "Téléphone"], ["email", "E-mail"],
  ["website", "Site web"], ["bankName", "Banque"], ["rib", "RIB"], ["accountHolder", "Titulaire du compte"],
];

export function SettingsForm({ initial, save }: { initial: Settings; save: (d: unknown) => Promise<ActionResult<unknown>> }) {
  const [s, setS] = useState<Settings>(initial);
  const { pending, run, Msg } = useSubmit();
  const field = (k: string, label: string, cls = "") => (
    <div key={k} className={cls}>
      <label className="label">{label}</label>
      <input className="input" value={String(s[k] ?? "")} onChange={(e) => setS({ ...s, [k]: e.target.value })} />
    </div>
  );
  return (
    <form className="space-y-6" onSubmit={(e) => { e.preventDefault(); run(() => save(s)); }}>
      <section className="card p-5">
        <h2 className="mb-4 text-sm font-semibold">Société et coordonnées bancaires (mentions légales des PDF)</h2>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{COMPANY.map(([k, l]) => field(k, l))}</div>
      </section>
      <section className="card p-5">
        <h2 className="mb-4 text-sm font-semibold">Conditions commerciales par défaut</h2>
        <div className="grid gap-4 sm:grid-cols-4">
          {field("defaultDepositPercent", "Acompte (%)")}
          {field("defaultValidityDays", "Validité devis (jours)")}
          {field("defaultVatRate", "TVA par défaut (%)")}
          {field("invoiceDueDays", "Échéance facture (jours)")}
          <div className="sm:col-span-2">
            <label className="label">Modalités devis</label>
            <textarea className="input min-h-16" value={String(s.defaultPaymentTerms)} onChange={(e) => setS({ ...s, defaultPaymentTerms: e.target.value })} />
          </div>
          <div className="sm:col-span-2">
            <label className="label">Modalités facture</label>
            <textarea className="input min-h-16" value={String(s.invoicePaymentTerms)} onChange={(e) => setS({ ...s, invoicePaymentTerms: e.target.value })} />
          </div>
          <label className="flex items-center gap-3 text-sm sm:col-span-4">
            <input type="checkbox" checked={Boolean(s.salesCanEditTerms)} onChange={(e) => setS({ ...s, salesCanEditTerms: e.target.checked })} />
            Autoriser la commerciale à modifier acompte, validité et modalités sur ses devis
          </label>
        </div>
      </section>
      <section className="card p-5">
        <h2 className="mb-4 text-sm font-semibold">Notifications et relances</h2>
        <div className="grid gap-4 sm:grid-cols-4">
          <label className="flex items-start gap-3 text-sm sm:col-span-4">
            <input type="checkbox" className="mt-0.5" checked={Boolean(s.notificationsEnabled)} onChange={(e) => setS({ ...s, notificationsEnabled: e.target.checked })} />
            <span>Notifications internes par e-mail <span className="block text-xs text-muted">Le CEO est prévenu à chaque soumission ; l&apos;auteur est prévenu de l&apos;approbation ou du renvoi.</span></span>
          </label>
          <label className="flex items-start gap-3 text-sm sm:col-span-4">
            <input type="checkbox" className="mt-0.5" checked={Boolean(s.remindersEnabled)} onChange={(e) => setS({ ...s, remindersEnabled: e.target.checked })} />
            <span>Relances automatiques des factures en retard <span className="block text-xs text-muted">E-mail au client avec la facture jointe, copie interne. Exécution quotidienne (tâche planifiée).</span></span>
          </label>
          {field("reminderIntervalDays", "Intervalle entre relances (jours)")}
          {field("reminderMaxCount", "Nombre maximum de relances")}
        </div>
      </section>
      <section className="card p-5">
        <h2 className="mb-1 text-sm font-semibold">Format des numéros</h2>
        <p className="mb-4 text-xs text-muted">{"{n}"} = numéro sur 5 chiffres · {"{yyyy}"} = année · {"{yy}"} = année sur 2 chiffres. S&apos;applique aux prochains documents émis.</p>
        <div className="grid gap-4 sm:grid-cols-3">
          {([["quoteNumberFormat", "Devis"], ["invoiceNumberFormat", "Factures"], ["creditNoteNumberFormat", "Avoirs"]] as const).map(([k, l]) => (
            <div key={k}>
              <label className="label" htmlFor={k}>{l}</label>
              <input id={k} className="input font-mono" value={String(s[k] ?? "")} onChange={(e) => setS({ ...s, [k]: e.target.value })} />
              <p className="mt-1 text-xs text-muted">Aperçu : <b>{formatReference(455, new Date().getFullYear(), 5, String(s[k] ?? ""))}</b></p>
            </div>
          ))}
        </div>
      </section>
      <div className="flex items-center gap-3"><button className="btn-primary" disabled={pending}>Enregistrer les paramètres</button><Msg /></div>
    </form>
  );
}

export function SequenceForm({ series, year, lastNumber, confirmed, maxIssued, template, save }: {
  series: "QUOTE" | "INVOICE"; year: number; lastNumber: number; confirmed: boolean; maxIssued: number; template: string;
  save: (series: "QUOTE" | "INVOICE", year: number, n: number) => Promise<ActionResult<unknown>>;
}) {
  const [n, setN] = useState(String(lastNumber));
  const { pending, run, Msg } = useSubmit();
  const pad = (x: number) => formatReference(x, year, 5, template);
  const next = Number(n) + 1;
  return (
    <form className="rounded-xl border border-line p-4" onSubmit={(e) => { e.preventDefault(); run(() => save(series, year, Number(n))); }}>
      <div className="mb-3 flex items-center justify-between">
        <h3 className="font-semibold">{series === "QUOTE" ? "DEVIS" : "FACTURES & AVOIRS"} — {year}</h3>
        <span className={`rounded-full px-2.5 py-0.5 text-xs ${confirmed ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}`}>{confirmed ? "Activée" : "À confirmer"}</span>
      </div>
      <label className="label">Dernier numéro effectivement émis</label>
      <input className="input" inputMode="numeric" value={n} onChange={(e) => setN(e.target.value.replace(/\D/g, ""))} />
      <p className="mt-2 text-sm">Prochain numéro attribué : <b>{Number.isFinite(next) ? pad(next) : "—"}</b></p>
      {maxIssued > 0 ? <p className="text-xs text-muted">Plus grand numéro déjà attribué dans l&apos;application : {pad(maxIssued)} (impossible de descendre en dessous).</p> : null}
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button className="btn-primary" disabled={pending}>{confirmed ? "Mettre à jour" : "Confirmer et activer"}</button>
        <Msg />
      </div>
    </form>
  );
}

export function AccountantForm({ validated, name, save }: { validated: string | null; name: string | null; save: (n: string | null) => Promise<ActionResult<unknown>> }) {
  const [v, setV] = useState(name ?? "");
  const { pending, run, Msg } = useSubmit();
  return (
    <div className="space-y-3">
      {validated ? <p className="text-sm">Validé par <b>{name}</b> le {validated}.</p> : <p className="text-sm text-muted">Non validé. En production, l&apos;émission des factures est bloquée jusqu&apos;à cette validation.</p>}
      <div className="flex flex-wrap gap-2">
        <input className="input max-w-xs" placeholder="Nom du comptable / cabinet" value={v} onChange={(e) => setV(e.target.value)} />
        <button className="btn-primary" disabled={pending || !v.trim()} onClick={() => run(() => save(v))}>Enregistrer la validation</button>
        {validated ? <button className="btn-danger" disabled={pending} onClick={() => run(() => save(null))}>Retirer</button> : null}
      </div>
      <Msg />
    </div>
  );
}
