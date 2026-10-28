"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { ActionResult } from "@/app/actions";
import { toast } from "./Toaster";

type C = {
  type: string; name: string; ice: string; ifNumber: string; rc: string; address: string; city: string; country: string;
  email: string; phone: string; contactName: string; notes: string;
};

const FIELDS: [keyof C, string, string?][] = [
  ["name", "Raison sociale / nom *", "sm:col-span-2"],
  ["ice", "ICE"], ["ifNumber", "IF"], ["rc", "RC"], ["contactName", "Interlocuteur"],
  ["address", "Adresse", "sm:col-span-2"], ["city", "Ville"], ["country", "Pays"],
  ["email", "E-mail"], ["phone", "Téléphone"],
];

export function ClientForm({ id, initial, save }: { id: string | null; initial: Partial<C>; save: (id: string | null, d: unknown) => Promise<ActionResult<unknown>> }) {
  const router = useRouter();
  const [c, setC] = useState<C>({
    type: "COMPANY", name: "", ice: "", ifNumber: "", rc: "", address: "", city: "", country: "Maroc", email: "", phone: "", contactName: "", notes: "",
    ...Object.fromEntries(Object.entries(initial).map(([k, v]) => [k, v ?? ""])),
  });
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  const [pending, start] = useTransition();
  return (
    <form
      className="card p-5"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          setError(null); setOk(false);
          const r = await save(id, c);
          if (!r.ok) return setError(r.error);
          setOk(true);
          toast("Fiche client enregistrée");
          if (!id) router.push(`/clients/${r.data}`);
          router.refresh();
        });
      }}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label className="label">Type</label>
          <select className="input" value={c.type} onChange={(e) => setC({ ...c, type: e.target.value })}>
            <option value="COMPANY">Entreprise</option><option value="INDIVIDUAL">Particulier</option>
          </select>
        </div>
        {FIELDS.map(([k, label, cls]) => (
          <div key={k} className={cls}>
            <label className="label" htmlFor={`client-${k}`}>{label}</label>
            <input id={`client-${k}`} className="input" value={c[k]} onChange={(e) => setC({ ...c, [k]: e.target.value })} />
          </div>
        ))}
        <div className="sm:col-span-2">
          <label className="label">Notes internes</label>
          <textarea className="input min-h-16" value={c.notes} onChange={(e) => setC({ ...c, notes: e.target.value })} />
        </div>
      </div>
      {error ? <p role="alert" className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
      {ok ? <p className="mt-4 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">Fiche enregistrée. Les documents déjà émis conservent les coordonnées d&apos;origine.</p> : null}
      <div className="mt-5 flex justify-end"><button className="btn-primary" disabled={pending}>{pending ? "Enregistrement…" : "Enregistrer"}</button></div>
    </form>
  );
}
