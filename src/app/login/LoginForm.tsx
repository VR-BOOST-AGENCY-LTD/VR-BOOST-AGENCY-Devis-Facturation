"use client";
import { useActionState } from "react";
import { loginAction } from "../actions";

export function LoginForm() {
  const [state, action, pending] = useActionState(loginAction, null);
  return (
    <form action={action} className="space-y-4">
      <div>
        <label className="label" htmlFor="email">E-mail</label>
        <input id="email" name="email" type="email" autoComplete="username" required className="input" placeholder="prenom@vrboostagency.com" />
      </div>
      <div>
        <label className="label" htmlFor="password">Mot de passe</label>
        <input id="password" name="password" type="password" autoComplete="current-password" required className="input" />
      </div>
      {state && !state.ok ? <p role="alert" className="anim-fade rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">{state.error}</p> : null}
      <button className="btn-primary w-full py-2.5" disabled={pending}>
        {pending ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" aria-hidden /> : null}
        {pending ? "Connexion…" : "Se connecter"}
      </button>
    </form>
  );
}
