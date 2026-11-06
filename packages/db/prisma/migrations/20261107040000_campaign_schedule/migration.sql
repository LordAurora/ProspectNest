-- AlterTable
ALTER TABLE "Campaign" ADD COLUMN     "recheckHour" INTEGER NOT NULL DEFAULT 3,
ADD COLUMN     "scheduleEnabled" BOOLEAN NOT NULL DEFAULT false;

