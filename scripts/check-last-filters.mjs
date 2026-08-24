import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const searches = await prisma.leadSearch.findMany({
  orderBy: { createdAt: "desc" },
  take: 3,
  select: { createdAt: true, status: true, prompt: true, apolloFilters: true, leadsReturned: true },
});

for (const s of searches) {
  const filters = { ...(s.apolloFilters ?? {}) };
  delete filters._progress;
  console.log(`\n${s.createdAt.toISOString()} ${s.status} saved=${s.leadsReturned}`);
  console.log("prompt:", s.prompt.replace(/\s+/g, " ").slice(0, 200));
  console.log("filters:", JSON.stringify(filters));
}

await prisma.$disconnect();
