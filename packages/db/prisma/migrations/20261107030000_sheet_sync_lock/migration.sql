-- AlterTable
ALTER TABLE "SheetSync" ADD COLUMN     "lastResult" JSONB,
ADD COLUMN     "lockOwner" TEXT,
ADD COLUMN     "lockedUntil" TIMESTAMP(3);

