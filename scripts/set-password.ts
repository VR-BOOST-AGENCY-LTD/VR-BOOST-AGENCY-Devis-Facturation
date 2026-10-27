// Usage : npx tsx scripts/set-password.ts email@domaine.com
// Le mot de passe est lu sur l'entrée standard (jamais en argument de ligne de commande).
import "dotenv/config";
import readline from "node:readline";
import bcrypt from "bcryptjs";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

const email = process.argv[2]?.toLowerCase();
if (!email) throw new Error("Usage : npx tsx scripts/set-password.ts email");
const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
rl.question("Nouveau mot de passe (12 caractères min.) : ", async (pw) => {
  rl.close();
  if (pw.length < 12) throw new Error("Mot de passe trop court");
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });
  await db.user.update({ where: { email }, data: { passwordHash: await bcrypt.hash(pw, 12), failedLogins: 0, lockedUntil: null } });
  await db.session.deleteMany({ where: { user: { email } } });
  console.log(`Mot de passe mis à jour pour ${email} (sessions révoquées).`);
  await db.$disconnect();
});
