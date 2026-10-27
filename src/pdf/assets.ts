// Actifs graphiques lus côté serveur uniquement. Le cachet et la signature ne sont jamais servis
// par HTTP : ils sont incorporés au PDF officiel seulement si le CEO l'a décidé à l'approbation.
import "server-only";
import fs from "node:fs";
import path from "node:path";
import { Font } from "@react-pdf/renderer";

const root = process.cwd();
const privateDir = () => path.resolve(/*turbopackIgnore: true*/ root, process.env.PRIVATE_ASSETS_DIR || "./private");

function read(p: string): Buffer | null {
  try {
    return fs.readFileSync(p);
  } catch {
    return null;
  }
}

let cache: { letterhead: Buffer; stamp: Buffer | null; signature: Buffer | null } | null = null;

export function brandAssets() {
  if (!cache) {
    const letterhead = read(path.join(/*turbopackIgnore: true*/ root, "assets/brand/entete-a4.jpg"));
    if (!letterhead) throw new Error("En-tête introuvable : assets/brand/entete-a4.jpg");
    cache = {
      letterhead,
      stamp: read(path.join(/*turbopackIgnore: true*/ privateDir(), "signature/cachet.png")),
      signature: read(path.join(/*turbopackIgnore: true*/ privateDir(), "signature/signature.png")),
    };
  }
  return cache;
}

export type FontSet = {
  regular: { fontFamily: string; fontWeight?: number };
  medium: { fontFamily: string; fontWeight?: number };
  bold: { fontFamily: string; fontWeight?: number };
  name: "lufga" | "helvetica";
};

let fonts: FontSet | null = null;

/**
 * Police Lufga uniquement si PDF_FONT=lufga ET fichiers présents (licence commerciale requise pour
 * l'incorporation PDF). Sinon Helvetica, police standard PDF utilisée par le devis de référence.
 */
export function pdfFonts(): FontSet {
  if (fonts) return fonts;
  Font.registerHyphenationCallback((word) => [word]);
  const dir = path.join(/*turbopackIgnore: true*/ privateDir(), "fonts");
  const files = { 400: "Lufga-Regular.otf", 500: "Lufga-Medium.otf", 600: "Lufga-SemiBold.otf", 700: "Lufga-Bold.otf" };
  const available = Object.values(files).every((f) => fs.existsSync(path.join(/*turbopackIgnore: true*/ dir, f)));
  if (process.env.PDF_FONT === "lufga" && available) {
    Font.register({
      family: "Lufga",
      fonts: Object.entries(files).map(([w, f]) => ({ src: path.join(/*turbopackIgnore: true*/ dir, f), fontWeight: Number(w) })),
    });
    fonts = {
      name: "lufga",
      regular: { fontFamily: "Lufga", fontWeight: 400 },
      medium: { fontFamily: "Lufga", fontWeight: 500 },
      bold: { fontFamily: "Lufga", fontWeight: 600 },
    };
  } else {
    fonts = {
      name: "helvetica",
      regular: { fontFamily: "Helvetica" },
      medium: { fontFamily: "Helvetica" },
      bold: { fontFamily: "Helvetica-Bold" },
    };
  }
  return fonts;
}
