"use client";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import type { ActionResult } from "@/app/actions";

export function SignedQuoteUpload({ upload, accepted }: { upload: (form: FormData) => Promise<ActionResult<unknown>>; accepted: boolean }) {
  const router = useRouter();
  const ref = useRef<HTMLFormElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  const [pending, start] = useTransition();
  return (
    <form
      ref={ref}
      className="space-y-3"
      action={(fd) =>
        start(async () => {
          setError(null);
          setOk(false);
          const f = fd.get("file");
          if (f instanceof File && f.size > 10 * 1024 * 1024) return setError("Fichier trop volumineux (10 Mo maximum).");
          const r = await upload(fd);
          if (!r.ok) return setError(r.error);
          setOk(true);
          ref.current?.reset();
          router.refresh();
        })
      }
    >
      <input name="file" type="file" required accept="application/pdf,image/jpeg,image/png"
        className="block w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-ink file:px-3 file:py-2 file:text-sm file:font-medium file:text-white" />
      {!accepted ? (
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="markAccepted" defaultChecked /> Marquer le devis comme accepté par le client
        </label>
      ) : null}
      {error ? <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
      {ok ? <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">Bon pour accord enregistré.</p> : null}
      <button className="btn-primary w-full" disabled={pending}>{pending ? "Envoi…" : "Joindre le bon pour accord"}</button>
      <p className="text-xs text-muted">PDF, JPG ou PNG — 10 Mo maximum. Archivé de façon permanente avec son empreinte.</p>
    </form>
  );
}
