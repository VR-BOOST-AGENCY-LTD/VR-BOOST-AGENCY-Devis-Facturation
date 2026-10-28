import fs from "node:fs";
import path from "node:path";
import { requirePermission } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatDateLong } from "@/lib/format";
import { getSettings } from "@/lib/settings";
import { num } from "@/server/common";
import { hubspotEnabled } from "@/server/hubspot";
import { AccountantForm, SequenceForm, SettingsForm } from "@/components/SettingsForms";
import { Notice, PageHeader } from "@/components/ui";
import { accountantValidationAction, saveSettingsAction, setSequenceAction } from "@/app/actions";

export const metadata = { title: "Paramètres" };

export default async function SettingsPage() {
  await requirePermission("settings.view");
  const s = await getSettings();
  const year = new Date().getFullYear();
  const seqs = await db.sequence.findMany({ where: { year } });
  const [maxQ, maxI] = await Promise.all([
    db.quote.aggregate({ _max: { number: true }, where: { year } }),
    db.invoice.aggregate({ _max: { number: true }, where: { year } }),
  ]);
  const priv = path.resolve(/*turbopackIgnore: true*/ process.cwd(), process.env.PRIVATE_ASSETS_DIR || "./private");
  const has = (p: string) => fs.existsSync(path.join(/*turbopackIgnore: true*/ priv, p));
  const fontMode = process.env.PDF_FONT === "lufga" && has("fonts/Lufga-Regular.otf") ? "Lufga" : "Helvetica (police standard PDF)";
  const seq = (series: "QUOTE" | "INVOICE") => seqs.find((x) => x.series === series);
  return (
    <>
      <PageHeader title="Paramètres" subtitle="Réservé au CEO — toute modification est journalisée" />
      <div className="space-y-6">
        <section id="numerotation" className="card p-5">
          <h2 className="mb-1 text-sm font-semibold">Numérotation automatique</h2>
          <p className="mb-4 text-sm text-muted">Deux séries indépendantes, annuelles. Dernière référence communiquée par la direction : <b>00454</b> (2026). Confirmez le dernier numéro réellement émis dans chaque série avant la mise en production ; aucune émission n&apos;est possible avant.</p>
          <div className="grid gap-4 md:grid-cols-2">
            <SequenceForm series="QUOTE" year={year} lastNumber={seq("QUOTE")?.lastNumber ?? 0} confirmed={Boolean(seq("QUOTE")?.confirmedAt)} maxIssued={maxQ._max.number ?? 0} template={s.quoteNumberFormat} save={setSequenceAction} />
            <SequenceForm series="INVOICE" year={year} lastNumber={seq("INVOICE")?.lastNumber ?? 0} confirmed={Boolean(seq("INVOICE")?.confirmedAt)} maxIssued={maxI._max.number ?? 0} template={s.invoiceNumberFormat} save={setSequenceAction} />
          </div>
        </section>

        <section className="card p-5">
          <h2 className="mb-3 text-sm font-semibold">Validation comptable des modèles et traitements fiscaux</h2>
          <AccountantForm validated={s.accountantValidatedAt ? formatDateLong(s.accountantValidatedAt) : null} name={s.accountantName} save={accountantValidationAction} />
        </section>

        <section className="card grid gap-3 p-5 text-sm md:grid-cols-3">
          <div><p className="label">Cachet & signature</p><p>{has("signature/cachet.png") && has("signature/signature.png") ? "Présents (stockage privé, non publics)" : "Manquants"}</p></div>
          <div><p className="label">Police des PDF</p><p>{fontMode}</p></div>
          <div><p className="label">HubSpot</p><p>{hubspotEnabled() ? "Connecté (jeton serveur)" : "Non configuré"}</p></div>
        </section>
        {process.env.PDF_FONT !== "lufga" ? (
          <Notice tone="sky">La police Lufga (Adam Ladd, licence commerciale) n&apos;est activée qu&apos;après confirmation d&apos;une licence couvrant l&apos;incorporation PDF : définir <code>PDF_FONT=lufga</code>.</Notice>
        ) : null}

        <SettingsForm
          save={saveSettingsAction}
          initial={{
            companyName: s.companyName, legalForm: s.legalForm, capital: s.capital, address: s.address, city: s.city, ice: s.ice, rc: s.rc,
            ifNumber: s.ifNumber, tp: s.tp, cnss: s.cnss, phone: s.phone, email: s.email, website: s.website, bankName: s.bankName, rib: s.rib,
            accountHolder: s.accountHolder, defaultVatRate: num(s.defaultVatRate), defaultDepositPercent: num(s.defaultDepositPercent),
            defaultValidityDays: s.defaultValidityDays, defaultPaymentTerms: s.defaultPaymentTerms, invoicePaymentTerms: s.invoicePaymentTerms,
            invoiceDueDays: s.invoiceDueDays, salesCanEditTerms: s.salesCanEditTerms,
            notificationsEnabled: s.notificationsEnabled, remindersEnabled: s.remindersEnabled,
            reminderIntervalDays: s.reminderIntervalDays, reminderMaxCount: s.reminderMaxCount,
            quoteNumberFormat: s.quoteNumberFormat, invoiceNumberFormat: s.invoiceNumberFormat, creditNoteNumberFormat: s.creditNoteNumberFormat,
          }}
        />
      </div>
    </>
  );
}
