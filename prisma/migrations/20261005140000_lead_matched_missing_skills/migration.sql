-- Phase C: add matchedSkills and missingSkills to Lead
ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "matchedSkills" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "missingSkills" TEXT[] DEFAULT ARRAY[]::TEXT[];
