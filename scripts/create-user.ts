// Création d'un compte : npm run user:create -- email@domaine.com "Nom affiché" CEO|SALES
// Le mot de passe est saisi deux fois, masqué (jamais en argument ni dans un fichier).
import "dotenv/config";
import bcrypt from "bcryptjs";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { askHidden } from "./lib/ask";

async function main() {
  const [rawEmail, name, role] = process.argv.slice(2);
  const email = rawEmail?.trim().toLowerCase();
  if (!email || !name || (role !== "CEO" && role !== "SALES")) {
    throw new Error('Usage : npm run user:create -- email@domaine.com "Nom affiché" CEO|SALES');
  }
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });
  try {
    if (await db.user.findUnique({ where: { email } })) throw new Error(`Le compte ${email} existe déjà (utiliser user:password).`);
    const pw = await askHidden("Mot de passe (12 caractères min.) : ");
    if (pw.length < 12) throw new Error("Mot de passe trop court (12 caractères minimum).");
    if ((await askHidden("Confirmer le mot de passe : ")) !== pw) throw new Error("Les deux saisies ne correspondent pas.");
    const user = await db.user.create({ data: { email, name, role, passwordHash: await bcrypt.hash(pw, 12) } });
    await db.auditLog.create({
      data: { action: "user.create", entityType: "USER", entityId: user.id, summary: `Compte ${role === "CEO" ? "CEO" : "Account Manager"} créé en ligne de commande : ${email}` },
    });
    console.log(`Compte créé : ${email} (${role}).`);
  } finally {
    await db.$disconnect();
  }
}

main().catch((e) => {
  console.error((e as Error).message);
  process.exit(1);
});
