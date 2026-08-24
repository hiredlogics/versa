-- Postgres 12+ allows ADD VALUE inside a transaction as long as the new value is
-- not referenced in the same transaction. It is not referenced below.
ALTER TYPE "SearchStatus" ADD VALUE IF NOT EXISTS 'NEEDS_INFO';

DO $$ BEGIN
  CREATE TYPE "HoldStatus" AS ENUM ('HELD', 'CHARGED', 'RELEASED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "WhySource" AS ENUM ('TEMPLATE', 'AI');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- LeadSearch: the stored brief plus per-batch cursor state.
ALTER TABLE "LeadSearch" ADD COLUMN IF NOT EXISTS "brief" JSONB;
ALTER TABLE "LeadSearch" ADD COLUMN IF NOT EXISTS "questions" JSONB;
ALTER TABLE "LeadSearch" ADD COLUMN IF NOT EXISTS "answers" JSONB;
ALTER TABLE "LeadSearch" ADD COLUMN IF NOT EXISTS "nextPage" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "LeadSearch" ADD COLUMN IF NOT EXISTS "batchesDone" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "LeadSearch" ADD COLUMN IF NOT EXISTS "totalPages" INTEGER;
ALTER TABLE "LeadSearch" ADD COLUMN IF NOT EXISTS "statusNote" TEXT;

ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "whySource" "WhySource" NOT NULL DEFAULT 'TEMPLATE';

CREATE TABLE IF NOT EXISTS "CreditHold" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "searchId" TEXT NOT NULL,
  "amount" INTEGER NOT NULL,
  "charged" INTEGER,
  "status" "HoldStatus" NOT NULL DEFAULT 'HELD',
  "idempotencyKey" TEXT NOT NULL,
  "periodStart" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "settledAt" TIMESTAMP(3),
  CONSTRAINT "CreditHold_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "CreditHold_idempotencyKey_key"
  ON "CreditHold"("idempotencyKey");
CREATE INDEX IF NOT EXISTS "CreditHold_userId_status_idx"
  ON "CreditHold"("userId", "status");
CREATE INDEX IF NOT EXISTS "CreditHold_status_createdAt_idx"
  ON "CreditHold"("status", "createdAt");

DO $$ BEGIN
  ALTER TABLE "CreditHold" ADD CONSTRAINT "CreditHold_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "CreditHold" ADD CONSTRAINT "CreditHold_searchId_fkey"
    FOREIGN KEY ("searchId") REFERENCES "LeadSearch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- The old pipeline called createMany without skipDuplicates and had no
-- constraint, so live rows may violate the index below. Soft-delete the
-- redundant copies first, keeping the best-scored, most recently updated one.
-- Soft rather than hard so it stays reversible.
UPDATE "Lead" l
SET "deletedAt" = NOW()
FROM (
  SELECT id, ROW_NUMBER() OVER (
    PARTITION BY "searchId", "apolloPersonId"
    ORDER BY "leadScore" DESC, "updatedAt" DESC
  ) AS rn
  FROM "Lead"
  WHERE "apolloPersonId" IS NOT NULL AND "deletedAt" IS NULL
) dup
WHERE l.id = dup.id AND dup.rn > 1;

-- Excluding soft-deleted rows means deleting a lead frees its slot, so a user
-- who deletes someone and re-runs the batch can get them back.
CREATE UNIQUE INDEX IF NOT EXISTS "Lead_searchId_apolloPersonId_key"
  ON "Lead"("searchId", "apolloPersonId")
  WHERE "apolloPersonId" IS NOT NULL AND "deletedAt" IS NULL;
