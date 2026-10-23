-- CreateTable
CREATE TABLE "UnlockedContact" (
    "id" TEXT NOT NULL,
    "apolloPersonId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "company" TEXT NOT NULL,
    "industry" TEXT,
    "employees" INTEGER,
    "location" TEXT,
    "email" TEXT,
    "emailStatus" TEXT,
    "linkedinUrl" TEXT,
    "rawApolloData" JSONB,
    "unlockedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UnlockedContact_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "UnlockedContact_apolloPersonId_key" ON "UnlockedContact"("apolloPersonId");

-- CreateIndex
CREATE INDEX "UnlockedContact_email_idx" ON "UnlockedContact"("email");

-- CreateIndex
CREATE INDEX "UnlockedContact_createdAt_idx" ON "UnlockedContact"("createdAt" DESC);
