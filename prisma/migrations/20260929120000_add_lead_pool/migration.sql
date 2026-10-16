-- CreateTable
CREATE TABLE "LeadPoolPerson" (
    "id" TEXT NOT NULL,
    "apolloPersonId" TEXT,
    "linkedinUrl" TEXT,
    "name" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "titleNormalized" TEXT NOT NULL,
    "headline" TEXT,
    "company" TEXT,
    "industry" TEXT,
    "employees" INTEGER,
    "city" TEXT,
    "state" TEXT,
    "country" TEXT,
    "locationText" TEXT NOT NULL DEFAULT '',
    "email" TEXT,
    "emailStatus" TEXT,
    "emailCheckedAt" TIMESTAMP(3),
    "openToWorkSignal" TEXT,
    "sources" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LeadPoolPerson_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "LeadPoolPerson_apolloPersonId_key" ON "LeadPoolPerson"("apolloPersonId");

-- CreateIndex
CREATE UNIQUE INDEX "LeadPoolPerson_linkedinUrl_key" ON "LeadPoolPerson"("linkedinUrl");

-- CreateIndex
CREATE INDEX "LeadPoolPerson_titleNormalized_idx" ON "LeadPoolPerson"("titleNormalized");

-- CreateIndex
CREATE INDEX "LeadPoolPerson_country_idx" ON "LeadPoolPerson"("country");
