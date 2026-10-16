-- Phase A: add profile snapshot to lead pool
ALTER TABLE "LeadPoolPerson" ADD COLUMN IF NOT EXISTS "profile" JSONB;
