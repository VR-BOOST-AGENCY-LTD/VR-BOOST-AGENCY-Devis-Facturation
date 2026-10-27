"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { ActionResult } from "@/app/actions";

type Company = { id: string; name: string; domain: string | null; city: string | null };
type Contact = { id: string; name: string; email: string | null; company: string | null };

export function HubspotSearch({
  enabled,
  search,
  onPick,
  pickLabel = "Importer",
}: {
  enabled: boolean;
  search: (q: string) => Promise<ActionResult<unknown>>;
  onPick: (companyId: string) => Promise<ActionResult<unknown>>;
  pickLabel?: string;
}) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [res, setRes] = useState<{ companies: Company[]; contacts: Contact[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  if (!enabled) {
    return <p className="text-sm text-muted">HubSpot n&apos;est pas encore connecté (variable <code>HUBSPOT_ACCESS_TOKEN</code> côté serveur).</p>;
  }
  return (
    <div>
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          start(async () => {
            setError(null);
            const r = await search(q);
            if (!r.ok) return setError(r.error);
            setRes(r.data as { companies: Company[]; contacts: Contact[] });
          });
        }}
      >
        <input className="input" placeholder="Entreprise ou contact HubSpot…" value={q} onChange={(e) => setQ(e.target.value)} />
        <button className="btn-primary" disabled={pending}>{pending ? "…" : "Rechercher"}</button>
      </form>
      {error ? <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
      {res ? (
        <div className="mt-4 space-y-4 text-sm">
          <ul className="divide-y divide-line rounded-lg border border-line">
            {res.companies.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-3 px-3 py-2">
                <span><b>{c.name}</b> <span className="text-muted">{[c.domain, c.city].filter(Boolean).join(" · ")}</span></span>
                <button className="btn-ghost" disabled={pending} onClick={() => start(async () => {
                  const r = await onPick(c.id);
                  if (!r.ok) return setError(r.error);
                  if (typeof r.data === "string") router.push(`/clients/${r.data}`); else router.refresh();
                })}>{pickLabel}</button>
              </li>
            ))}
            {res.companies.length === 0 ? <li className="px-3 py-2 text-muted">Aucune entreprise.</li> : null}
          </ul>
          {res.contacts.length ? (
            <div>
              <p className="label">Contacts trouvés (rattachés à leur entreprise dans HubSpot)</p>
              <ul className="space-y-1">{res.contacts.map((c) => <li key={c.id}>{c.name} <span className="text-muted">{[c.email, c.company].filter(Boolean).join(" · ")}</span></li>)}</ul>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
