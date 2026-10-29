import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { can } from "@/lib/permissions";
import { archiveOfficialPdf, invoicePdfDoc, pdfFilename, quotePdfDoc, renderDoc } from "@/pdf/render";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/pdf/quote/:id | /api/pdf/invoice/:id  [?download=1]
 * Document officiel → archive immuable (identique à l'octet près à l'émission).
 * Brouillon → aperçu à la volée, filigrané, sans cachet ni signature.
 */
export async function GET(req: NextRequest, ctx: { params: Promise<{ kind: string; id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  const { kind, id } = await ctx.params;
  if (kind !== "quote" && kind !== "invoice") return NextResponse.json({ error: "Type inconnu" }, { status: 404 });
  const entityType = kind === "quote" ? "QUOTE" : "INVOICE";
  try {
    const { doc, row } = kind === "quote" ? await quotePdfDoc(id) : await invoicePdfDoc(id);
    // Document supprimé : archive consultable uniquement par le CEO (traçabilité)
    if (row.deletedAt && !can(user, kind === "quote" ? "quote.delete" : "invoice.delete")) {
      return NextResponse.json({ error: "Document introuvable" }, { status: 404 });
    }
    let bytes: Uint8Array;
    let filename = pdfFilename(doc, row.client.name);
    let sha: string | null = null;
    if (doc.draft) {
      bytes = new Uint8Array(await renderDoc(doc));
    } else {
      const file =
        (await db.documentFile.findFirst({ where: { entityType, entityId: id }, orderBy: { createdAt: "desc" } })) ??
        (await archiveOfficialPdf(entityType, id, user.id));
      if (!file) throw new AppError("Archive PDF indisponible");
      bytes = file.data;
      filename = file.filename;
      sha = file.sha256;
    }
    const download = req.nextUrl.searchParams.get("download") === "1";
    return new NextResponse(Buffer.from(bytes), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${filename}"`,
        "Cache-Control": "private, no-store",
        ...(sha ? { "X-Document-SHA256": sha } : {}),
      },
    });
  } catch (e) {
    if (e instanceof AppError) return NextResponse.json({ error: e.message }, { status: e.code === "NOT_FOUND" ? 404 : 400 });
    console.error("[pdf]", e);
    return NextResponse.json({ error: "Génération PDF impossible" }, { status: 500 });
  }
}
