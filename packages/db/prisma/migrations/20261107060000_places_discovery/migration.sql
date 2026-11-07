-- AlterTable
ALTER TABLE "Run" ADD COLUMN     "apiRequests" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "DiscoveredPlace" (
    "id" UUID NOT NULL,
    "campaignId" UUID NOT NULL,
    "runId" UUID NOT NULL,
    "placeId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DiscoveredPlace_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DiscoveredPlace_runId_position_idx" ON "DiscoveredPlace"("runId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "DiscoveredPlace_campaignId_placeId_key" ON "DiscoveredPlace"("campaignId", "placeId");

-- AddForeignKey
ALTER TABLE "DiscoveredPlace" ADD CONSTRAINT "DiscoveredPlace_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

