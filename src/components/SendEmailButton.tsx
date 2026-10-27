"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { ActionResult } from "@/app/actions";

type Draft = { to: string; cc: string; subject: string; message: string };

export function SendEmailButton({
  enabled,
  draft,
  send,
  label = "Envoyer par e-mail",
}: {
  enabled: boolean;
  draft: () => Promise<ActionResult<unknown>>;
  send: (d: Draft) => Promise<ActionResult<unknown>>;
  label?: string;
}) {
  const router = useRouter();
  const [d, setD] = useState<Draft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [pending, start] = useTransition();

  if (!enabled) {
    return <button type="button" className="btn-ghost" disabled title="Envoi d'e-mails non configuré (SMTP)">{label}</button>;
  }
  const open = () =>
    start(async () => {
      setError(null);
      setDone(false);
      const r = await draft();
      if (!r.ok) return setError(r.error);
      setD(r.data as Draft);
    });
  const submit = () =>
    start(async () => {
      if (!d) return;
      setError(null);
      const r = await send(d);
      if (!r.ok) return setError(r.error);
      setDone(true);
      setD(null);
      router.refresh();
    });

  return (
    <>
      <button type="button" className="btn-brand" onClick={open} disabled={pending}>{pending && !d ? "…" : label}</button>
      {done ? <span className="basis-full rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">E-mail envoyé avec le PDF officiel en pièce jointe.</span> : null}
      {error && !d ? <span role="alert" className="basis-full rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</span> : null}
      {d ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4" role="dialog" aria-modal>
          <div className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl">
            <h2 className="mb-4 text-base font-semibold">{label}</h2>
            <div className="space-y-3">
              <div>
                <label className="label" htmlFor="mail-to">À (séparer plusieurs adresses par des virgules)</label>
                <input id="mail-to" className="input" value={d.to} onChange={(e) => setD({ ...d, to: e.target.value })} placeholder="client@exemple.ma" />
              </div>
              <div>
                <label className="label" htmlFor="mail-cc">Cc</label>
                <input id="mail-cc" className="input" value={d.cc} onChange={(e) => setD({ ...d, cc: e.target.value })} />
              </div>
              <div>
                <label className="label" htmlFor="mail-subject">Objet</label>
                <input id="mail-subject" className="input" value={d.subject} onChange={(e) => setD({ ...d, subject: e.target.value })} />
              </div>
              <div>
                <label className="label" htmlFor="mail-body">Message</label>
                <textarea id="mail-body" className="input min-h-64 font-mono text-xs" value={d.message} onChange={(e) => setD({ ...d, message: e.target.value })} />
              </div>
              <p className="text-xs text-muted">Le PDF officiel archivé est joint automatiquement. L&apos;envoi est inscrit au journal d&apos;audit.</p>
            </div>
            {error ? <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
            <div className="mt-6 flex justify-end gap-2">
              <button type="button" className="btn-ghost" onClick={() => setD(null)} disabled={pending}>Annuler</button>
              <button type="button" className="btn-primary" onClick={submit} disabled={pending || !d.to.trim()}>{pending ? "Envoi…" : "Envoyer"}</button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
