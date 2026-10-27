import { db } from "@/lib/db";

export async function Timeline({ entityType, ids }: { entityType: string; ids: string[] }) {
  const logs = await db.auditLog.findMany({
    where: { entityType, entityId: { in: ids } },
    include: { user: { select: { name: true } } },
    orderBy: { at: "desc" },
    take: 50,
  });
  return (
    <section className="card p-5">
      <h2 className="mb-4 text-sm font-semibold">Historique</h2>
      <ol className="space-y-3">
        {logs.map((l) => (
          <li key={String(l.id)} className="flex gap-3 text-sm">
            <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-brand" />
            <div>
              <p>{l.summary}</p>
              <p className="text-xs text-muted">
                {l.user?.name ?? "Système"} · {l.at.toLocaleString("fr-MA", { dateStyle: "short", timeStyle: "short", timeZone: "Africa/Casablanca" })}
              </p>
            </div>
          </li>
        ))}
        {logs.length === 0 ? <li className="text-sm text-muted">Aucun événement.</li> : null}
      </ol>
    </section>
  );
}
