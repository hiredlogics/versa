import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const [{ version }] = await prisma.$queryRawUnsafe("SELECT version()");
console.log("postgres:", version.split(",")[0]);

const groups = await prisma.$queryRawUnsafe(`
  SELECT COUNT(*)::int AS "dupGroups", COALESCE(SUM(n - 1), 0)::int AS "redundantRows"
  FROM (
    SELECT COUNT(*) AS n
    FROM "Lead"
    WHERE "apolloPersonId" IS NOT NULL AND "deletedAt" IS NULL
    GROUP BY "searchId", "apolloPersonId"
    HAVING COUNT(*) > 1
  ) g
`);

const { dupGroups, redundantRows } = groups[0];
console.log(`duplicate groups: ${dupGroups}`);
console.log(`redundant rows to soft-delete: ${redundantRows}`);
console.log(
  redundantRows > 0
    ? "ACTION: soft-delete redundant copies before creating the unique index."
    : "OK: unique index can be created safely."
);

await prisma.$disconnect();
