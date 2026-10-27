// Authentification par session serveur : jeton aléatoire en cookie httpOnly, seul son SHA-256 est stocké.
import "server-only";
import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "./db";
import { audit } from "./audit";
import type { Actor, Permission } from "./permissions";
import { can } from "./permissions";

const COOKIE = "vrb_session";
const MAX_FAILED = 5;
const LOCK_MINUTES = 15;
let dummyHash: string | undefined;

const sha256 = (v: string) => crypto.createHash("sha256").update(v).digest("hex");
const ttlHours = () => Number(process.env.SESSION_TTL_HOURS || 12);

export async function hashPassword(pw: string) {
  if (pw.length < 12) throw new Error("Mot de passe trop court (12 caractères minimum)");
  return bcrypt.hash(pw, 12);
}

export async function clientIp() {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || null;
}

export async function login(email: string, password: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const generic = { ok: false as const, error: "Identifiants invalides ou compte verrouillé." };
  const user = await db.user.findUnique({ where: { email: email.trim().toLowerCase() } });
  const ip = await clientIp();
  if (!user || !user.active) {
    dummyHash ??= await bcrypt.hash("comparaison-a-temps-constant", 12);
    await bcrypt.compare(password, dummyHash); // temps constant : ne révèle pas l'existence du compte
    return generic;
  }
  if (user.lockedUntil && user.lockedUntil > new Date()) return generic;
  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) {
    const failed = user.failedLogins + 1;
    await db.user.update({
      where: { id: user.id },
      data: {
        failedLogins: failed >= MAX_FAILED ? 0 : failed,
        lockedUntil: failed >= MAX_FAILED ? new Date(Date.now() + LOCK_MINUTES * 60_000) : null,
      },
    });
    await audit(db, { id: user.id, role: user.role }, "auth.failed", "USER", user.id, "Échec de connexion", undefined, ip);
    return generic;
  }
  const token = crypto.randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + ttlHours() * 3600_000);
  const h = await headers();
  await db.$transaction([
    db.user.update({ where: { id: user.id }, data: { failedLogins: 0, lockedUntil: null } }),
    db.session.create({
      data: { tokenHash: sha256(token), userId: user.id, expiresAt, ip, userAgent: h.get("user-agent")?.slice(0, 300) },
    }),
  ]);
  await audit(db, { id: user.id, role: user.role }, "auth.login", "USER", user.id, "Connexion", undefined, ip);
  (await cookies()).set(COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
  return { ok: true };
}

export async function logout() {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (token) await db.session.deleteMany({ where: { tokenHash: sha256(token) } });
  jar.delete(COOKIE);
}

export type CurrentUser = Actor & { name: string; email: string };

export async function getCurrentUser(): Promise<CurrentUser | null> {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  const s = await db.session.findUnique({ where: { tokenHash: sha256(token) }, include: { user: true } });
  if (!s || s.expiresAt < new Date() || !s.user.active) return null;
  return { id: s.user.id, role: s.user.role, name: s.user.name, email: s.user.email };
}

export async function requireUser(): Promise<CurrentUser> {
  const u = await getCurrentUser();
  if (!u) redirect("/login");
  return u;
}

export async function requirePermission(perm: Permission): Promise<CurrentUser> {
  const u = await requireUser();
  if (!can(u, perm)) redirect("/?refus=1");
  return u;
}
