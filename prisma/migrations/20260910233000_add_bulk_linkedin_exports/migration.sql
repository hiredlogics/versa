CREATE TYPE "BulkExportStatus" AS ENUM ('PENDING', 'RUNNING', 'COMPLETE', 'STOPPED', 'FAILED');
CREATE TYPE "LinkedInUrlStatus" AS ENUM ('PENDING', 'FOUND', 'UNAVAILABLE');

CREATE TABLE "BulkLinkedInExport" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "techStack" TEXT NOT NULL,
  "location" TEXT NOT NULL DEFAULT 'United States',
  "targetCount" INTEGER NOT NULL,
  "maxCredits" INTEGER NOT NULL,
  "status" "BulkExportStatus" NOT NULL DEFAULT 'PENDING',
  "titleVariants" JSONB NOT NULL,
  "currentVariant" INTEGER NOT NULL DEFAULT 0,
  "currentPage" INTEGER NOT NULL DEFAULT 1,
  "searchedCount" INTEGER NOT NULL DEFAULT 0,
  "uniqueCount" INTEGER NOT NULL DEFAULT 0,
  "enrichedCount" INTEGER NOT NULL DEFAULT 0,
  "urlCount" INTEGER NOT NULL DEFAULT 0,
  "estimatedCredits" INTEGER NOT NULL DEFAULT 0,
  "logs" JSONB,
  "errorMessage" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "BulkLinkedInExport_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "BulkLinkedInExportCandidate" (
  "id" TEXT NOT NULL,
  "exportId" TEXT NOT NULL,
  "apolloId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "company" TEXT,
  "location" TEXT,
  "linkedinUrl" TEXT,
  "urlStatus" "LinkedInUrlStatus" NOT NULL DEFAULT 'PENDING',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "BulkLinkedInExportCandidate_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "BulkLinkedInExportCandidate_exportId_apolloId_key" ON "BulkLinkedInExportCandidate"("exportId", "apolloId");
CREATE INDEX "BulkLinkedInExport_userId_createdAt_idx" ON "BulkLinkedInExport"("userId", "createdAt" DESC);
CREATE INDEX "BulkLinkedInExport_status_idx" ON "BulkLinkedInExport"("status");
CREATE INDEX "BulkLinkedInExportCandidate_exportId_urlStatus_idx" ON "BulkLinkedInExportCandidate"("exportId", "urlStatus");
ALTER TABLE "BulkLinkedInExport" ADD CONSTRAINT "BulkLinkedInExport_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BulkLinkedInExportCandidate" ADD CONSTRAINT "BulkLinkedInExportCandidate_exportId_fkey" FOREIGN KEY ("exportId") REFERENCES "BulkLinkedInExport"("id") ON DELETE CASCADE ON UPDATE CASCADE;
