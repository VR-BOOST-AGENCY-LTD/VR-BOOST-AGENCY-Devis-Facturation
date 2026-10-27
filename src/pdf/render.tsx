import "server-only";
import crypto from "node:crypto";
import React from "react";
import { renderToBuffer } from "@react-pdf/renderer";
import { db } from "@/lib/db";
import { notFound } from "@/lib/errors";
import { getSettings } from "@/lib/settings";
import { brandAssets, pdfFonts } from "./assets";
import { DocumentPdf } from "./DocumentPdf";
import { invoiceToPdf, quoteToPdf, type PdfDoc } from "./model";

export async function renderDoc(doc: PdfDoc): Promise<Buffer> {
  const assets = brandAssets();
  // Le cachet/signature n'est transmis au gabarit que pour un document officiel signé par le CEO.
  const safeAssets = doc.signed && !doc.draft ? assets : { ...assets, stamp: null, signature: null };
  return renderToBuffer(<DocumentPdf doc={doc} fonts={pdfFonts()} assets={safeAssets} />);
}

export async function quotePdfDoc(id: string) {
  const q = await db.quote.findUnique({ where: { id }, include: { lines: true, client: true } });
  if (!q) throw notFound();
  return { doc: quoteToPdf(q, await getSettings()), row: q };
}

export async function invoicePdfDoc(id: string) {
  const inv = await db.invoice.findUnique({
    where: { id },
    include: { lines: true, client: true, quote: true, relatedInvoice: true },
  });
  if (!inv) throw notFound();
  return { doc: invoiceToPdf(inv, await getSettings()), row: inv };
}

export function pdfFilename(doc: PdfDoc, clientName: string) {
  const ref = (doc.reference ?? "BROUILLON").replace(/[^\w-]+/g, "-");
  const label = doc.docLabel.replace(/[^A-Z]+/gi, "_");
  return `${label}_${ref}_${clientName.replace(/[^\w]+/g, "_").slice(0, 40)}.pdf`;
}

/**
 * Archive immuable du PDF officiel (après approbation / émission). Une seule archive par
 * document-référence ; si elle existe déjà, elle est renvoyée telle quelle (jamais regénérée).
 */
export async function archiveOfficialPdf(entityType: "QUOTE" | "INVOICE", id: string, actorId: string | null) {
  const existing = await db.documentFile.findFirst({ where: { entityType, entityId: id }, orderBy: { createdAt: "desc" } });
  if (existing) return existing;
  const { doc, row } = entityType === "QUOTE" ? await quotePdfDoc(id) : await invoicePdfDoc(id);
  if (doc.draft) return null;
  const data = await renderDoc(doc);
  return db.documentFile.create({
    data: {
      entityType,
      entityId: id,
      reference: doc.reference ?? "",
      filename: pdfFilename(doc, row.client.name),
      data: new Uint8Array(data),
      sha256: crypto.createHash("sha256").update(data).digest("hex"),
      createdById: actorId,
    },
  });
}
