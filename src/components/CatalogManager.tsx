"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { ActionResult } from "@/app/actions";
import { formatCents } from "@/lib/format";

type Item = { id: string; designation: string; description: string | null; unit: string; unitPrice: number | null; vatRate: number; active: boolean };

export function CatalogManager({ items, save, toggle }: {
  items: Item[];
  save: (id: string | null, d: unknown) => Promise<ActionResult<unknown>>;
  toggle: (id: string) => Promise<ActionResult<unknown>>;
}) {
  const router = useRouter();
  const blank = { designation: "", description: "", unit: "forfait", unitPrice: "", vatRate: "20" };
  const [edit, setEdit] = useState<{ id: string | null; v: typeof blank } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="space-y-6">
      <div className="card overflow-x-auto">
        <table className="w-full min-w-[640px]">
          <thead className="bg-mist/50"><tr><th className="th">Prestation</th><th className="th">Unité</th><th className="th text-right">Prix indicatif HT</th><th className="th">TVA</th><th className="th" /></tr></thead>
          <tbody className="divide-y divide-line">
            {items.map((i) => (
              <tr key={i.id} className={i.active ? "" : "opacity-50"}>
                <td className="td"><p className="font-medium">{i.designation}</p>{i.description ? <p className="text-xs text-muted">{i.description}</p> : null}</td>
                <td className="td text-muted">{i.unit}</td>
                <td className="td text-right">{i.unitPrice != null ? formatCents(Math.round(i.unitPrice * 100), "MAD", true) : <span className="text-muted">Libre</span>}</td>
                <td className="td">{i.vatRate} %</td>
                <td className="td whitespace-nowrap text-right">
                  <button className="btn-ghost mr-2" onClick={() => setEdit({ id: i.id, v: { designation: i.designation, description: i.description ?? "", unit: i.unit, unitPrice: i.unitPrice == null ? "" : String(i.unitPrice), vatRate: String(i.vatRate) } })}>Modifier</button>
                  <button className="btn-ghost" onClick={() => start(async () => { await toggle(i.id); router.refresh(); })}>{i.active ? "Désactiver" : "Activer"}</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {edit ? (
        <form className="card grid gap-4 p-5 sm:grid-cols-4" onSubmit={(e) => {
          e.preventDefault();
          start(async () => {
            setError(null);
            const r = await save(edit.id, { ...edit.v, unitPrice: edit.v.unitPrice.replace(",", ".") });
            if (!r.ok) return setError(r.error);
            setEdit(null); router.refresh();
          });
        }}>
          <div className="sm:col-span-4"><label className="label">Désignation *</label><input className="input" value={edit.v.designation} onChange={(e) => setEdit({ ...edit, v: { ...edit.v, designation: e.target.value } })} /></div>
          <div className="sm:col-span-4"><label className="label">Description</label><textarea className="input" value={edit.v.description} onChange={(e) => setEdit({ ...edit, v: { ...edit.v, description: e.target.value } })} /></div>
          <div><label className="label">Unité</label><input className="input" value={edit.v.unit} onChange={(e) => setEdit({ ...edit, v: { ...edit.v, unit: e.target.value } })} /></div>
          <div><label className="label">Prix indicatif HT (vide = libre)</label><input className="input" value={edit.v.unitPrice} onChange={(e) => setEdit({ ...edit, v: { ...edit.v, unitPrice: e.target.value } })} /></div>
          <div><label className="label">TVA %</label><input className="input" value={edit.v.vatRate} onChange={(e) => setEdit({ ...edit, v: { ...edit.v, vatRate: e.target.value } })} /></div>
          <div className="flex items-end gap-2"><button className="btn-primary" disabled={pending}>Enregistrer</button><button type="button" className="btn-ghost" onClick={() => setEdit(null)}>Annuler</button></div>
          {error ? <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 sm:col-span-4">{error}</p> : null}
        </form>
      ) : (
        <button className="btn-primary" onClick={() => setEdit({ id: null, v: blank })}>+ Ajouter une prestation</button>
      )}
    </div>
  );
}
