// Gabarit PDF A4 fidèle aux modèles VR BOOST (devis Yakeey 000187/2026, facture 00335/26).
// Fond : en-tête officiel (logo, filigrane, pied de page légal) sur chaque page ; texte vectoriel sélectionnable.
import React from "react";
import { Document, Image, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import { formatCents, formatPercent, formatQty } from "@/lib/format";
import type { FontSet } from "./assets";
import type { PdfDoc, PdfLine } from "./model";

const C = {
  ink: "#101720",
  text: "#2B3038",
  grey: "#7F8691",
  light: "#F1F2F5",
  border: "#E3E6EA",
  orange: "#FC6503",
  peach: "#FDEEE6",
  blue: "#0B9ED9",
  sky: "#E6F6FC",
  white: "#FFFFFF",
};

type Assets = { letterhead: Buffer; stamp: Buffer | null; signature: Buffer | null };

const A4 = { w: 595.28, h: 841.89 };

function makeStyles(F: FontSet, accent: string) {
  return StyleSheet.create({
    page: { paddingTop: 62, paddingBottom: 100, paddingHorizontal: 50, fontSize: 8, color: C.text, ...F.regular },
    bg: { position: "absolute", top: 0, left: 0, width: A4.w, height: A4.h },
    head: { flexDirection: "row", justifyContent: "flex-end", marginBottom: 14 },
    headRight: { alignItems: "flex-end", maxWidth: 330 },
    docTitle: { fontSize: 16, color: C.ink, ...F.bold, letterSpacing: 0.2 },
    docDate: { fontSize: 8, color: C.grey, marginTop: 4 },
    rule: { height: 0.7, backgroundColor: "#9AA0A8", marginBottom: 16 },
    cards: { flexDirection: "row", gap: 14, marginBottom: 16 },
    card: { flex: 1, borderWidth: 0.8, borderColor: C.border, borderRadius: 7, padding: 11, backgroundColor: C.white },
    cardLabel: { fontSize: 6.8, color: accent, ...F.bold, marginBottom: 6, letterSpacing: 0.3 },
    cardName: { fontSize: 11, color: C.ink, ...F.bold, marginBottom: 5 },
    cardLine: { fontSize: 7, color: "#5B616B", marginBottom: 2, lineHeight: 1.2 },
    h1: { fontSize: 11, color: C.ink, ...F.bold, marginBottom: 3 },
    sub: { fontSize: 7.6, color: "#4A5059", marginBottom: 8, lineHeight: 1.35 },
    tHead: {
      flexDirection: "row", backgroundColor: C.ink, borderRadius: 6, paddingVertical: 9, paddingHorizontal: 14,
      marginTop: 4, marginBottom: 2,
    },
    tHeadText: { color: C.white, fontSize: 6.8, ...F.bold, letterSpacing: 0.3 },
    row: { flexDirection: "row", paddingVertical: 7.5, paddingHorizontal: 14, alignItems: "center" },
    num: { width: 30, fontSize: 7.2, color: accent, ...F.bold },
    desig: { fontSize: 8, color: C.ink, ...F.bold, marginBottom: 2 },
    desc: { fontSize: 6.3, color: "#6B717B", lineHeight: 1.3 },
    amount: { fontSize: 8.4, color: C.ink, ...F.bold, textAlign: "right" },
    cell: { fontSize: 7.4, color: C.text, textAlign: "right" },
    totalsWrap: { flexDirection: "row", marginTop: 8, alignItems: "flex-start" },
    totals: { width: 200, marginLeft: "auto" },
    tRow: { flexDirection: "row", justifyContent: "space-between", paddingHorizontal: 14, paddingVertical: 5 },
    tLabel: { fontSize: 7.6, color: C.ink, ...F.bold },
    tValue: { fontSize: 9, color: C.ink, ...F.bold },
    tLabelLight: { fontSize: 7.4, color: "#5B616B" },
    tValueLight: { fontSize: 8, color: "#5B616B" },
    ttc: {
      flexDirection: "row", justifyContent: "space-between", alignItems: "center", backgroundColor: C.ink,
      borderRadius: 6, paddingHorizontal: 14, paddingVertical: 10, marginTop: 6,
    },
    ttcLabel: { fontSize: 8, color: C.white, ...F.bold },
    ttcValue: { fontSize: 11, color: C.white, ...F.bold },
    words: { fontSize: 7.8, color: C.text, marginTop: 12 },
    box: { borderRadius: 8, padding: 12, borderWidth: 0.8 },
    boxTitle: { fontSize: 8.4, ...F.bold, marginBottom: 7, letterSpacing: 0.2 },
    boxLine: { fontSize: 7.4, color: C.text, marginBottom: 3, lineHeight: 1.3 },
    sectionTitle: { fontSize: 12, color: C.ink, ...F.bold, marginBottom: 4, marginTop: 6 },
    para: { fontSize: 7.8, color: "#3D434B", lineHeight: 1.45, marginBottom: 3 },
    condRow: { flexDirection: "row", paddingVertical: 6, paddingLeft: 12 },
    condLabel: { width: 120, fontSize: 8.2, color: C.ink, ...F.bold },
    condValue: { flex: 1, fontSize: 7.8, color: "#4A5059", lineHeight: 1.35 },
    pageNo: { position: "absolute", top: 40, right: 50, fontSize: 6.5, color: C.grey, textAlign: "right" },
    watermark: {
      position: "absolute", top: 400, left: -70, width: 740, textAlign: "center", fontSize: 46, color: "#E4E7EB",
      transform: "rotate(-30deg)", ...F.bold,
    },
    stampCaption: { fontSize: 6.8, color: C.grey, marginTop: 2, textAlign: "center" },
  });
}

type S = ReturnType<typeof makeStyles>;

function Background({ assets, styles, draft }: { assets: Assets; styles: S; draft: boolean }) {
  return (
    <>
      <Image fixed style={styles.bg} src={{ data: assets.letterhead, format: "jpg" }} />
      {draft ? <Text fixed style={styles.watermark}>BROUILLON — NON VALABLE</Text> : null}
      <Text
        fixed
        style={styles.pageNo}
        render={({ pageNumber, totalPages }) => (totalPages > 1 ? `Page ${pageNumber} / ${totalPages}` : "")}
      />
    </>
  );
}

function Header({ doc, styles, title }: { doc: PdfDoc; styles: S; title?: string }) {
  const ref = doc.reference ? `N° ${doc.reference}` : "BROUILLON";
  return (
    <View fixed>
      <View style={styles.head}>
        <View style={styles.headRight}>
          <Text style={styles.docTitle}>{title ?? `${doc.docLabel}   ${ref}`}</Text>
          <Text style={styles.docDate}>
            {title ? `${doc.docLabel} ${ref} — ` : ""}Date d&apos;émission : {doc.issueDate}
          </Text>
        </View>
      </View>
      <View style={styles.rule} />
    </View>
  );
}

function Parties({ doc, styles }: { doc: PdfDoc; styles: S }) {
  const c = doc.company;
  const cl = doc.client;
  const clientLabel = doc.kind === "QUOTE" ? "DEVIS" : doc.docLabel === "AVOIR" ? "AVOIR À" : "FACTURÉ À";
  return (
    <View style={styles.cards} wrap={false}>
      <View style={styles.card}>
        <Text style={styles.cardLabel}>ÉMETTEUR</Text>
        <Text style={styles.cardName}>{c.companyName}</Text>
        <Text style={styles.cardLine}>{c.address}</Text>
        <Text style={styles.cardLine}>{c.city}</Text>
        <Text style={styles.cardLine}>ICE {c.ice} | RC {c.rc}</Text>
        <Text style={styles.cardLine}>IF {c.ifNumber} | TP {c.tp}</Text>
      </View>
      <View style={styles.card}>
        <Text style={styles.cardLabel}>{clientLabel}</Text>
        <Text style={styles.cardName}>{cl.name.toUpperCase()}</Text>
        {cl.ice ? <Text style={styles.cardLine}>ICE : {cl.ice}</Text> : null}
        {cl.ifNumber || cl.rc ? (
          <Text style={styles.cardLine}>
            {[cl.ifNumber && `IF ${cl.ifNumber}`, cl.rc && `RC ${cl.rc}`].filter(Boolean).join(" | ")}
          </Text>
        ) : null}
        {cl.address || cl.city ? (
          <Text style={styles.cardLine}>{[cl.address, cl.city].filter(Boolean).join(", ")}</Text>
        ) : null}
        {doc.projectName ? <Text style={styles.cardLine}>Projet : {doc.projectName}</Text> : null}
        {doc.quoteReference ? <Text style={styles.cardLine}>Référence : devis N° {doc.quoteReference}</Text> : null}
        {doc.relatedReference ? (
          <Text style={styles.cardLine}>
            {doc.docLabel === "AVOIR" ? "Facture d'origine" : "Rectifie la facture"} : N° {doc.relatedReference}
          </Text>
        ) : null}
        {doc.kind === "INVOICE" ? <Text style={styles.cardLine}>Devise : dirham marocain (MAD)</Text> : null}
      </View>
    </View>
  );
}

function LinesTable({ doc, styles }: { doc: PdfDoc; styles: S }) {
  // Colonnes quantité / P.U. affichées seulement si utiles (sinon présentation forfaitaire du modèle).
  const detailed = doc.lines.some((l) => l.quantity !== 1 || l.discountPercent > 0 || l.unit !== "forfait");
  const multiVat = doc.vatBreakdown.length > 1;
  return (
    <View>
      <View style={styles.tHead} fixed>
        <Text style={[styles.tHeadText, { flex: 1 }]}>DÉSIGNATION</Text>
        {detailed ? <Text style={[styles.tHeadText, { width: 52, textAlign: "right" }]}>QTÉ</Text> : null}
        {detailed ? <Text style={[styles.tHeadText, { width: 70, textAlign: "right" }]}>P.U. HT</Text> : null}
        {multiVat ? <Text style={[styles.tHeadText, { width: 40, textAlign: "right" }]}>TVA</Text> : null}
        <Text style={[styles.tHeadText, { width: 92, textAlign: "right" }]}>MONTANT HT</Text>
      </View>
      {doc.lines.map((l, i) => (
        <LineRow key={i} l={l} i={i} styles={styles} detailed={detailed} multiVat={multiVat} />
      ))}
    </View>
  );
}

function LineRow({ l, i, styles, detailed, multiVat }: { l: PdfLine; i: number; styles: S; detailed: boolean; multiVat: boolean }) {
  return (
    <View wrap={false} style={[styles.row, { backgroundColor: i % 2 === 0 ? C.light : C.white }]}>
      <Text style={styles.num}>{String(i + 1).padStart(2, "0")}</Text>
      <View style={{ flex: 1, paddingRight: 10 }}>
        <Text style={styles.desig}>{l.designation}</Text>
        {l.description ? <Text style={styles.desc}>{l.description}</Text> : null}
        {l.discountPercent > 0 ? (
          <Text style={[styles.desc, { color: C.orange }]}>Remise {formatPercent(l.discountPercent)} incluse</Text>
        ) : null}
      </View>
      {detailed ? <Text style={[styles.cell, { width: 52 }]}>{formatQty(l.quantity)} {l.unit}</Text> : null}
      {detailed ? <Text style={[styles.cell, { width: 70 }]}>{formatCents(l.unitPrice, "")}</Text> : null}
      {multiVat ? <Text style={[styles.cell, { width: 40 }]}>{formatPercent(l.vatRate)}</Text> : null}
      <Text style={[styles.amount, { width: 92 }]}>{formatCents(l.totalHt)}</Text>
    </View>
  );
}

function StampBlock({ assets, caption, styles, k = 1 }: { assets: Assets; caption?: string; styles: S; k?: number }) {
  if (!assets.stamp || !assets.signature) return null;
  // Positions relatives reprises du fichier « Cachet & signature » fourni (k = échelle).
  return (
    <View style={{ width: 160 * k, height: (caption ? 124 : 114) * k }}>
      <Image src={{ data: assets.stamp, format: "png" }} style={{ position: "absolute", left: 0, top: 0, width: 137 * k, height: 82 * k }} />
      <Image src={{ data: assets.signature, format: "png" }} style={{ position: "absolute", left: 44 * k, top: 62 * k, width: 107 * k, height: 50 * k }} />
      {caption ? <Text style={[styles.stampCaption, { position: "absolute", top: 114 * k, left: 0, width: 160 * k }]}>{caption}</Text> : null}
    </View>
  );
}

function Totals({ doc, styles, assets, stampLeft }: { doc: PdfDoc; styles: S; assets: Assets; stampLeft: boolean }) {
  const isCredit = doc.docLabel === "AVOIR";
  const hasDeductions = doc.deductions.length > 0;
  return (
    <View style={styles.totalsWrap} wrap={false}>
      <View style={{ flex: 1, paddingLeft: 70 }}>
        {/* Cachet en surimpression (comme le modèle) : n'ajoute pas de hauteur au bloc */}
        {stampLeft && doc.signed ? (
          <View style={{ position: "absolute", top: 0, left: 70 }}>
            <StampBlock assets={assets} styles={styles} k={0.85} />
          </View>
        ) : null}
      </View>
      <View style={styles.totals}>
        <View style={styles.tRow}>
          <Text style={styles.tLabel}>TOTAL HT</Text>
          <Text style={styles.tValue}>{formatCents(doc.totalHt)}</Text>
        </View>
        {doc.vatBreakdown.map((g) => (
          <View style={styles.tRow} key={g.rate}>
            <Text style={styles.tLabelLight}>TVA {formatPercent(g.rate)}</Text>
            <Text style={styles.tValueLight}>{formatCents(g.vat)}</Text>
          </View>
        ))}
        {doc.vatBreakdown.length === 0 ? (
          <View style={styles.tRow}>
            <Text style={styles.tLabelLight}>TVA</Text>
            <Text style={styles.tValueLight}>{formatCents(0)}</Text>
          </View>
        ) : null}
        {hasDeductions ? (
          <>
            <View style={[styles.tRow, { borderTopWidth: 0.6, borderTopColor: C.border, marginTop: 3 }]}>
              <Text style={styles.tLabel}>TOTAL TTC</Text>
              <Text style={styles.tValue}>{formatCents(doc.totalTtc)}</Text>
            </View>
            {doc.deductions.map((d) => (
              <View style={styles.tRow} key={d.invoiceId}>
                <Text style={styles.tLabelLight}>Acompte N° {d.reference}</Text>
                <Text style={styles.tValueLight}>-{formatCents(d.ttc)}</Text>
              </View>
            ))}
          </>
        ) : null}
        <View style={styles.ttc}>
          <Text style={styles.ttcLabel}>
            {isCredit ? "TOTAL AVOIR TTC" : hasDeductions ? "NET À PAYER" : "TOTAL TTC"}
          </Text>
          <Text style={styles.ttcValue}>{formatCents(hasDeductions ? doc.netToPay : doc.totalTtc)}</Text>
        </View>
      </View>
    </View>
  );
}

/** Texte libre : lignes « Libellé : valeur » en tableau (comme le modèle), sinon paragraphes. */
function FreeText({ text, styles }: { text: string; styles: S }) {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  return (
    <View>
      {lines.map((line, i) => {
        const m = line.match(/^([^:]{2,40})\s:\s?(.+)$/) ?? line.match(/^([^:]{2,40}):\s(.+)$/);
        if (m) {
          return (
            <View style={styles.condRow} key={i} wrap={false}>
              <Text style={styles.condLabel}>{m[1].replace(/^[-•]\s*/, "")}</Text>
              <Text style={styles.condValue}>{m[2]}</Text>
            </View>
          );
        }
        return (
          <Text style={styles.para} key={i}>
            {line.startsWith("- ") || line.startsWith("• ") ? `•  ${line.slice(2)}` : line}
          </Text>
        );
      })}
    </View>
  );
}

function QuoteConditionsPage({ doc, styles, assets }: { doc: PdfDoc; styles: S; assets: Assets }) {
  const c = doc.company;
  return (
    <Page size="A4" style={styles.page}>
      <Background assets={assets} styles={styles} draft={doc.draft} />
      <Header doc={doc} styles={styles} title="PÉRIMÈTRE & CONDITIONS" />
      {doc.deliverables ? (
        <View style={{ marginBottom: 14 }}>
          <Text style={styles.sectionTitle}>LIVRABLES INCLUS</Text>
          <View style={[styles.box, { borderColor: C.border, backgroundColor: "#F8F9FA", marginTop: 6 }]}>
            <FreeText text={doc.deliverables} styles={styles} />
          </View>
        </View>
      ) : null}
      {doc.deadlines ? (
        <View style={{ marginBottom: 12 }}>
          <Text style={styles.sectionTitle}>DÉLAIS</Text>
          <FreeText text={doc.deadlines} styles={styles} />
        </View>
      ) : null}
      {doc.specificConditions ? (
        <View style={{ marginBottom: 12 }}>
          <Text style={styles.sectionTitle}>CONDITIONS DE PRODUCTION</Text>
          <FreeText text={doc.specificConditions} styles={styles} />
        </View>
      ) : null}
      {doc.notes ? (
        <View style={{ marginBottom: 12 }}>
          <Text style={styles.sectionTitle}>NOTES</Text>
          <FreeText text={doc.notes} styles={styles} />
        </View>
      ) : null}

      <View wrap={false} style={{ flexDirection: "row", gap: 14, marginTop: 10 }}>
        <View style={[styles.box, { flex: 1.65, backgroundColor: C.peach, borderColor: "#F8D9C8" }]}>
          <Text style={[styles.boxTitle, { color: C.orange }]}>RÈGLEMENT ET COORDONNÉES BANCAIRES</Text>
          <Text style={styles.boxLine}>Modalité : {doc.paymentTerms}</Text>
          <Text style={styles.boxLine}>
            Validité : {doc.validityDays} jours à compter de la date d&apos;émission
            {doc.validUntil ? ` (jusqu'au ${doc.validUntil})` : ""}.
          </Text>
          <Text style={styles.boxLine}>Banque : {c.bankName}</Text>
          <Text style={styles.boxLine}>RIB : {c.rib}</Text>
          <Text style={styles.boxLine}>Titulaire : {c.accountHolder}</Text>
        </View>
        <View style={[styles.box, { flex: 1, borderColor: C.border, backgroundColor: C.white }]}>
          <Text style={[styles.boxTitle, { color: C.ink }]}>VALIDATION {doc.client.name.toUpperCase()}</Text>
          <Text style={[styles.boxLine, { marginBottom: 12 }]}>Bon pour accord</Text>
          <Text style={[styles.boxLine, { color: C.grey, marginBottom: 12 }]}>Nom / Fonction :</Text>
          <Text style={[styles.boxLine, { color: C.grey }]}>Date / Signature / Cachet :</Text>
        </View>
      </View>
      {doc.signed ? (
        <View wrap={false} style={{ marginTop: 10, flexDirection: "row" }}>
          <View style={{ marginLeft: 150 }}>
            <StampBlock assets={assets} styles={styles} caption={`Pour ${c.companyName}`} />
          </View>
        </View>
      ) : null}
    </Page>
  );
}

export function DocumentPdf({ doc, fonts, assets }: { doc: PdfDoc; fonts: FontSet; assets: Assets }) {
  const accent = doc.kind === "QUOTE" ? C.orange : C.blue;
  const styles = makeStyles(fonts, accent);
  const c = doc.company;
  const isCredit = doc.docLabel === "AVOIR";
  return (
    <Document
      title={`${doc.docLabel} ${doc.reference ?? "brouillon"} — ${doc.client.name}`}
      author={c.companyName}
      creator="VR BOOST — Devis & Factures"
      producer="VR BOOST AGENCY"
      language="fr-MA"
    >
      <Page size="A4" style={styles.page}>
        <Background assets={assets} styles={styles} draft={doc.draft} />
        <Header doc={doc} styles={styles} />
        <Parties doc={doc} styles={styles} />
        <Text style={styles.h1}>{doc.title.toUpperCase()}</Text>
        {doc.subtitle ? <Text style={styles.sub}>{doc.subtitle}</Text> : null}
        {doc.reason ? <Text style={styles.sub}>Motif : {doc.reason}</Text> : null}
        <Text style={[styles.h1, { marginTop: 2 }]}>
          {isCredit ? "DÉTAIL DE L'AVOIR" : "DÉTAIL DES PRESTATIONS"}
        </Text>
        <LinesTable doc={doc} styles={styles} />
        <Totals doc={doc} styles={styles} assets={assets} stampLeft={doc.kind === "QUOTE"} />

        {doc.kind === "INVOICE" ? (
          <>
            <Text style={styles.words} wrap={false}>
              {isCredit ? "Arrêté le présent avoir" : "Arrêtée la présente facture"} à la somme de : {doc.amountWords} TTC.
            </Text>
            <View wrap={false} style={{ flexDirection: "row", marginTop: 10, gap: 16, alignItems: "flex-start" }}>
              <View style={[styles.box, { flex: 1.5, backgroundColor: C.sky, borderColor: "#C9ECF8" }]}>
                <Text style={[styles.boxTitle, { color: C.blue }]}>
                  {isCredit ? "INFORMATIONS" : "RÈGLEMENT ET COORDONNÉES BANCAIRES"}
                </Text>
                {isCredit ? (
                  <Text style={styles.boxLine}>
                    Montant à déduire de la facture N° {doc.relatedReference} ou à rembourser selon accord.
                  </Text>
                ) : (
                  <>
                    <Text style={styles.boxLine}>Net à payer : {formatCents(doc.netToPay)} TTC.</Text>
                    {doc.paymentTerms ? <Text style={styles.boxLine}>Modalité : {doc.paymentTerms}</Text> : null}
                    {doc.dueDate ? <Text style={styles.boxLine}>Échéance : {doc.dueDate}</Text> : null}
                    <Text style={styles.boxLine}>Banque : {c.bankName}</Text>
                    <Text style={styles.boxLine}>RIB : {c.rib}</Text>
                    <Text style={styles.boxLine}>Titulaire : {c.accountHolder}</Text>
                    <Text style={styles.boxLine}>Contact : {c.email} - {c.phone}</Text>
                  </>
                )}
              </View>
              <View style={{ width: 170, alignItems: "center" }}>
                {doc.signed ? <StampBlock assets={assets} styles={styles} caption="Cachet et signature" k={0.9} /> : null}
              </View>
            </View>
            {doc.notes ? (
              <View style={{ marginTop: 12 }} wrap={false}>
                <Text style={[styles.h1, { fontSize: 9 }]}>NOTES</Text>
                <FreeText text={doc.notes} styles={styles} />
              </View>
            ) : null}
          </>
        ) : null}
      </Page>
      {doc.kind === "QUOTE" ? <QuoteConditionsPage doc={doc} styles={styles} assets={assets} /> : null}
    </Document>
  );
}
