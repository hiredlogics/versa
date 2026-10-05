-- Pros and cons behind each lead score
ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "scorePros" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "scoreCons" TEXT[] DEFAULT ARRAY[]::TEXT[];
