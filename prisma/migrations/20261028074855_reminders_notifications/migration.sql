-- AlterTable
ALTER TABLE "CompanySettings" ADD COLUMN     "notificationsEnabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "reminderIntervalDays" INTEGER NOT NULL DEFAULT 7,
ADD COLUMN     "reminderMaxCount" INTEGER NOT NULL DEFAULT 3,
ADD COLUMN     "remindersEnabled" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Invoice" ADD COLUMN     "lastReminderAt" TIMESTAMP(3),
ADD COLUMN     "reminderCount" INTEGER NOT NULL DEFAULT 0;
