-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "RunStatus" AS ENUM ('queued', 'running', 'partial', 'completed', 'failed', 'cancelled');

-- CreateEnum
CREATE TYPE "RunKind" AS ENUM ('import', 'research', 'discovery', 'recheck', 'sync');

-- CreateEnum
CREATE TYPE "RunItemStatus" AS ENUM ('pending', 'running', 'done', 'failed', 'skipped', 'blocked');

-- CreateEnum
CREATE TYPE "Priority" AS ENUM ('high', 'medium', 'low', 'not_evaluated');

-- CreateEnum
CREATE TYPE "LeadStatus" AS ENUM ('new', 'reviewing', 'contacted', 'qualified', 'rejected');

-- CreateEnum
CREATE TYPE "ObservationStatus" AS ENUM ('present', 'not_observed', 'unknown');

-- CreateEnum
CREATE TYPE "ServiceTemplate" AS ENUM ('qr_menu', 'website', 'appointment', 'reservation', 'ecommerce');

-- CreateEnum
CREATE TYPE "ContactKind" AS ENUM ('email', 'phone');

-- CreateEnum
CREATE TYPE "ExportPolicy" AS ENUM ('allowed', 'restricted', 'forbidden');

-- CreateEnum
CREATE TYPE "AIStatus" AS ENUM ('pending', 'running', 'completed', 'failed', 'skipped');

-- CreateEnum
CREATE TYPE "IntegrationKind" AS ENUM ('google_sheets', 'ollama', 'discovery');

-- CreateEnum
CREATE TYPE "IntegrationStatus" AS ENUM ('not_configured', 'configured', 'healthy', 'error');

-- CreateEnum
CREATE TYPE "SyncStatus" AS ENUM ('pending', 'in_progress', 'done', 'failed');

