import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { can } from "@/lib/permissions";
import { Nav } from "@/components/Nav";
import { Toaster } from "@/components/Toaster";
import { logoutAction } from "../actions";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const pending = can(user, "quote.approve")
    ? (await db.quote.count({ where: { status: "PENDING_APPROVAL", deletedAt: null } })) +
      (await db.invoice.count({ where: { status: "PENDING_APPROVAL", deletedAt: null } }))
    : 0;
  const items = [
    { href: "/", label: "Tableau de bord", icon: "grid", section: "Pilotage" },
    ...(can(user, "quote.approve") ? [{ href: "/validation", label: "Validation CEO", icon: "check", badge: pending, section: "Pilotage" }] : []),
    { href: "/devis", label: "Devis", icon: "file", section: "Ventes" },
    { href: "/factures", label: "Factures", icon: "receipt", section: "Ventes" },
    { href: "/paiements", label: "Paiements", icon: "wallet", section: "Ventes" },
    { href: "/clients", label: "Clients", icon: "users", section: "Ventes" },
    { href: "/catalogue", label: "Catalogue", icon: "list", section: "Ventes" },
    ...(can(user, "settings.view") ? [{ href: "/parametres", label: "Paramètres", icon: "cog", section: "Administration" }] : []),
    ...(can(user, "users.manage") ? [{ href: "/utilisateurs", label: "Utilisateurs", icon: "shield", section: "Administration" }] : []),
    ...(can(user, "audit.view") ? [{ href: "/journal", label: "Journal d'audit", icon: "clock", section: "Administration" }] : []),
  ];
  return (
    <div className="min-h-screen lg:flex lg:gap-3 lg:p-3">
      <Nav items={items} user={{
        name: user.name,
        role: user.role === "CEO" ? "CEO — Administrateur" : "Commerciale",
        avatar: user.avatarUpdatedAt ? `/api/avatar/${user.id}?v=${user.avatarUpdatedAt.getTime()}` : null,
      }} logout={logoutAction} />
      <main className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-5 lg:py-5">{children}</main>
      <Toaster />
    </div>
  );
}
