-- Track provider email confidence ("verified" vs pattern-guessed) per lead.
ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "emailStatus" TEXT;
