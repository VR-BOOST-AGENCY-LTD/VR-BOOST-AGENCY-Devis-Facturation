import { execSync } from "node:child_process";
import "dotenv/config";

// Applique les migrations (triggers inclus) sur la base de test avant la suite.
export default function setup() {
  if (!process.env.TEST_DATABASE_URL) throw new Error("TEST_DATABASE_URL manquant");
  execSync("npx prisma migrate deploy", {
    env: { ...process.env, DATABASE_URL: process.env.TEST_DATABASE_URL },
    stdio: "pipe",
  });
}
