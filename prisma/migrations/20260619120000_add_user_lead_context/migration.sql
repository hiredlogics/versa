-- CreateTable
CREATE TABLE "UserLeadContext" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "companyName" TEXT,
    "websiteUrl" TEXT,
    "businessDescription" TEXT,
    "targetMarket" TEXT,
    "mainOffer" TEXT,
    "targetIndustries" JSONB NOT NULL DEFAULT '[]',
    "targetCountries" JSONB NOT NULL DEFAULT '[]',
    "companySizeMin" INTEGER,
    "companySizeMax" INTEGER,
    "targetTitles" JSONB NOT NULL DEFAULT '[]',
    "targetSeniorities" JSONB NOT NULL DEFAULT '[]',
    "excludedIndustries" JSONB NOT NULL DEFAULT '[]',
    "excludedTitles" JSONB NOT NULL DEFAULT '[]',
    "preferredBuyingSignals" JSONB NOT NULL DEFAULT '[]',
    "highQualityLeadNotes" TEXT,
    "badLeadNotes" TEXT,
    "preferredOutreachAngle" TEXT,
    "servicesToSell" JSONB NOT NULL DEFAULT '[]',
    "minLeadScore" INTEGER NOT NULL DEFAULT 8,
    "onboardingCompleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserLeadContext_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "UserLeadContext_userId_key" ON "UserLeadContext"("userId");

-- CreateIndex
CREATE INDEX "UserLeadContext_userId_idx" ON "UserLeadContext"("userId");

-- AddForeignKey
ALTER TABLE "UserLeadContext" ADD CONSTRAINT "UserLeadContext_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
