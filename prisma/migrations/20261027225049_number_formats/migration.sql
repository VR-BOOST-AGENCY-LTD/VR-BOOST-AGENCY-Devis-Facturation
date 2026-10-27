-- AlterTable
ALTER TABLE "CompanySettings" ADD COLUMN     "creditNoteNumberFormat" TEXT NOT NULL DEFAULT 'AV-{n}/{yy}',
ADD COLUMN     "invoiceNumberFormat" TEXT NOT NULL DEFAULT 'FAC-{n}/{yy}',
ADD COLUMN     "quoteNumberFormat" TEXT NOT NULL DEFAULT '{n}/{yyyy}';
