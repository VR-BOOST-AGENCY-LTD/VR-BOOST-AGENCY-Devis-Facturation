import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { AvatarForm, ChangePasswordForm } from "@/components/AccountForms";
import { PageHeader } from "@/components/ui";
import { changePasswordAction, removeAvatarAction, uploadAvatarAction } from "@/app/actions";

export const metadata = { title: "Mon compte" };

export default async function AccountPage() {
  const user = await requireUser();
  const sessions = await db.session.count({ where: { userId: user.id, expiresAt: { gt: new Date() } } });
  return (
    <>
      <PageHeader eyebrow="Compte" title="Mon compte" subtitle={`${user.name} · ${user.email} · ${user.role === "CEO" ? "CEO — Administrateur" : "Commerciale"}`} />
      <div className="space-y-6">
        <AvatarForm
          current={user.avatarUpdatedAt ? `/api/avatar/${user.id}?v=${user.avatarUpdatedAt.getTime()}` : null}
          initials={user.name.split(/\s+/).filter((w) => /[A-Za-zÀ-ÿ]/.test(w)).slice(0, 2).map((w) => w[0]).join("").toUpperCase() || "VR"}
          upload={uploadAvatarAction}
          remove={removeAvatarAction}
        />
        <ChangePasswordForm save={changePasswordAction} />
        <p className="text-sm text-muted">Sessions actives : {sessions}. Changer le mot de passe déconnecte toutes les autres sessions.</p>
      </div>
    </>
  );
}
