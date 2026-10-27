import type { DbOrTx } from "./db";
import type { Actor } from "./permissions";

export async function audit(
  tx: DbOrTx,
  actor: Actor | null,
  action: string,
  entityType: string,
  entityId: string | null,
  summary: string,
  data?: unknown,
  ip?: string | null,
) {
  await tx.auditLog.create({
    data: {
      userId: actor?.id ?? null,
      action,
      entityType,
      entityId,
      summary,
      data: data === undefined ? undefined : JSON.parse(JSON.stringify(data)),
      ip: ip ?? null,
    },
  });
}
