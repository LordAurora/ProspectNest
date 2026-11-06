-- DropIndex
DROP INDEX "Run_status_idx";

-- AlterTable
ALTER TABLE "Run" ADD COLUMN     "dispatchedAt" TIMESTAMP(3),
ADD COLUMN     "options" JSONB;

-- AlterTable
ALTER TABLE "RunItem" ADD COLUMN     "pagesFetched" INTEGER NOT NULL DEFAULT 0;

-- CreateIndex
CREATE INDEX "Run_status_dispatchedAt_idx" ON "Run"("status", "dispatchedAt");

-- CreateIndex
CREATE INDEX "RunItem_updatedAt_idx" ON "RunItem"("updatedAt");


-- At most one active research-type run per campaign. Not expressible in the
-- Prisma schema, so it lives only in this migration.
CREATE UNIQUE INDEX "Run_one_active_per_campaign"
  ON "Run" ("campaignId")
  WHERE "status" IN ('queued', 'running') AND "kind" IN ('research', 'discovery', 'recheck');
