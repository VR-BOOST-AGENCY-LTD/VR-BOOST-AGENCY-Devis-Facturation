import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Téléchargement d'une pièce archivée (bon pour accord signé…), réservé aux utilisateurs connectés. */
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  if (!(await getCurrentUser())) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  const { id } = await ctx.params;
  const f = await db.documentFile.findUnique({ where: { id } });
  if (!f || f.entityType !== "QUOTE_SIGNED") return NextResponse.json({ error: "Introuvable" }, { status: 404 });
  const download = req.nextUrl.searchParams.get("download") === "1";
  return new NextResponse(Buffer.from(f.data), {
    headers: {
      "Content-Type": f.mime,
      "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${f.filename}"`,
      "Cache-Control": "private, no-store",
      "X-Document-SHA256": f.sha256,
    },
  });
}
