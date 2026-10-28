import Link from "next/link";
import { requirePermission } from "@/lib/auth";
import { db } from "@/lib/db";
import { Empty, PageHeader } from "@/components/ui";

export const metadata = { title: "Journal d'audit" };

const HREF: Record<string, string> = { QUOTE: "/devis/", INVOICE: "/factures/", CLIENT: "/clients/" };

export default async function AuditPage({ searchParams }: { searchParams: Promise<{ page?: string; type?: string }> }) {
  await requirePermission("audit.view");
  const { page = "1", type } = await searchParams;
  const p = Math.max(1, Number(page) || 1);
  const logs = await db.auditLog.findMany({
    where: type ? { entityType: type } : {},
    include: { user: { select: { name: true } } },
    orderBy: { at: "desc" },
    skip: (p - 1) * 100,
    take: 100,
  });
  return (
    <>
      <PageHeader eyebrow="Administration" title="Journal d'audit" subtitle="Ajout seul — non modifiable et non effaçable (verrou base de données)" />
      <div className="mb-4 flex flex-wrap gap-2 text-xs">
        {["", "QUOTE", "INVOICE", "CLIENT", "SEQUENCE", "SETTINGS", "USER"].map((t) => (
          <Link key={t} href={t ? `/journal?type=${t}` : "/journal"} className={`rounded-full px-3 py-1 ${type === t || (!type && !t) ? "bg-ink text-white" : "bg-white ring-1 ring-line"}`}>{t || "Tout"}</Link>
        ))}
      </div>
      <div className="card overflow-x-auto">
        <table className="w-full min-w-[800px]">
          <thead className="border-b border-line/80"><tr><th className="th">Date</th><th className="th">Auteur</th><th className="th">Action</th><th className="th">Détail</th><th className="th">IP</th></tr></thead>
          <tbody className="stagger divide-y divide-line/70">
            {logs.map((l) => (
              <tr key={String(l.id)}>
                <td className="td whitespace-nowrap text-muted">{l.at.toLocaleString("fr-MA", { timeZone: "Africa/Casablanca" })}</td>
                <td className="td">{l.user?.name ?? "Système"}</td>
                <td className="td font-mono text-xs">{l.action}</td>
                <td className="td">{l.entityId && HREF[l.entityType] ? <Link className="hover:underline" href={`${HREF[l.entityType]}${l.entityId}`}>{l.summary}</Link> : l.summary}</td>
                <td className="td text-xs text-muted">{l.ip ?? ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {logs.length === 0 ? <Empty>Aucun événement.</Empty> : null}
      </div>
      <div className="mt-4 flex justify-between text-sm">
        {p > 1 ? <Link className="btn-ghost" href={`/journal?page=${p - 1}${type ? `&type=${type}` : ""}`}>← Plus récents</Link> : <span />}
        {logs.length === 100 ? <Link className="btn-ghost" href={`/journal?page=${p + 1}${type ? `&type=${type}` : ""}`}>Plus anciens →</Link> : null}
      </div>
    </>
  );
}
