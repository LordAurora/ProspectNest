-- AlterTable
ALTER TABLE "Campaign" ADD COLUMN     "source" TEXT NOT NULL DEFAULT 'csv';

-- AlterTable
ALTER TABLE "Business" ADD COLUMN     "duplicateOfId" UUID;

-- AlterTable
ALTER TABLE "Run" ADD COLUMN     "summary" JSONB;

-- AddForeignKey
ALTER TABLE "Business" ADD CONSTRAINT "Business_duplicateOfId_fkey" FOREIGN KEY ("duplicateOfId") REFERENCES "Business"("id") ON DELETE SET NULL ON UPDATE CASCADE;

