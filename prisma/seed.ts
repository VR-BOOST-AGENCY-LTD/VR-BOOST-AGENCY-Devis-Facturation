// Données initiales : paramètres société, comptes CEO & commerciale, séquences, catalogue indicatif.
import "dotenv/config";
import bcrypt from "bcryptjs";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });

async function user(email: string | undefined, password: string | undefined, name: string, role: "CEO" | "SALES") {
  if (!email || !password) {
    console.warn(`⚠ ${role} non créé : renseignez SEED_${role === "CEO" ? "CEO" : "SALES"}_EMAIL / _PASSWORD`);
    return;
  }
  if (password.length < 12) throw new Error(`Mot de passe ${role} trop court (12 caractères minimum)`);
  const existing = await db.user.findUnique({ where: { email: email.toLowerCase() } });
  if (existing) return console.log(`= ${role} déjà présent (${email})`);
  await db.user.create({
    data: { email: email.toLowerCase(), name, role, passwordHash: await bcrypt.hash(password, 12) },
  });
  console.log(`+ ${role} créé (${email})`);
}

async function main() {
  await db.companySettings.upsert({ where: { id: 1 }, create: { id: 1 }, update: {} });
  await user(process.env.SEED_CEO_EMAIL, process.env.SEED_CEO_PASSWORD, "CEO — VR BOOST", "CEO");
  await user(process.env.SEED_SALES_EMAIL, process.env.SEED_SALES_PASSWORD, "Meryem", "SALES");

  // Dernière référence communiquée par la direction : 00454/2026 pour chaque série.
  // NON confirmée : le CEO doit valider ces valeurs dans Paramètres › Numérotation avant toute émission.
  for (const series of ["QUOTE", "INVOICE"] as const) {
    await db.sequence.upsert({
      where: { series_year: { series, year: 2026 } },
      create: { series, year: 2026, lastNumber: 454 },
      update: {},
    });
  }

  if ((await db.catalogItem.count()) === 0) {
    await db.catalogItem.createMany({
      data: [
        { designation: "Direction créative & préproduction", description: "Concept, storyboard, shot list et coordination.", unitPrice: null },
        { designation: "Production / tournage audiovisuel", description: "Équipe, matériel caméra, stabilisation, éclairage et direction de tournage.", unit: "jour", unitPrice: null },
        { designation: "Captation drone professionnelle", description: "Plans aériens, sous réserve des autorisations applicables.", unitPrice: null },
        { designation: "Postproduction", description: "Montage, étalonnage, sound design, habillage, titrage et exports.", unitPrice: null },
        { designation: "Captation 3D Matterport et intégration", description: "Numérisation intégrale, navigation immersive et Dollhouse.", unitPrice: null },
        { designation: "Reportage photographique professionnel", description: "Captation intérieurs, façades et extérieurs, clichés HD.", unitPrice: null },
        { designation: "Forfait déplacement et logistique", description: "Mobilisation technique et coordination sur site.", unitPrice: null },
      ],
    });
    console.log("+ catalogue indicatif (prix libres)");
  }
  console.log("Seed terminé.");
}

main().finally(() => db.$disconnect());
