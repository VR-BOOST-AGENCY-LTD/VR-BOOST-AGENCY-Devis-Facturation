"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { ActionResult } from "@/app/actions";
import { PAYMENT_METHOD } from "./status";

export function PaymentForm({
  invoiceId,
  remainingCents,
  record,
}: {
  invoiceId: string;
  remainingCents: number;
  record: (data: unknown) => Promise<ActionResult<unknown>>;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const today = new Date().toISOString().slice(0, 10);
  return (
    <form
      className="space-y-3"
      action={(fd) =>
        start(async () => {
          setError(null);
          const r = await record({
            invoiceId,
            amount: String(fd.get("amount")).replace(",", ".").replace(/\s/g, ""),
            date: fd.get("date"),
            method: fd.get("method"),
            reference: fd.get("reference"),
            notes: fd.get("notes"),
          });
          if (!r.ok) return setError(r.error);
          router.refresh();
        })
      }
    >
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2">
          <label className="label">Montant reçu (MAD)</label>
          <input name="amount" className="input text-right" inputMode="decimal" defaultValue={(remainingCents / 100).toFixed(2)} required />
        </div>
        <div>
          <label className="label">Date</label>
          <input name="date" type="date" className="input" defaultValue={today} required />
        </div>
        <div>
          <label className="label">Mode</label>
          <select name="method" className="input">
            {Object.entries(PAYMENT_METHOD).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
        <div className="col-span-2">
          <label className="label">Référence (n° virement, chèque…)</label>
          <input name="reference" className="input" />
        </div>
      </div>
      {error ? <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
      <button className="btn-primary w-full" disabled={pending}>{pending ? "Enregistrement…" : "Enregistrer le paiement"}</button>
    </form>
  );
}