-- CreateTable
CREATE TABLE "User" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "passwordHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" UUID NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "userId" UUID NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ip" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Campaign" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "serviceDescription" TEXT NOT NULL,
    "template" "ServiceTemplate" NOT NULL,
    "ruleVersion" INTEGER NOT NULL DEFAULT 1,
    "rules" JSONB,
    "countries" TEXT[],
    "cities" TEXT[],
    "categories" TEXT[],
    "language" TEXT NOT NULL DEFAULT 'tr',
    "timezone" TEXT NOT NULL DEFAULT 'Europe/Istanbul',
    "dailyNewLimit" INTEGER NOT NULL DEFAULT 50,
    "dailyPageBudget" INTEGER NOT NULL DEFAULT 250,
    "discoveryCron" TEXT,
    "recheckIntervalDays" INTEGER NOT NULL DEFAULT 7,
    "archivedAt" TIMESTAMP(3),
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Campaign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Business" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "normalizedName" TEXT NOT NULL,
    "website" TEXT,
    "domain" TEXT,
    "country" TEXT,
    "city" TEXT,
    "district" TEXT,
    "address" TEXT,
    "category" TEXT,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "lastCheckedAt" TIMESTAMP(3),
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Business_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BusinessSource" (
    "id" UUID NOT NULL,
    "businessId" UUID NOT NULL,
    "provider" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "sourceUrl" TEXT,
    "attribution" TEXT,
    "exportPolicy" "ExportPolicy" NOT NULL DEFAULT 'allowed',
    "fieldOrigins" JSONB,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BusinessSource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CampaignBusiness" (
    "id" UUID NOT NULL,
    "campaignId" UUID NOT NULL,
    "businessId" UUID NOT NULL,
    "opportunityScore" INTEGER,
    "evidenceCoverage" DOUBLE PRECISION,
    "contactability" INTEGER,
    "priority" "Priority" NOT NULL DEFAULT 'not_evaluated',
    "status" "LeadStatus" NOT NULL DEFAULT 'new',
    "aiStatus" "AIStatus" NOT NULL DEFAULT 'skipped',
    "notes" TEXT,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastEvaluatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CampaignBusiness_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Contact" (
    "id" UUID NOT NULL,
    "businessId" UUID NOT NULL,
    "kind" "ContactKind" NOT NULL,
    "value" TEXT NOT NULL,
    "sourceUrl" TEXT,
    "seenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Contact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Evidence" (
    "id" UUID NOT NULL,
    "businessId" UUID NOT NULL,
    "signal" TEXT NOT NULL,
    "observationStatus" "ObservationStatus" NOT NULL,
    "sourceUrl" TEXT NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL,
    "excerpt" TEXT,
    "contentHash" TEXT,
    "exportPolicy" "ExportPolicy" NOT NULL DEFAULT 'allowed',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Evidence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RuleEvaluation" (
    "id" UUID NOT NULL,
    "campaignBusinessId" UUID NOT NULL,
    "ruleVersion" INTEGER NOT NULL,
    "score" INTEGER NOT NULL,
    "evidenceCoverage" DOUBLE PRECISION NOT NULL,
    "contactability" INTEGER NOT NULL,
    "priority" "Priority" NOT NULL,
    "results" JSONB NOT NULL,
    "evidenceIds" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RuleEvaluation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AIAnalysis" (
    "id" UUID NOT NULL,
    "campaignBusinessId" UUID NOT NULL,
    "model" TEXT NOT NULL,
    "promptVersion" TEXT NOT NULL,
    "evidenceHash" TEXT NOT NULL,
    "status" "AIStatus" NOT NULL,
    "output" JSONB,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AIAnalysis_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Run" (
    "id" UUID NOT NULL,
    "campaignId" UUID NOT NULL,
    "kind" "RunKind" NOT NULL,
    "status" "RunStatus" NOT NULL DEFAULT 'queued',
    "scheduledSlot" TEXT,
    "checkpoint" JSONB,
    "totalItems" INTEGER NOT NULL DEFAULT 0,
    "doneItems" INTEGER NOT NULL DEFAULT 0,
    "failedItems" INTEGER NOT NULL DEFAULT 0,
    "newBusinesses" INTEGER NOT NULL DEFAULT 0,
    "updatedBusinesses" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "cancelRequested" BOOLEAN NOT NULL DEFAULT false,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Run_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RunItem" (
    "id" UUID NOT NULL,
    "runId" UUID NOT NULL,
    "businessId" UUID,
    "status" "RunItemStatus" NOT NULL DEFAULT 'pending',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "errorKind" TEXT,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RunItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Integration" (
    "id" UUID NOT NULL,
    "kind" "IntegrationKind" NOT NULL,
    "status" "IntegrationStatus" NOT NULL DEFAULT 'not_configured',
    "config" JSONB,
    "credentialRef" TEXT,
    "lastCheckedAt" TIMESTAMP(3),
    "lastSuccessAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Integration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SheetSync" (
    "id" UUID NOT NULL,
    "campaignId" UUID NOT NULL,
    "spreadsheetId" TEXT NOT NULL,
    "sheetTabId" INTEGER,
    "sheetTitle" TEXT NOT NULL,
    "lastSyncedAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SheetSync_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SyncOutbox" (
    "id" UUID NOT NULL,
    "campaignBusinessId" UUID NOT NULL,
    "revision" INTEGER NOT NULL,
    "checksum" TEXT NOT NULL,
    "status" "SyncStatus" NOT NULL DEFAULT 'pending',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),

    CONSTRAINT "SyncOutbox_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditEvent" (
    "id" UUID NOT NULL,
    "action" TEXT NOT NULL,
    "actorId" UUID,
    "subject" TEXT,
    "ip" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkerHeartbeat" (
    "workerId" TEXT NOT NULL,
    "hostname" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "lastBeatAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkerHeartbeat_pkey" PRIMARY KEY ("workerId")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Session_tokenHash_key" ON "Session"("tokenHash");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE INDEX "Session_expiresAt_idx" ON "Session"("expiresAt");

-- CreateIndex
CREATE INDEX "Business_domain_idx" ON "Business"("domain");

-- CreateIndex
CREATE INDEX "Business_normalizedName_city_idx" ON "Business"("normalizedName", "city");

-- CreateIndex
CREATE INDEX "BusinessSource_businessId_idx" ON "BusinessSource"("businessId");

-- CreateIndex
CREATE UNIQUE INDEX "BusinessSource_provider_externalId_key" ON "BusinessSource"("provider", "externalId");

-- CreateIndex
CREATE INDEX "CampaignBusiness_campaignId_priority_idx" ON "CampaignBusiness"("campaignId", "priority");

-- CreateIndex
CREATE UNIQUE INDEX "CampaignBusiness_campaignId_businessId_key" ON "CampaignBusiness"("campaignId", "businessId");

-- CreateIndex
CREATE UNIQUE INDEX "Contact_businessId_kind_value_key" ON "Contact"("businessId", "kind", "value");

-- CreateIndex
CREATE INDEX "Evidence_businessId_signal_idx" ON "Evidence"("businessId", "signal");

-- CreateIndex
CREATE INDEX "RuleEvaluation_campaignBusinessId_createdAt_idx" ON "RuleEvaluation"("campaignBusinessId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "AIAnalysis_campaignBusinessId_evidenceHash_promptVersion_key" ON "AIAnalysis"("campaignBusinessId", "evidenceHash", "promptVersion");

-- CreateIndex
CREATE INDEX "Run_status_idx" ON "Run"("status");

-- CreateIndex
CREATE INDEX "Run_campaignId_createdAt_idx" ON "Run"("campaignId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Run_campaignId_scheduledSlot_key" ON "Run"("campaignId", "scheduledSlot");

-- CreateIndex
CREATE INDEX "RunItem_runId_status_idx" ON "RunItem"("runId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "RunItem_runId_businessId_key" ON "RunItem"("runId", "businessId");

-- CreateIndex
CREATE UNIQUE INDEX "Integration_kind_key" ON "Integration"("kind");

-- CreateIndex
CREATE UNIQUE INDEX "SheetSync_campaignId_key" ON "SheetSync"("campaignId");

-- CreateIndex
CREATE INDEX "SyncOutbox_status_createdAt_idx" ON "SyncOutbox"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "SyncOutbox_campaignBusinessId_revision_key" ON "SyncOutbox"("campaignBusinessId", "revision");

-- CreateIndex
CREATE INDEX "AuditEvent_action_createdAt_idx" ON "AuditEvent"("action", "createdAt");

-- CreateIndex
CREATE INDEX "AuditEvent_ip_action_createdAt_idx" ON "AuditEvent"("ip", "action", "createdAt");

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BusinessSource" ADD CONSTRAINT "BusinessSource_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignBusiness" ADD CONSTRAINT "CampaignBusiness_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignBusiness" ADD CONSTRAINT "CampaignBusiness_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contact" ADD CONSTRAINT "Contact_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Evidence" ADD CONSTRAINT "Evidence_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RuleEvaluation" ADD CONSTRAINT "RuleEvaluation_campaignBusinessId_fkey" FOREIGN KEY ("campaignBusinessId") REFERENCES "CampaignBusiness"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AIAnalysis" ADD CONSTRAINT "AIAnalysis_campaignBusinessId_fkey" FOREIGN KEY ("campaignBusinessId") REFERENCES "CampaignBusiness"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Run" ADD CONSTRAINT "Run_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RunItem" ADD CONSTRAINT "RunItem_runId_fkey" FOREIGN KEY ("runId") REFERENCES "Run"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SheetSync" ADD CONSTRAINT "SheetSync_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SyncOutbox" ADD CONSTRAINT "SyncOutbox_campaignBusinessId_fkey" FOREIGN KEY ("campaignBusinessId") REFERENCES "CampaignBusiness"("id") ON DELETE CASCADE ON UPDATE CASCADE;

