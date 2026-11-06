-- CreateEnum
CREATE TYPE "LeaseStatus" AS ENUM ('leased', 'completed', 'expired', 'rejected');

-- CreateTable
CREATE TABLE "AgentCredential" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "prefix" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "lastUsedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgentCredential_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AIJobLease" (
    "id" UUID NOT NULL,
    "agentId" UUID NOT NULL,
    "campaignBusinessId" UUID NOT NULL,
    "evidenceHash" TEXT NOT NULL,
    "promptVersion" TEXT NOT NULL,
    "leaseTokenHash" TEXT NOT NULL,
    "status" "LeaseStatus" NOT NULL DEFAULT 'leased',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AIJobLease_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AgentCredential_tokenHash_key" ON "AgentCredential"("tokenHash");

-- CreateIndex
CREATE INDEX "AIJobLease_campaignBusinessId_status_idx" ON "AIJobLease"("campaignBusinessId", "status");

-- CreateIndex
CREATE INDEX "AIJobLease_status_expiresAt_idx" ON "AIJobLease"("status", "expiresAt");

-- AddForeignKey
ALTER TABLE "AIJobLease" ADD CONSTRAINT "AIJobLease_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "AgentCredential"("id") ON DELETE CASCADE ON UPDATE CASCADE;

