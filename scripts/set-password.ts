// Usage : npm run user:password -- email@domaine.com
// Le mot de passe est saisi deux fois sur l'entrée standard, masqué (jamais affiché ni passé en argument).
import "dotenv/config";
import bcrypt from "bcryptjs";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { askHidden } from "./lib/ask";

async function main() {
  const email = process.argv[2]?.toLowerCase();
  if (!email) throw new Error("Usage : npm run user:password -- email");
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });
  try {
    const user = await db.user.findUnique({ where: { email } });
    if (!user) throw new Error(`Aucun compte pour ${email}`);
    const pw = await askHidden("Nouveau mot de passe (12 caractères min.) : ");
    if (pw.length < 12) throw new Error("Mot de passe trop court (12 caractères minimum).");
    if ((await askHidden("Confirmer le mot de passe : ")) !== pw) throw new Error("Les deux saisies ne correspondent pas.");
    await db.$transaction([
      db.user.update({ where: { id: user.id }, data: { passwordHash: await bcrypt.hash(pw, 12), failedLogins: 0, lockedUntil: null } }),
      db.session.deleteMany({ where: { userId: user.id } }),
      db.auditLog.create({
        data: { userId: null, action: "user.password", entityType: "USER", entityId: user.id, summary: `Mot de passe réinitialisé en ligne de commande pour ${email}` },
      }),
    ]);
    console.log(`Mot de passe mis à jour pour ${email} (sessions révoquées).`);
  } finally {
    await db.$disconnect();
  }
}

main().catch((e) => {
  console.error((e as Error).message);
  process.exit(1);
});
