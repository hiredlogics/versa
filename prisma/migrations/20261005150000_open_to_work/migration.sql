-- Phase D: add openToWorkLevel and openToWorkReasons to Lead, and create GithubActivityCache table
ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "openToWorkLevel" TEXT;
ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "openToWorkReasons" TEXT[] DEFAULT ARRAY[]::TEXT[];

CREATE TABLE IF NOT EXISTS "GithubActivityCache" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "recentEvents" INTEGER NOT NULL,
    "checkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GithubActivityCache_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "GithubActivityCache_username_key" ON "GithubActivityCache"("username");
CREATE INDEX IF NOT EXISTS "GithubActivityCache_username_idx" ON "GithubActivityCache"("username");
