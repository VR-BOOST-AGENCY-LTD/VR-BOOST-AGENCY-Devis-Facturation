// Formatage FR (Maroc). Espaces simples (pas d'espaces fines insécables) pour rester compatibles PDF.

export function formatCents(cents: number, currency = "MAD", alwaysDecimals = false): string {
  const neg = cents < 0;
  const abs = Math.abs(Math.round(cents));
  const int = Math.floor(abs / 100);
  const dec = abs % 100;
  const intStr = String(int).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  const decStr = dec || alwaysDecimals ? `,${String(dec).padStart(2, "0")}` : "";
  return `${neg ? "-" : ""}${intStr}${decStr}${currency ? ` ${currency}` : ""}`;
}

export function formatQty(q: number): string {
  return String(Number(q.toFixed(3))).replace(".", ",");
}

export function formatPercent(p: number): string {
  return `${String(Number(p.toFixed(2))).replace(".", ",")} %`;
}

const MONTHS = [
  "janvier", "février", "mars", "avril", "mai", "juin",
  "juillet", "août", "septembre", "octobre", "novembre", "décembre",
];

export function formatDateLong(d: Date | string | null | undefined): string {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  return `${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
}

export function formatDateShort(d: Date | string | null | undefined): string {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  return `${String(date.getUTCDate()).padStart(2, "0")}/${String(date.getUTCMonth() + 1).padStart(2, "0")}/${date.getUTCFullYear()}`;
}

/** Date du jour à minuit UTC (les dates de documents sont stockées sans heure). */
export function todayUtc(now = new Date()): Date {
  return new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
}

export function addDays(d: Date, days: number): Date {
  const r = new Date(d);
  r.setUTCDate(r.getUTCDate() + days);
  return r;
}

/**
 * Référence à partir d'un modèle : {n} = numéro complété de zéros, {yyyy} = année, {yy} = année sur 2 chiffres.
 * Ex. « {n}/{yyyy} » → 00455/2026 ; « FAC-{n}/{yy} » → FAC-00455/26.
 */
export function formatReference(n: number, year: number, padding = 5, template = "{n}/{yyyy}"): string {
  return template
    .replaceAll("{n}", String(n).padStart(padding, "0"))
    .replaceAll("{yyyy}", String(year))
    .replaceAll("{yy}", String(year).slice(-2));
}

export function quoteReference(ref: string | null, version: number): string {
  if (!ref) return "Brouillon";
  return version > 1 ? `${ref} — V${version}` : ref;
}

// ---------- Montant en lettres ----------
const UNITS = [
  "zéro", "un", "deux", "trois", "quatre", "cinq", "six", "sept", "huit", "neuf", "dix",
  "onze", "douze", "treize", "quatorze", "quinze", "seize", "dix-sept", "dix-huit", "dix-neuf",
];
const TENS = ["", "", "vingt", "trente", "quarante", "cinquante", "soixante", "soixante", "quatre-vingt", "quatre-vingt"];

function below100(n: number): string {
  if (n < 20) return UNITS[n];
  const t = Math.floor(n / 10);
  let u = n % 10;
  if (t === 7 || t === 9) u += 10;
  let word = TENS[t];
  if (u === 0) return t === 8 ? "quatre-vingts" : word;
  if ((u === 1 || u === 11) && t !== 8 && t !== 9) word += " et";
  return `${word}${word.endsWith(" et") ? " " : "-"}${UNITS[u]}`;
}

function below1000(n: number): string {
  const h = Math.floor(n / 100);
  const r = n % 100;
  let s = "";
  if (h > 0) s = h === 1 ? "cent" : `${UNITS[h]} cent${r === 0 ? "s" : ""}`;
  if (r > 0) s += `${s ? " " : ""}${below100(r)}`;
  return s;
}

export function numberToFrenchWords(n: number): string {
  if (!Number.isInteger(n) || n < 0) throw new Error("Entier positif attendu");
  if (n === 0) return "zéro";
  const parts: string[] = [];
  const billions = Math.floor(n / 1_000_000_000);
  const millions = Math.floor((n % 1_000_000_000) / 1_000_000);
  const thousands = Math.floor((n % 1_000_000) / 1000);
  const rest = n % 1000;
  if (billions) parts.push(`${below1000(billions)} milliard${billions > 1 ? "s" : ""}`);
  if (millions) parts.push(`${below1000(millions)} million${millions > 1 ? "s" : ""}`);
  if (thousands) parts.push(thousands === 1 ? "mille" : `${below1000(thousands).replace(/(cent|vingt)s$/, "$1")} mille`);
  if (rest) parts.push(below1000(rest));
  return parts.join(" ");
}

export function amountInWords(cents: number): string {
  const abs = Math.abs(cents);
  const dh = Math.floor(abs / 100);
  const c = abs % 100;
  let s = `${numberToFrenchWords(dh)} dirham${dh > 1 ? "s" : ""}`;
  if (c) s += ` et ${numberToFrenchWords(c)} centime${c > 1 ? "s" : ""}`;
  return s;
}
