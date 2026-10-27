import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { notFound } from "@/lib/errors";
import { assertCan, type Actor } from "@/lib/permissions";
import { clientSchema } from "@/lib/validation";

export async function createClient(actor: Actor, input: unknown) {
  assertCan(actor, "client.edit");
  const data = clientSchema.parse(input);
  return db.$transaction(async (tx) => {
    const c = await tx.client.create({ data: { ...data, createdById: actor.id } });
    await audit(tx, actor, "client.create", "CLIENT", c.id, `Fiche client créée : ${c.name}`);
    return c;
  });
}

export async function updateClient(actor: Actor, id: string, input: unknown) {
  assertCan(actor, "client.edit");
  const data = clientSchema.parse(input);
  return db.$transaction(async (tx) => {
    const before = await tx.client.findUnique({ where: { id } });
    if (!before) throw notFound("Client introuvable");
    // Les documents émis conservent un instantané : modifier la fiche n'altère jamais l'historique.
    const c = await tx.client.update({ where: { id }, data });
    const changed = Object.keys(data).filter(
      (k) => (before as Record<string, unknown>)[k] !== (data as Record<string, unknown>)[k],
    );
    await audit(tx, actor, "client.update", "CLIENT", id, `Fiche client modifiée : ${c.name}`, { changed });
    return c;
  });
}
