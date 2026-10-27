import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "VR BOOST — Devis & Factures", template: "%s · VR BOOST" },
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body>{children}</body>
    </html>
  );
}
