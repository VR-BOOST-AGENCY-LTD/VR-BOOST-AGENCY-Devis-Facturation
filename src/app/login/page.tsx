import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { LoginForm } from "./LoginForm";

export const metadata = { title: "Connexion" };

export default async function LoginPage() {
  if (await getCurrentUser()) redirect("/");
  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden px-4">
      {/* Halos de couleur de marque, fixes et discrets */}
      <div aria-hidden className="pointer-events-none absolute -top-40 -right-32 h-[520px] w-[520px] rounded-full bg-brand/20 blur-[120px]" />
      <div aria-hidden className="pointer-events-none absolute -bottom-48 -left-40 h-[560px] w-[560px] rounded-full bg-go/15 blur-[130px]" />
      <div className="relative w-full max-w-[400px]">
        <div className="anim-fade mb-8 flex flex-col items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.svg" alt="VR BOOST Agency" className="h-10" />
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-muted">Devis & Factures</p>
        </div>
        <div className="anim-page card p-8" style={{ animationDelay: "80ms" }}>
          <h1 className="text-xl font-bold tracking-tight">Bon retour 👋</h1>
          <p className="mb-6 mt-1 text-sm text-muted">Connectez-vous à l&apos;espace sécurisé VR BOOST AGENCY.</p>
          <LoginForm />
        </div>
        <p className="mt-6 text-center text-xs text-muted">Accès réservé · connexion chiffrée</p>
      </div>
    </main>
  );
}
