import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const searches = await prisma.leadSearch.findMany({
  orderBy: { createdAt: "desc" },
  take: 4,
  select: { id: true, createdAt: true, status: true, leadsReturned: true },
});

for (const s of searches) {
  const grouped = await prisma.lead.groupBy({
    by: ["emailStatus"],
    where: { searchId: s.id },
    _count: { _all: true },
  });
  const counts =
    grouped.map((g) => `${g.emailStatus ?? "NULL"}=${g._count._all}`).join(", ") || "(no leads)";
  console.log(`${s.createdAt.toISOString()} ${s.status} saved=${s.leadsReturned} | ${counts}`);
}

const total = await prisma.lead.groupBy({ by: ["emailStatus"], _count: { _all: true } });
console.log(
  "ALL LEADS:",
  total.map((g) => `${g.emailStatus ?? "NULL"}=${g._count._all}`).join(", ")
);

await prisma.$disconnect();
