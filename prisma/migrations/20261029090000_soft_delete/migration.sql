-- Suppression logique des devis et factures (réservée au CEO).
-- Les lignes restent en base : numéros consommés, PDF archivés et journal d'audit conservés.

-- AlterTable
ALTER TABLE "Quote" ADD COLUMN "deletedAt" TIMESTAMP(3),
ADD COLUMN "deletedById" TEXT,
ADD COLUMN "deletionReason" TEXT;

-- AlterTable
ALTER TABLE "Invoice" ADD COLUMN "deletedAt" TIMESTAMP(3),
ADD COLUMN "deletedById" TEXT,
ADD COLUMN "deletionReason" TEXT;

-- AddForeignKey
ALTER TABLE "Quote" ADD CONSTRAINT "Quote_deletedById_fkey" FOREIGN KEY ("deletedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_deletedById_fkey" FOREIGN KEY ("deletedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Garde-fou : un document supprimé est figé (aucune modification, aucune restauration applicative).
CREATE OR REPLACE FUNCTION vrb_deleted_guard() RETURNS trigger AS $$
BEGIN
  IF OLD."deletedAt" IS NOT NULL THEN
    RAISE EXCEPTION 'Document supprimé : modification interdite';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER quote_deleted_guard BEFORE UPDATE OR DELETE ON "Quote"
  FOR EACH ROW EXECUTE FUNCTION vrb_deleted_guard();
CREATE TRIGGER invoice_deleted_guard BEFORE UPDATE OR DELETE ON "Invoice"
  FOR EACH ROW EXECUTE FUNCTION vrb_deleted_guard();
