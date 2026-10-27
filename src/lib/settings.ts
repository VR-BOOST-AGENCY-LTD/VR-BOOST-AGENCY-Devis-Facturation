import { db, type DbOrTx } from "./db";

export async function getSettings(tx: DbOrTx = db) {
  const s = await tx.companySettings.findUnique({ where: { id: 1 } });
  return s ?? (await tx.companySettings.create({ data: { id: 1 } }));
}

export type CompanySettingsRow = Awaited<ReturnType<typeof getSettings>>;

export function isProduction() {
  return process.env.APP_ENV === "production";
}
