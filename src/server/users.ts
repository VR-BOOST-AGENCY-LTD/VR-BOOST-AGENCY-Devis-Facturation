// Comptes : changement de son propre mot de passe ; gestion des utilisateurs par le CEO.
import bcrypt from "bcryptjs";
import { z } from "zod";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { conflict, forbidden, invalid, notFound } from "@/lib/errors";
import { assertCan, type Actor } from "@/lib/permissions";

const MIN = 12;

function checkPassword(pw: string, confirm: string) {
  if (pw.length < MIN) throw invalid(`Mot de passe trop court (${MIN} caractères minimum).`);
  if (pw !== confirm) throw invalid("Les deux saisies ne correspondent pas.");
  if (!/[A-Za-z]/.test(pw) || !/\d/.test(pw)) throw invalid("Le mot de passe doit contenir au moins une lettre et un chiffre.");
}

/** Changement de mot de passe par l'utilisateur lui-même ; les autres sessions sont révoquées. */
export async function changeOwnPassword(actor: Actor, input: { current: string; next: string; confirm: string }, keepSessionHash: string | null) {
  const user = await db.user.findUnique({ where: { id: actor.id } });
  if (!user) throw notFound();
  if (!(await bcrypt.compare(input.current ?? "", user.passwordHash))) throw invalid("Mot de passe actuel incorrect.");
  checkPassword(input.next ?? "", input.confirm ?? "");
  if (input.next === input.current) throw invalid("Le nouveau mot de passe doit être différent de l'actuel.");
  await db.$transaction([
    db.user.update({ where: { id: user.id }, data: { passwordHash: await bcrypt.hash(input.next, 12) } }),
    db.session.deleteMany({ where: { userId: user.id, ...(keepSessionHash ? { tokenHash: { not: keepSessionHash } } : {}) } }),
  ]);
  await audit(db, actor, "user.password", "USER", user.id, "Mot de passe modifié par l'utilisateur (autres sessions révoquées)");
}

const createSchema = z.object({
  email: z.string().trim().toLowerCase().regex(/^[^@\s]+@[^@\s]+\.[^@\s]+$/, "E-mail invalide"),
  name: z.string().trim().min(1, "Nom obligatoire").max(100),
  role: z.enum(["CEO", "SALES"]),
  password: z.string(),
  confirm: z.string(),
});

export async function createUser(actor: Actor, input: unknown) {
  assertCan(actor, "users.manage");
  const d = createSchema.parse(input);
  checkPassword(d.password, d.confirm);
  if (await db.user.findUnique({ where: { email: d.email } })) throw conflict("Un compte existe déjà avec cet e-mail.");
  const u = await db.user.create({ data: { email: d.email, name: d.name, role: d.role, passwordHash: await bcrypt.hash(d.password, 12) } });
  await audit(db, actor, "user.create", "USER", u.id, `Compte créé : ${u.email} (${u.role === "CEO" ? "CEO" : "commerciale"})`);
  return u;
}

async function assertAnotherActiveCeo(excludeId: string) {
  const n = await db.user.count({ where: { role: "CEO", active: true, id: { not: excludeId } } });
  if (n === 0) throw conflict("Il doit rester au moins un compte CEO actif.");
}

export async function updateUser(actor: Actor, id: string, input: { name?: string; role?: "CEO" | "SALES"; active?: boolean }) {
  assertCan(actor, "users.manage");
  const u = await db.user.findUnique({ where: { id } });
  if (!u) throw notFound("Compte introuvable");
  if (id === actor.id && (input.active === false || (input.role && input.role !== u.role))) {
    throw forbidden("Vous ne pouvez pas désactiver ni rétrograder votre propre compte.");
  }
  if (u.role === "CEO" && (input.active === false || input.role === "SALES")) await assertAnotherActiveCeo(id);
  const name = input.name?.trim();
  if (input.name !== undefined && !name) throw invalid("Nom obligatoire.");
  const updated = await db.user.update({
    where: { id },
    data: {
      ...(name ? { name } : {}),
      ...(input.role ? { role: input.role } : {}),
      ...(input.active !== undefined ? { active: input.active, failedLogins: 0, lockedUntil: null } : {}),
    },
  });
  if (input.active === false || (input.role && input.role !== u.role)) {
    await db.session.deleteMany({ where: { userId: id } }); // effet immédiat
  }
  const changes = [
    name && name !== u.name ? `nom « ${name} »` : null,
    input.role && input.role !== u.role ? `rôle ${input.role === "CEO" ? "CEO" : "commerciale"}` : null,
    input.active !== undefined && input.active !== u.active ? (input.active ? "réactivé" : "désactivé") : null,
  ].filter(Boolean);
  await audit(db, actor, "user.update", "USER", id, `Compte ${u.email} modifié : ${changes.join(", ") || "aucun changement"}`);
  return updated;
}

/** Réinitialisation par le CEO : nouveau mot de passe transmis hors application, sessions révoquées. */
export async function resetUserPassword(actor: Actor, id: string, input: { password: string; confirm: string }) {
  assertCan(actor, "users.manage");
  const u = await db.user.findUnique({ where: { id } });
  if (!u) throw notFound("Compte introuvable");
  checkPassword(input.password ?? "", input.confirm ?? "");
  await db.$transaction([
    db.user.update({ where: { id }, data: { passwordHash: await bcrypt.hash(input.password, 12), failedLogins: 0, lockedUntil: null } }),
    db.session.deleteMany({ where: { userId: id } }),
  ]);
  await audit(db, actor, "user.passwordReset", "USER", id, `Mot de passe de ${u.email} réinitialisé par le CEO (sessions révoquées)`);
}
