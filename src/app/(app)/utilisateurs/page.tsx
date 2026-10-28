import { requirePermission } from "@/lib/auth";
import { db } from "@/lib/db";
import { CreateUserForm, UserRowActions } from "@/components/AccountForms";
import { PageHeader } from "@/components/ui";
import { createUserAction, resetUserPasswordAction, updateUserAction } from "@/app/actions";

export const metadata = { title: "Utilisateurs" };

export default async function UsersPage() {
  const me = await requirePermission("users.manage");
  const users = await db.user.findMany({ orderBy: [{ active: "desc" }, { role: "asc" }, { name: "asc" }] });
  const logins = await db.auditLog.groupBy({ by: ["userId"], where: { action: "auth.login" }, _max: { at: true } });
  const last = new Map(logins.map((l) => [l.userId, l._max.at]));
  return (
    <>
      <PageHeader title="Utilisateurs" subtitle="Comptes ayant accès à l'application — réservé au CEO" actions={<CreateUserForm create={createUserAction} />} />
      <div className="card overflow-x-auto">
        <table className="w-full min-w-[820px]">
          <thead className="bg-mist/50"><tr><th className="th">Nom</th><th className="th">E-mail</th><th className="th">Rôle</th><th className="th">Statut</th><th className="th">Dernière connexion</th><th className="th text-right">Actions</th></tr></thead>
          <tbody className="divide-y divide-line">
            {users.map((u) => (
              <tr key={u.id} className={u.active ? "" : "opacity-60"}>
                <td className="td font-medium">{u.name}{u.id === me.id ? <span className="ml-2 text-xs text-muted">(vous)</span> : null}</td>
                <td className="td text-muted">{u.email}</td>
                <td className="td">{u.role === "CEO" ? "CEO — Administrateur" : "Commerciale"}</td>
                <td className="td">{u.active ? <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs text-emerald-800">Actif</span> : <span className="rounded-full bg-mist px-2 py-0.5 text-xs">Désactivé</span>}</td>
                <td className="td text-muted">{last.get(u.id)?.toLocaleString("fr-MA", { dateStyle: "short", timeStyle: "short", timeZone: "Africa/Casablanca" }) ?? "—"}</td>
                <td className="td">
                  <UserRowActions u={{ id: u.id, email: u.email, name: u.name, role: u.role, active: u.active, self: u.id === me.id, lastLogin: null }}
                    update={updateUserAction} reset={resetUserPasswordAction} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-4 text-sm text-muted">Un compte désactivé est déconnecté immédiatement. Il doit toujours rester au moins un compte CEO actif.</p>
    </>
  );
}
