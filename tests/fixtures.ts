import type { CompanySettings } from "@/generated/prisma/client";
import type { PdfDoc } from "@/pdf/model";
import { computeTotals, lineTotalCents } from "@/lib/calc";
import { amountInWords } from "@/lib/format";

export const company = {
  id: 1, companyName: "VR BOOST AGENCY", legalForm: "SARL", capital: "1 000 000.00",
  address: "Technopark, Boulevard Dammam, 3e étage - Bureau 228", city: "Casablanca, Maroc",
  ice: "003734253000073", rc: "679529", ifNumber: "66984515", tp: "34771575", cnss: "7110794",
  phone: "+212 (0) 668 62 6028", email: "Contact@vrboostagency.com", website: "www.vrboostagency.com",
  bankName: "CIH Bank", rib: "230 780 6644788221031400 85", accountHolder: "VR BOOST AGENCY",
  defaultPaymentTerms: "Acompte de 50 % à la validation de la commande. Solde de 50 % à la livraison.",
} as unknown as CompanySettings;

export function sampleLines(n: number) {
  const base = [
    ["Direction créative & préproduction", "Concept, storyboard, shot list et coordination Palma + Le Square.", 3000],
    ["Casting & coordination des talents", "Recherche, sélection et coordination du casting pour les formats portrait face caméra.", 3000],
    ["Production / tournage audiovisuel - 2 jours", "Équipe, matériel caméra, stabilisation, éclairage et direction de tournage.", 6000],
    ["Captation drone professionnelle", "Plans aériens d'environnement et contextualisation des projets, sous réserve des autorisations applicables.", 2000],
    ["Forfait déplacement & logistique Marrakech", "Carburant, péages, hébergement 2 jours, mobilisation technique et coordination sur site.", 2500],
    ["Postproduction - 8 masters de base", "Montage, étalonnage, sound design, habillage, titrage et exports.", 7000],
    ["Intégration & animation des rendus 3D", "Exploitation, animation, transitions et intégration des rendus fournis par le client.", 3500],
    ["Adaptation bilingue FR / Darija & déclinaisons linguistiques", "Adaptation des scripts, prises face caméra FR/Darija, versions paysage, titrage et exports.", 2500],
  ] as const;
  return Array.from({ length: n }, (_, i) => {
    const [designation, description, price] = base[i % base.length];
    return { designation, description, quantity: 1, unit: "forfait", unitPrice: price, vatRate: 20, discountPercent: 0 };
  });
}

export function sampleDoc(kind: "QUOTE" | "INVOICE", nLines: number, overrides: Partial<PdfDoc> = {}): PdfDoc {
  const lines = sampleLines(nLines);
  const t = computeTotals(lines);
  return {
    kind,
    docLabel: kind === "QUOTE" ? "DEVIS" : "FACTURE",
    reference: "00455/2026",
    draft: false,
    signed: true,
    issueDate: "27 octobre 2026",
    validUntil: "26 novembre 2026",
    dueDate: "27 octobre 2026",
    company,
    client: { name: "Yakeey MEA", type: "COMPANY", ice: "003194466000072", ifNumber: null, rc: null, address: null, city: "Casablanca", country: "Maroc", email: null, phone: null, contactName: null },
    projectName: "PALMA & LE SQUARE - Marrakech",
    title: "Production audiovisuelle - Tarif partenaire Yakeey",
    subtitle: "Proposition forfaitaire pour 8 masters vidéo (FR + Darija marocaine) dédiés aux projets Palma et Le Square.",
    lines: lines.map((l) => ({ ...l, unitPrice: l.unitPrice * 100, totalHt: lineTotalCents(l) })),
    totalHt: t.totalHt, totalVat: t.totalVat, totalTtc: t.totalTtc, vatBreakdown: t.vatBreakdown,
    deductions: [], netToPay: t.totalTtc, amountWords: amountInWords(t.totalTtc),
    paymentTerms: company.defaultPaymentTerms, depositPercent: 50, validityDays: 30,
    deliverables: "PALMA : Portrait - Face caméra - FR — 9:16 | 45 sec | Master UHD\nLE SQUARE : Paysage - Sans face caméra - Darija — 16:9 | 75 sec | Master UHD",
    deadlines: "Premières versions sous 10 à 15 jours ouvrés après validation du concept.",
    specificConditions: "Mission : 2 jours de production à Marrakech. Carburant, péages et hébergement inclus.\nDrone : Captation aérienne incluse sous réserve des autorisations applicables.\nCorrections : 2 séries de corrections par format/projet.",
    ...overrides,
  };
}
