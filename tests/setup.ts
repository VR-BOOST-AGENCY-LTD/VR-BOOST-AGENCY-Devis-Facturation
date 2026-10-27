import "dotenv/config";

// Les tests n'écrivent JAMAIS dans la base de développement.
if (!process.env.TEST_DATABASE_URL) throw new Error("TEST_DATABASE_URL manquant (.env)");
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
process.env.APP_ENV = "test";
