"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { ActionResult } from "@/app/actions";

type Extra = { comment?: string; applySignature?: boolean };

export function ActionButton({
  action,
  label,
  variant = "ghost",
  confirm,
  prompt,
  signatureOption,
  goTo,
}: {
  action: (extra: Extra) => Promise<ActionResult<unknown>>;
  label: string;
  variant?: "primary" | "brand" | "ghost" | "danger";
  confirm?: string;
  prompt?: string;
  signatureOption?: boolean;
  /** Préfixe d'URL vers lequel naviguer avec l'id renvoyé (ex. "/factures/") */
  goTo?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [comment, setComment] = useState("");
  const [sign, setSign] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const needsDialog = Boolean(confirm || prompt || signatureOption);

  const execute = () =>
    start(async () => {
      setError(null);
      const r = await action({ comment: comment || undefined, applySignature: signatureOption ? sign : undefined });
      if (!r.ok) return setError(r.error);
      setOpen(false);
      if (goTo && typeof r.data === "string") router.push(`${goTo}${r.data}`);
      else router.refresh();
    });

  return (
    <>
      <button
        type="button"
        className={`btn-${variant}`}
        disabled={pending}
        onClick={() => (needsDialog ? setOpen(true) : execute())}
      >
        {pending ? "…" : label}
      </button>
      {error && !open ? (
        <span role="alert" className="basis-full rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</span>
      ) : null}
      {open ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4" role="dialog" aria-modal>
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
            <h2 className="text-base font-semibold">{label}</h2>
            {confirm ? <p className="mt-2 text-sm text-muted">{confirm}</p> : null}
            {prompt ? (
              <div className="mt-4">
                <label className="label">{prompt}</label>
                <textarea className="input min-h-24" value={comment} onChange={(e) => setComment(e.target.value)} autoFocus />
              </div>
            ) : null}
            {signatureOption ? (
              <label className="mt-4 flex items-start gap-3 rounded-lg border border-line p-3 text-sm">
                <input type="checkbox" className="mt-0.5" checked={sign} onChange={(e) => setSign(e.target.checked)} />
                <span>
                  <span className="font-medium">Apposer le cachet et la signature du CEO</span>
                  <span className="block text-xs text-muted">Incorporés uniquement au PDF officiel archivé.</span>
                </span>
              </label>
            ) : null}
            {error ? <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
            <div className="mt-6 flex justify-end gap-2">
              <button type="button" className="btn-ghost" onClick={() => setOpen(false)} disabled={pending}>Annuler</button>
              <button
                type="button"
                className={variant === "danger" ? "btn-danger" : "btn-primary"}
                disabled={pending || (Boolean(prompt) && !comment.trim())}
                onClick={execute}
              >
                {pending ? "En cours…" : "Confirmer"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
