import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const holds = await prisma.creditHold.count();
console.log("CreditHold table reachable, rows:", holds);

const [enumValues] = await prisma.$queryRawUnsafe(`
  SELECT string_agg(e.enumlabel, ',' ORDER BY e.enumsortorder) AS values
  FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
  WHERE t.typname = 'SearchStatus'
`);
console.log("SearchStatus:", enumValues.values);

const cols = await prisma.$queryRawUnsafe(`
  SELECT column_name FROM information_schema.columns
  WHERE table_name = 'LeadSearch'
    AND column_name IN ('brief','questions','answers','nextPage','batchesDone','totalPages','statusNote')
  ORDER BY column_name
`);
console.log("LeadSearch new columns:", cols.map((c) => c.column_name).join(", "));

const [why] = await prisma.$queryRawUnsafe(`
  SELECT column_name, column_default FROM information_schema.columns
  WHERE table_name = 'Lead' AND column_name = 'whySource'
`);
console.log("Lead.whySource default:", why?.column_default ?? "MISSING");

const idx = await prisma.$queryRawUnsafe(`
  SELECT indexdef FROM pg_indexes
  WHERE tablename = 'Lead' AND indexname = 'Lead_searchId_apolloPersonId_key'
`);
console.log("partial unique index:", idx[0]?.indexdef ?? "MISSING");

await prisma.$disconnect();
