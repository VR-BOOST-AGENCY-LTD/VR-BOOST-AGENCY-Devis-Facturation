import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { LoginForm } from "./LoginForm";

export const metadata = { title: "Connexion" };

export default async function LoginPage() {
  if (await getCurrentUser()) redirect("/");
  return (
    <main className="flex min-h-screen items-center justify-center bg-ink px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex justify-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.svg" alt="VR BOOST Agency" className="h-10 invert" />
        </div>
        <div className="rounded-2xl bg-white p-7 shadow-xl">
          <h1 className="text-lg font-semibold">Devis & Factures</h1>
          <p className="mb-6 text-sm text-muted">Espace sécurisé VR BOOST AGENCY</p>
          <LoginForm />
        </div>
      </div>
    </main>
  );
}
