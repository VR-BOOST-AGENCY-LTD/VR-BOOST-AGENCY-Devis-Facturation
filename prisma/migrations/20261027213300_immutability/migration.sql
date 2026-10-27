-- Garde-fous d'intégrité au niveau base de données (en plus des contrôles applicatifs).

-- 1. Journal d'audit et archives PDF : ajout seul, jamais modifiés ni supprimés.
CREATE OR REPLACE FUNCTION vrb_forbid_change() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Table % en ajout seul : % interdit', TG_TABLE_NAME, TG_OP;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER audit_log_append_only BEFORE UPDATE OR DELETE ON "AuditLog"
  FOR EACH ROW EXECUTE FUNCTION vrb_forbid_change();
CREATE TRIGGER document_file_append_only BEFORE UPDATE OR DELETE ON "DocumentFile"
  FOR EACH ROW EXECUTE FUNCTION vrb_forbid_change();

-- 2. Factures émises : non supprimables, contenu financier figé.
CREATE OR REPLACE FUNCTION vrb_invoice_guard() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD."number" IS NOT NULL THEN
      RAISE EXCEPTION 'Facture émise % : suppression interdite', OLD."reference";
    END IF;
    RETURN OLD;
  END IF;
  IF OLD."number" IS NOT NULL THEN
    IF NEW."number" IS DISTINCT FROM OLD."number"
       OR NEW."year" IS DISTINCT FROM OLD."year"
       OR NEW."reference" IS DISTINCT FROM OLD."reference"
       OR NEW."type" IS DISTINCT FROM OLD."type"
       OR NEW."clientId" IS DISTINCT FROM OLD."clientId"
       OR NEW."clientSnapshot"::text IS DISTINCT FROM OLD."clientSnapshot"::text
       OR NEW."issueDate" IS DISTINCT FROM OLD."issueDate"
       OR NEW."totalHt" IS DISTINCT FROM OLD."totalHt"
       OR NEW."totalVat" IS DISTINCT FROM OLD."totalVat"
       OR NEW."totalTtc" IS DISTINCT FROM OLD."totalTtc"
       OR NEW."deductedTtc" IS DISTINCT FROM OLD."deductedTtc"
       OR NEW."netToPay" IS DISTINCT FROM OLD."netToPay"
       OR NEW."relatedInvoiceId" IS DISTINCT FROM OLD."relatedInvoiceId"
       OR NEW."quoteId" IS DISTINCT FROM OLD."quoteId" THEN
      RAISE EXCEPTION 'Facture émise % : contenu non modifiable (émettre un avoir)', OLD."reference";
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER invoice_guard BEFORE UPDATE OR DELETE ON "Invoice"
  FOR EACH ROW EXECUTE FUNCTION vrb_invoice_guard();

CREATE OR REPLACE FUNCTION vrb_invoice_line_guard() RETURNS trigger AS $$
DECLARE
  inv_id text;
  inv_number int;
BEGIN
  inv_id := COALESCE(NEW."invoiceId", OLD."invoiceId");
  SELECT "number" INTO inv_number FROM "Invoice" WHERE id = inv_id;
  IF inv_number IS NOT NULL THEN
    RAISE EXCEPTION 'Lignes d''une facture émise non modifiables';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER invoice_line_guard BEFORE INSERT OR UPDATE OR DELETE ON "InvoiceLine"
  FOR EACH ROW EXECUTE FUNCTION vrb_invoice_line_guard();

-- 3. Paiements : jamais supprimés (annulation tracée), montant figé.
CREATE OR REPLACE FUNCTION vrb_payment_guard() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Paiement : suppression interdite (utiliser l''annulation)';
  END IF;
  IF NEW."amount" IS DISTINCT FROM OLD."amount" OR NEW."invoiceId" IS DISTINCT FROM OLD."invoiceId" THEN
    RAISE EXCEPTION 'Paiement : montant et facture non modifiables';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER payment_guard BEFORE UPDATE OR DELETE ON "Payment"
  FOR EACH ROW EXECUTE FUNCTION vrb_payment_guard();

-- 4. Devis approuvés : contenu figé (toute modification passe par une nouvelle version).
CREATE OR REPLACE FUNCTION vrb_quote_guard() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD."number" IS NOT NULL THEN
      RAISE EXCEPTION 'Devis numéroté % : suppression interdite', OLD."reference";
    END IF;
    RETURN OLD;
  END IF;
  IF OLD."status" NOT IN ('DRAFT', 'PENDING_APPROVAL') THEN
    IF NEW."number" IS DISTINCT FROM OLD."number"
       OR NEW."version" IS DISTINCT FROM OLD."version"
       OR NEW."clientId" IS DISTINCT FROM OLD."clientId"
       OR NEW."totalHt" IS DISTINCT FROM OLD."totalHt"
       OR NEW."totalVat" IS DISTINCT FROM OLD."totalVat"
       OR NEW."totalTtc" IS DISTINCT FROM OLD."totalTtc"
       OR NEW."title" IS DISTINCT FROM OLD."title"
       OR NEW."paymentTerms" IS DISTINCT FROM OLD."paymentTerms"
       OR NEW."depositPercent" IS DISTINCT FROM OLD."depositPercent"
       OR NEW."issueDate" IS DISTINCT FROM OLD."issueDate" THEN
      RAISE EXCEPTION 'Devis approuvé % : contenu non modifiable (créer une nouvelle version)', OLD."reference";
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER quote_guard BEFORE UPDATE OR DELETE ON "Quote"
  FOR EACH ROW EXECUTE FUNCTION vrb_quote_guard();

CREATE OR REPLACE FUNCTION vrb_quote_line_guard() RETURNS trigger AS $$
DECLARE
  q_status text;
BEGIN
  SELECT "status"::text INTO q_status FROM "Quote" WHERE id = COALESCE(NEW."quoteId", OLD."quoteId");
  IF q_status IS NOT NULL AND q_status NOT IN ('DRAFT', 'PENDING_APPROVAL') THEN
    RAISE EXCEPTION 'Lignes d''un devis approuvé non modifiables';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER quote_line_guard BEFORE INSERT OR UPDATE OR DELETE ON "QuoteLine"
  FOR EACH ROW EXECUTE FUNCTION vrb_quote_line_guard();

-- 5. Séquences : jamais décrémentées.
CREATE OR REPLACE FUNCTION vrb_sequence_guard() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Séquence : suppression interdite';
  END IF;
  IF OLD."confirmedAt" IS NOT NULL AND NEW."lastNumber" < OLD."lastNumber" THEN
    RAISE EXCEPTION 'Séquence % %/% : décrémentation interdite', OLD."series", OLD."lastNumber", OLD."year";
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER sequence_guard BEFORE UPDATE OR DELETE ON "Sequence"
  FOR EACH ROW EXECUTE FUNCTION vrb_sequence_guard();
