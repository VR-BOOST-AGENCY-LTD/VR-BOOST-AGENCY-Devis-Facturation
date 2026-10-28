import type { Metadata } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";

// Police d'interface libre (OFL), auto-hébergée au build : aucun appel à Google côté navigateur.
const ui = Plus_Jakarta_Sans({ subsets: ["latin", "latin-ext"], variable: "--font-ui", display: "swap" });

export const metadata: Metadata = {
  title: { default: "VR BOOST — Devis & Factures", template: "%s · VR BOOST" },
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" className={ui.variable}>
      <body>{children}</body>
    </html>
  );
}
