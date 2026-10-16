-- Phase B: add jobRequirements JSON to LeadSearch
ALTER TABLE "LeadSearch" ADD COLUMN IF NOT EXISTS "jobRequirements" JSONB;
