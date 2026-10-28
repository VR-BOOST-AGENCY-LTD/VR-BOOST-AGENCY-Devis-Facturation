"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { ActionResult } from "@/app/actions";

function useAction() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const exec = (fn: () => Promise<ActionResult<unknown>>, onOk?: () => void) =>
    start(async () => {
      setMsg(null);
      const r = await fn();
      setMsg(r.ok ? { ok: true, text: r.message ?? "Enregistré" } : { ok: false, text: r.error });
      if (r.ok) { onOk?.(); router.refresh(); }
    });
  const Msg = () =>
    msg ? <p role={msg.ok ? "status" : "alert"} className={`rounded-lg px-3 py-2 text-sm ${msg.ok ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-700"}`}>{msg.text}</p> : null;
  return { pending, exec, Msg };
}

const PW_HINT = "12 caractères minimum, avec au moins une lettre et un chiffre.";

function Field({ id, label, value, onChange, type = "text", autoComplete }: { id: string; label: string; value: string; onChange: (v: string) => void; type?: string; autoComplete?: string }) {
  return (
    <div>
      <label className="label" htmlFor={id}>{label}</label>
      <input id={id} type={type} autoComplete={autoComplete} className="input" value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

export function ChangePasswordForm({ save }: { save: (d: { current: string; next: string; confirm: string }) => Promise<ActionResult<unknown>> }) {
  const [d, setD] = useState({ current: "", next: "", confirm: "" });
  const { pending, exec, Msg } = useAction();
  return (
    <form className="card max-w-xl space-y-4 p-5" onSubmit={(e) => { e.preventDefault(); exec(() => save(d), () => setD({ current: "", next: "", confirm: "" })); }}>
      <h2 className="text-sm font-semibold">Changer mon mot de passe</h2>
      <Field id="pw-current" label="Mot de passe actuel" type="password" autoComplete="current-password" value={d.current} onChange={(v) => setD({ ...d, current: v })} />
      <Field id="pw-next" label="Nouveau mot de passe" type="password" autoComplete="new-password" value={d.next} onChange={(v) => setD({ ...d, next: v })} />
      <Field id="pw-confirm" label="Confirmer le nouveau mot de passe" type="password" autoComplete="new-password" value={d.confirm} onChange={(v) => setD({ ...d, confirm: v })} />
      <p className="text-xs text-muted">{PW_HINT} Vos autres sessions ouvertes seront déconnectées.</p>
      <Msg />
      <button className="btn-primary" disabled={pending || !d.current || !d.next}>{pending ? "…" : "Mettre à jour"}</button>
    </form>
  );
}

export function CreateUserForm({ create }: { create: (d: unknown) => Promise<ActionResult<unknown>> }) {
  const blank = { email: "", name: "", role: "SALES", password: "", confirm: "" };
  const [d, setD] = useState(blank);
  const [open, setOpen] = useState(false);
  const { pending, exec, Msg } = useAction();
  if (!open) return <button className="btn-brand" onClick={() => setOpen(true)}>+ Nouveau compte</button>;
  return (
    <form className="card grid gap-4 p-5 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); exec(() => create(d), () => { setD(blank); setOpen(false); }); }}>
      <h2 className="text-sm font-semibold sm:col-span-2">Nouveau compte</h2>
      <Field id="u-email" label="E-mail" type="email" value={d.email} onChange={(v) => setD({ ...d, email: v })} />
      <Field id="u-name" label="Nom affiché" value={d.name} onChange={(v) => setD({ ...d, name: v })} />
      <div>
        <label className="label" htmlFor="u-role">Rôle</label>
        <select id="u-role" className="input" value={d.role} onChange={(e) => setD({ ...d, role: e.target.value })}>
          <option value="SALES">Commerciale</option>
          <option value="CEO">CEO — Administrateur</option>
        </select>
      </div>
      <div />
      <Field id="u-pw" label="Mot de passe initial" type="password" autoComplete="new-password" value={d.password} onChange={(v) => setD({ ...d, password: v })} />
      <Field id="u-pw2" label="Confirmer" type="password" autoComplete="new-password" value={d.confirm} onChange={(v) => setD({ ...d, confirm: v })} />
      <p className="text-xs text-muted sm:col-span-2">{PW_HINT} Transmettez-le de vive voix ; la personne pourra le changer dans « Mon compte ».</p>
      <div className="sm:col-span-2"><Msg /></div>
      <div className="flex gap-2 sm:col-span-2">
        <button className="btn-primary" disabled={pending}>{pending ? "…" : "Créer le compte"}</button>
        <button type="button" className="btn-ghost" onClick={() => setOpen(false)}>Annuler</button>
      </div>
    </form>
  );
}

type Row = { id: string; email: string; name: string; role: "CEO" | "SALES"; active: boolean; self: boolean; lastLogin: string | null };

export function UserRowActions({ u, update, reset }: {
  u: Row;
  update: (id: string, d: { name?: string; role?: "CEO" | "SALES"; active?: boolean }) => Promise<ActionResult<unknown>>;
  reset: (id: string, d: { password: string; confirm: string }) => Promise<ActionResult<unknown>>;
}) {
  const [mode, setMode] = useState<null | "reset">(null);
  const [pw, setPw] = useState({ password: "", confirm: "" });
  const { pending, exec, Msg } = useAction();
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap justify-end gap-2">
        {!u.self ? (
          <>
            <button className="btn-ghost px-2.5 py-1 text-xs" disabled={pending}
              onClick={() => exec(() => update(u.id, { role: u.role === "CEO" ? "SALES" : "CEO" }))}>
              {u.role === "CEO" ? "Passer commerciale" : "Passer CEO"}
            </button>
            <button className={`${u.active ? "btn-danger" : "btn-ghost"} px-2.5 py-1 text-xs`} disabled={pending}
              onClick={() => exec(() => update(u.id, { active: !u.active }))}>
              {u.active ? "Désactiver" : "Réactiver"}
            </button>
          </>
        ) : null}
        <button className="btn-ghost px-2.5 py-1 text-xs" onClick={() => setMode(mode ? null : "reset")}>Réinitialiser le mot de passe</button>
      </div>
      {mode === "reset" ? (
        <form className="flex flex-wrap justify-end gap-2" onSubmit={(e) => { e.preventDefault(); exec(() => reset(u.id, pw), () => { setPw({ password: "", confirm: "" }); setMode(null); }); }}>
          <input aria-label="Nouveau mot de passe" type="password" autoComplete="new-password" placeholder="Nouveau mot de passe" className="input w-48" value={pw.password} onChange={(e) => setPw({ ...pw, password: e.target.value })} />
          <input aria-label="Confirmer" type="password" autoComplete="new-password" placeholder="Confirmer" className="input w-40" value={pw.confirm} onChange={(e) => setPw({ ...pw, confirm: e.target.value })} />
          <button className="btn-primary px-3 py-1 text-xs" disabled={pending}>Valider</button>
        </form>
      ) : null}
      <div className="flex justify-end"><Msg /></div>
    </div>
  );
}
