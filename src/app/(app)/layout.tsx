import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { can } from "@/lib/permissions";
import { Nav } from "@/components/Nav";
import { logoutAction } from "../actions";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const pending = can(user, "quote.approve")
    ? (await db.quote.count({ where: { status: "PENDING_APPROVAL" } })) +
      (await db.invoice.count({ where: { status: "PENDING_APPROVAL" } }))
    : 0;
  const items = [
    { href: "/", label: "Tableau de bord", icon: "grid" },
    { href: "/clients", label: "Clients", icon: "users" },
    { href: "/devis", label: "Devis", icon: "file" },
    { href: "/factures", label: "Factures", icon: "receipt" },
    ...(can(user, "quote.approve") ? [{ href: "/validation", label: "Validation CEO", icon: "check", badge: pending }] : []),
    { href: "/paiements", label: "Paiements", icon: "wallet" },
    { href: "/catalogue", label: "Catalogue", icon: "list" },
    ...(can(user, "settings.view") ? [{ href: "/parametres", label: "Paramètres", icon: "cog" }] : []),
    ...(can(user, "audit.view") ? [{ href: "/journal", label: "Journal d'audit", icon: "clock" }] : []),
  ];
  return (
    <div className="min-h-screen lg:flex">
      <Nav items={items} user={{ name: user.name, role: user.role === "CEO" ? "CEO — Administrateur" : "Commerciale" }} logout={logoutAction} />
      <main className="min-w-0 flex-1 px-4 py-6 sm:px-8 lg:py-8">{children}</main>
    </div>
  );
}
