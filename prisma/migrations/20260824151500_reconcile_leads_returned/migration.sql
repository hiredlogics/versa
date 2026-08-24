-- Soft-deleting duplicate leads leaves LeadSearch.leadsReturned stale: a search
-- that recorded 100 may now have 95 live rows. The batch budget is computed as
-- min(BATCH_SIZE, requestedTotal - leadsReturned), so an inflated counter
-- silently short-delivers the user. Make the counter derived from live rows.
UPDATE "LeadSearch" s
SET "leadsReturned" = COALESCE(c.n, 0)
FROM (
  SELECT "searchId", COUNT(*) AS n
  FROM "Lead"
  WHERE "deletedAt" IS NULL
  GROUP BY "searchId"
) c
WHERE s.id = c."searchId" AND s."leadsReturned" <> c.n;

-- Searches whose leads are all soft-deleted have no row in the aggregate above.
UPDATE "LeadSearch" s
SET "leadsReturned" = 0
WHERE s."leadsReturned" <> 0
  AND NOT EXISTS (
    SELECT 1 FROM "Lead" l WHERE l."searchId" = s.id AND l."deletedAt" IS NULL
  );
