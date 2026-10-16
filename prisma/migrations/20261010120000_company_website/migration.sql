-- Employer website for each lead and each pooled person
ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "companyWebsite" TEXT;
ALTER TABLE "LeadPoolPerson" ADD COLUMN IF NOT EXISTS "companyWebsite" TEXT;
