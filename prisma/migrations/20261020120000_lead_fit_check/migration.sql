-- Relevance check result for each lead: "match", "partial" or "no", and a short reason
ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "fitVerdict" TEXT;
ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "fitReason" TEXT;
