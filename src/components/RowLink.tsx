"use client";
import { useRouter } from "next/navigation";

/** Ligne de tableau entièrement cliquable (les liens et boutons internes gardent leur propre action). */
export function RowLink({ href, children }: { href: string; children: React.ReactNode }) {
  const router = useRouter();
  return (
    <tr
      className="cursor-pointer hover:bg-mist/60"
      onClick={(e) => {
        if ((e.target as HTMLElement).closest("a,button")) return;
        router.push(href);
      }}
    >
      {children}
    </tr>
  );
}

export function RowActions({ href, pdf }: { href: string; pdf?: string | null }) {
  return (
    <span className="flex justify-end gap-2">
      <a href={href} className="btn-ghost px-2.5 py-1 text-xs">Ouvrir</a>
      {pdf ? <a href={`${pdf}?download=1`} className="btn-primary px-2.5 py-1 text-xs" title="Télécharger le PDF">PDF ↓</a> : null}
    </span>
  );
}
