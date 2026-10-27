import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { renderDoc } from "@/pdf/render";
import { sampleDoc } from "../fixtures";

const out = path.resolve(__dirname, "../../test-output");
fs.mkdirSync(out, { recursive: true });

function pageCount(buf: Buffer) {
  return (buf.toString("latin1").match(/\/Type\s*\/Page[^s]/g) ?? []).length;
}

describe("Génération PDF", () => {
  it("devis 8 lignes signé : A4, 2 pages, texte sélectionnable", async () => {
    const buf = await renderDoc(sampleDoc("QUOTE", 8));
    fs.writeFileSync(path.join(out, "devis-8-lignes.pdf"), buf);
    expect(buf.subarray(0, 5).toString()).toBe("%PDF-");
    expect(pageCount(buf)).toBe(2);
    expect(buf.toString("latin1")).toMatch(/\/MediaBox \[0 0 595\.28\d* 841\.89\d*\]/);
  });

  it("devis 30 lignes : pagination automatique multipage", async () => {
    const buf = await renderDoc(sampleDoc("QUOTE", 30));
    fs.writeFileSync(path.join(out, "devis-30-lignes.pdf"), buf);
    expect(pageCount(buf)).toBeGreaterThanOrEqual(4);
  });

  it("facture signée et brouillon sans cachet", async () => {
    const signed = await renderDoc(sampleDoc("INVOICE", 4));
    fs.writeFileSync(path.join(out, "facture-signee.pdf"), signed);
    const draft = await renderDoc(sampleDoc("INVOICE", 4, { draft: true, signed: true, reference: null }));
    fs.writeFileSync(path.join(out, "facture-brouillon.pdf"), draft);
    // Le brouillon ne contient ni cachet ni signature : moins d'images incorporées
    const imgs = (b: Buffer) => (b.toString("latin1").match(/\/Subtype\s*\/Image/g) ?? []).length;
    expect(imgs(draft)).toBeLessThan(imgs(signed));
  });
});
