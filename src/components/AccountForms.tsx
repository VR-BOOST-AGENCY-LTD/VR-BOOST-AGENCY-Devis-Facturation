"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { ActionResult } from "@/app/actions";
import { toast } from "./Toaster";

function useAction() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const exec = (fn: () => Promise<ActionResult<unknown>>, onOk?: () => void) =>
    start(async () => {
      setMsg(null);
      const r = await fn();
      setMsg(r.ok ? { ok: true, text: r.message ?? "Enregistré" } : { ok: false, text: r.error });
      if (r.ok) toast(r.message ?? "Enregistré");
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

/** Logo / photo du compte : aperçu à la taille réelle de la barre latérale, envoi et retrait. */
export function AvatarForm({ current, initials, upload, remove }: {
  current: string | null;
  initials: string;
  upload: (form: FormData) => Promise<ActionResult<unknown>>;
  remove: () => Promise<ActionResult<unknown>>;
}) {
  const { pending, exec, Msg } = useAction();
  const [preview, setPreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const shown = preview ?? current;
  return (
    <form
      className="card max-w-xl space-y-4 p-5"
      action={(fd) => {
        const f = fd.get("file");
        if (!(f instanceof File) || f.size === 0) return setError("Choisissez une image.");
        if (f.size > 1024 * 1024) return setError("Image trop lourde : 1 Mo maximum.");
        setError(null);
        exec(() => upload(fd), () => setPreview(null));
      }}
    >
      <div>
        <h2 className="text-sm font-semibold">Logo du compte</h2>
        <p className="mt-1 text-xs text-muted">Affiché en rond dans la barre latérale, à la place de vos initiales.</p>
      </div>
      <div className="flex items-center gap-4">
        {shown ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={shown} alt="Aperçu du logo" className="h-16 w-16 rounded-full bg-white object-cover ring-1 ring-line" />
        ) : (
          <span className="grid h-16 w-16 place-items-center rounded-full bg-ink text-base font-bold text-white">{initials}</span>
        )}
        <ul className="space-y-0.5 text-xs text-muted">
          <li><b className="text-ink">Format exact conseillé : 512 × 512 px</b> (image carrée)</li>
          <li>Accepté : carré de 128 × 128 à 2048 × 2048 px</li>
          <li>PNG (fond transparent ou blanc), JPG ou WebP — 1 Mo maximum</li>
          <li>Rond : gardez une marge d&apos;environ 10 % autour du logo, les coins sont masqués</li>
        </ul>
      </div>
      <input name="file" type="file" required accept="image/png,image/jpeg,image/webp"
        onChange={(e) => { const f = e.target.files?.[0]; setPreview(f ? URL.createObjectURL(f) : null); setError(null); }}
        className="block w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-ink file:px-3 file:py-2 file:text-sm file:font-medium file:text-white" />
      {error ? <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
      <Msg />
      <div className="flex flex-wrap gap-2">
        <button className="btn-primary" disabled={pending}>{pending ? "Envoi…" : "Enregistrer le logo"}</button>
        {current ? <button type="button" className="btn-ghost" disabled={pending} onClick={() => exec(remove, () => setPreview(null))}>Retirer le logo</button> : null}
      </div>
    </form>
  );
}
